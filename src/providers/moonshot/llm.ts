/**
 * @fileoverview Moonshot Chat Completions API Handler
 *
 * This module implements the LLM handler for Moonshot's Chat Completions API
 * (OpenAI-compatible at `https://api.moonshot.ai/v1/chat/completions`).
 *
 * @see {@link https://platform.moonshot.ai/docs/api/chat Moonshot API Reference}
 * @module providers/moonshot/llm
 */

import type { BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { LLMHandler } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType, objectDelta } from '../../types/stream.ts';
import type { LLMProvider, ProviderConfig } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { MoonshotLLMParams, MoonshotResponse, MoonshotStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

/** Base URL for Moonshot's Chat Completions API endpoint (global) */
const MOONSHOT_API_URL = 'https://api.moonshot.ai/v1/chat/completions';

/**
 * Capability declaration for the Moonshot Chat Completions API.
 *
 * Defines what features are supported by this handler:
 * - Streaming: Real-time token-by-token response streaming via SSE
 * - Tools: Function calling for structured interactions
 * - Structured Output: JSON schema-based response formatting
 * - Image Input: Native vision via MoonViT encoder
 * - Video Input: Experimental video support
 */
const MOONSHOT_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: false,
  videoInput: true,
  audioInput: false,
};

/**
 * Resolves the Moonshot API key from config or environment variables.
 *
 * Checks in order:
 * 1. config.apiKey (if provided)
 * 2. MOONSHOT_API_KEY environment variable
 * 3. KIMI_API_KEY environment variable (fallback)
 *
 * @param config - Provider configuration
 * @returns The API key
 * @throws UPPError if no API key is found
 */
async function resolveMoonshotApiKey(config: ProviderConfig): Promise<string> {
  // First try the standard resolution with MOONSHOT_API_KEY
  try {
    return await resolveApiKey(config, 'MOONSHOT_API_KEY', 'moonshot', 'llm');
  } catch {
    // Fall back to KIMI_API_KEY
    const kimiKey = process.env.KIMI_API_KEY;
    if (kimiKey) {
      return kimiKey;
    }

    throw new UPPError(
      'API key not found. Set MOONSHOT_API_KEY or KIMI_API_KEY environment variable, or pass apiKey in config.',
      ErrorCode.AuthenticationFailed,
      'moonshot',
      ModalityType.LLM
    );
  }
}

/**
 * Creates an LLM handler for Moonshot's Chat Completions API.
 *
 * This factory function creates a handler that communicates with the
 * `/v1/chat/completions` endpoint. The handler supports both synchronous
 * completion requests and streaming responses.
 *
 * @returns An LLM handler configured for the Moonshot API
 *
 * @example
 * ```typescript
 * const handler = createLLMHandler();
 * const model = handler.bind('kimi-k2.5');
 *
 * // Synchronous completion
 * const response = await model.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   config: { apiKey: 'sk-...' }
 * });
 *
 * // Streaming completion
 * const stream = model.stream({
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 *   config: { apiKey: 'sk-...' }
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 */
export function createLLMHandler(): LLMHandler<MoonshotLLMParams> {
  let providerRef: LLMProvider<MoonshotLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<MoonshotLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<MoonshotLLMParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'moonshot',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<MoonshotLLMParams> = {
        modelId,
        capabilities: MOONSHOT_CAPABILITIES,

        get provider(): LLMProvider<MoonshotLLMParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<MoonshotLLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveMoonshotApiKey(request.config);

          const baseUrl = request.config.baseUrl ?? MOONSHOT_API_URL;
          const body = transformRequest(request, modelId);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          };

          if (request.config.headers) {
            for (const [key, value] of Object.entries(request.config.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }
          }

          const response = await doFetch(
            baseUrl,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'moonshot',
            'llm'
          );

          const data = await parseJsonResponse<MoonshotResponse>(response, 'moonshot', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<MoonshotLLMParams>): LLMStreamResult {
          const state = createStreamState();
          let responseResolve: (value: LLMResponse) => void;
          let responseReject: (error: Error) => void;

          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            responseResolve = resolve;
            responseReject = reject;
          });

          async function* generateEvents(): AsyncGenerator<StreamEvent, void, unknown> {
            try {
              const apiKey = await resolveMoonshotApiKey(request.config);

              const baseUrl = request.config.baseUrl ?? MOONSHOT_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;
              body.stream_options = { include_usage: true };

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                Accept: 'text/event-stream',
              };

              if (request.config.headers) {
                for (const [key, value] of Object.entries(request.config.headers)) {
                  if (value !== undefined) {
                    headers[key] = value;
                  }
                }
              }

              const response = await doStreamFetch(
                baseUrl,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(body),
                  signal: request.signal,
                },
                request.config,
                'moonshot',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'moonshot', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  ErrorCode.ProviderError,
                  'moonshot',
                  ModalityType.LLM
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                // Skip [DONE] marker
                if (data === '[DONE]') {
                  continue;
                }

                // Check for Moonshot error event
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as MoonshotStreamChunk;

                  // Check for error in chunk
                  if ('error' in chunk && chunk.error) {
                    const errorData = chunk.error as { message?: string; type?: string };
                    const error = new UPPError(
                      errorData.message ?? 'Unknown error',
                      ErrorCode.ProviderError,
                      'moonshot',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(chunk, state);
                  for (const event of uppEvents) {
                    yield event;
                    // Also emit ObjectDelta for structured output - gives developers explicit hook
                    if (request.structure && event.type === StreamEventType.TextDelta) {
                      yield objectDelta(event.delta.text ?? '', event.index);
                    }
                  }
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
