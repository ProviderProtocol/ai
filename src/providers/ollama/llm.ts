import type {
  LLMHandler,
  BoundLLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamResult,
  LLMCapabilities,
} from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { OllamaLLMParams, OllamaResponse, OllamaStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamChunk,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

/**
 * Ollama API capabilities
 * Note: Tool calling is disabled - Ollama recommends using their
 * OpenAI-compatible API (/v1/chat/completions) for tool calling.
 * Use the OpenAI provider with baseUrl pointed to Ollama for tools.
 */
const OLLAMA_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: false,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Parse Ollama's newline-delimited JSON stream
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
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
        yield chunk;
      } catch {
        // Skip invalid JSON
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create Ollama LLM handler
 */
export function createLLMHandler(): LLMHandler<OllamaLLMParams> {
  // Provider reference injected by createProvider() after construction
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
          'INVALID_REQUEST',
          'ollama',
          'llm'
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

          const data = (await response.json()) as OllamaResponse;
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
                  'PROVIDER_ERROR',
                  'ollama',
                  'llm'
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
                    'PROVIDER_ERROR',
                    'ollama',
                    'llm'
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
              responseReject(error as Error);
              throw error;
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
