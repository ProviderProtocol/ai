/**
 * @fileoverview Ollama LLM handler implementation.
 *
 * This module provides the core LLM functionality for the Ollama provider,
 * including both synchronous completion and streaming capabilities. It
 * communicates with Ollama's native `/api/chat` endpoint.
 *
 * @module providers/ollama/llm
 */

import type {
  BoundLLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamResult,
  LLMCapabilities,
} from '../../types/llm.ts';
import type { LLMHandler } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { OllamaLLMParams, OllamaResponse, OllamaStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamChunk,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

/** Default Ollama server URL for local installations. */
const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

/**
 * Capability flags for the Ollama provider.
 *
 * **Important:** Tool calling is intentionally disabled. Ollama recommends
 * using their OpenAI-compatible API (`/v1/chat/completions`) for function
 * calling. To use tools with Ollama, configure the OpenAI provider with
 * `baseUrl` pointed to your Ollama instance.
 */
const OLLAMA_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: false,
  structuredOutput: true,
  imageInput: true,
  documentInput: false,
  videoInput: false,
  audioInput: false,
};

/**
 * Parses Ollama's newline-delimited JSON (NDJSON) stream format.
 *
 * Ollama uses NDJSON where each line is a complete JSON object representing
 * a streaming chunk. This generator reads the stream incrementally, buffering
 * incomplete lines and yielding parsed chunks as they become available.
 *
 * @param body - The raw ReadableStream from the fetch response
 * @yields Parsed Ollama stream chunks
 */
async function* parseOllamaStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OllamaStreamChunk, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (Ollama uses newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const chunk = JSON.parse(trimmed) as OllamaStreamChunk;
          yield chunk;
        } catch (error) {
          throw new UPPError(
            'Invalid JSON in Ollama stream',
            ErrorCode.InvalidResponse,
            'ollama',
            ModalityType.LLM,
            undefined,
            toError(error)
          );
        }
      }
    }

    buffer += decoder.decode();
    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
        yield chunk;
      } catch (error) {
        throw new UPPError(
          'Invalid JSON in Ollama stream',
          ErrorCode.InvalidResponse,
          'ollama',
          ModalityType.LLM,
          undefined,
          toError(error)
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Creates the Ollama LLM handler for chat completions.
 *
 * This factory function creates an LLM handler that communicates with
 * Ollama's `/api/chat` endpoint. The handler supports both synchronous
 * completions and streaming responses.
 *
 * The handler is designed to be used with `createProvider()` which injects
 * the provider reference after construction.
 *
 * @returns An LLM handler configured for Ollama
 *
 * @example
 * ```typescript
 * const handler = createLLMHandler();
 * const provider = createProvider({
 *   name: 'ollama',
 *   version: '1.0.0',
 *   handlers: { llm: handler }
 * });
 * ```
 */
export function createLLMHandler(): LLMHandler<OllamaLLMParams> {
  let providerRef: LLMProvider<OllamaLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OllamaLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OllamaLLMParams> {
      // Use the injected provider reference (set by createProvider)
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'ollama',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<OllamaLLMParams> = {
        modelId,
        capabilities: OLLAMA_CAPABILITIES,

        get provider(): LLMProvider<OllamaLLMParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<OllamaLLMParams>): Promise<LLMResponse> {
          // Ollama doesn't require an API key by default, but may use one for auth
          let apiKey: string | undefined;
          try {
            apiKey = await resolveApiKey(
              request.config,
              'OLLAMA_API_KEY',
              'ollama',
              'llm'
            );
          } catch {
            // API key is optional for Ollama
          }

          const baseUrl = request.config.baseUrl ?? OLLAMA_DEFAULT_URL;
          const url = `${baseUrl}/api/chat`;
          const body = transformRequest(request, modelId);
          body.stream = false;

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }

          if (request.config.headers) {
            for (const [key, value] of Object.entries(request.config.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }
          }

          const response = await doFetch(
            url,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'ollama',
            'llm'
          );

          const data = await parseJsonResponse<OllamaResponse>(response, 'ollama', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<OllamaLLMParams>): LLMStreamResult {
          const state = createStreamState();
          let responseResolve: (value: LLMResponse) => void;
          let responseReject: (error: Error) => void;

          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            responseResolve = resolve;
            responseReject = reject;
          });

          async function* generateEvents(): AsyncGenerator<StreamEvent, void, unknown> {
            try {
              // Ollama doesn't require an API key by default
              let apiKey: string | undefined;
              try {
                apiKey = await resolveApiKey(
                  request.config,
                  'OLLAMA_API_KEY',
                  'ollama',
                  'llm'
                );
              } catch {
                // API key is optional for Ollama
              }

              const baseUrl = request.config.baseUrl ?? OLLAMA_DEFAULT_URL;
              const url = `${baseUrl}/api/chat`;
              const body = transformRequest(request, modelId);
              body.stream = true;

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };

              if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
              }

              if (request.config.headers) {
                for (const [key, value] of Object.entries(request.config.headers)) {
                  if (value !== undefined) {
                    headers[key] = value;
                  }
                }
              }

              const response = await doStreamFetch(
                url,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(body),
                  signal: request.signal,
                },
                request.config,
                'ollama',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'ollama', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  ErrorCode.ProviderError,
                  'ollama',
                  ModalityType.LLM
                );
                responseReject(error);
                throw error;
              }

              // Parse Ollama's newline-delimited JSON stream
              for await (const chunk of parseOllamaStream(response.body)) {
                // Check for error in chunk
                if ('error' in chunk && typeof (chunk as Record<string, unknown>).error === 'string') {
                  const error = new UPPError(
                    (chunk as Record<string, unknown>).error as string,
                    ErrorCode.ProviderError,
                    'ollama',
                    ModalityType.LLM
                  );
                  responseReject(error);
                  throw error;
                }

                const events = transformStreamChunk(chunk, state);
                for (const event of events) {
                  yield event;
                }
              }

              // Build final response
              responseResolve(buildResponseFromState(state));
            } catch (error) {
              const err = toError(error);
              responseReject(err);
              throw err;
            }
          }

          return {
            [Symbol.asyncIterator]() {
              return generateEvents();
            },
            response: responsePromise,
          };
        },
      };

      return model;
    },
  };
}
