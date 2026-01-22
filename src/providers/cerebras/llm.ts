/**
 * @fileoverview Cerebras Chat Completions API Handler
 *
 * This module implements the LLM handler for Cerebras's Chat Completions API
 * (OpenAI-compatible at `/v1/chat/completions`).
 *
 * @see {@link https://inference-docs.cerebras.ai/introduction Cerebras API Reference}
 * @module providers/cerebras/llm
 */

import type { BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { LLMHandler } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType, objectDelta } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { CerebrasLLMParams, CerebrasResponse, CerebrasStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

/** Base URL for Cerebras's Chat Completions API endpoint */
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

/**
 * Capability declaration for the Cerebras Chat Completions API.
 *
 * Defines what features are supported by this handler:
 * - Streaming: Real-time token-by-token response streaming via SSE
 * - Tools: Function calling for structured interactions
 * - Structured Output: JSON schema-based response formatting
 * - Image Input: Not supported
 */
const CEREBRAS_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: false,
  documentInput: false,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates an LLM handler for Cerebras's Chat Completions API.
 *
 * This factory function creates a handler that communicates with the
 * `/v1/chat/completions` endpoint. The handler supports both synchronous
 * completion requests and streaming responses.
 *
 * @returns An LLM handler configured for the Cerebras API
 *
 * @example
 * ```typescript
 * const handler = createLLMHandler();
 * const model = handler.bind('llama-3.3-70b');
 *
 * // Synchronous completion
 * const response = await model.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   config: { apiKey: 'csk-...' }
 * });
 *
 * // Streaming completion
 * const stream = model.stream({
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 *   config: { apiKey: 'csk-...' }
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 */
export function createLLMHandler(): LLMHandler<CerebrasLLMParams> {
  let providerRef: LLMProvider<CerebrasLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<CerebrasLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<CerebrasLLMParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'cerebras',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<CerebrasLLMParams> = {
        modelId,
        capabilities: CEREBRAS_CAPABILITIES,

        get provider(): LLMProvider<CerebrasLLMParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<CerebrasLLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'CEREBRAS_API_KEY',
            'cerebras',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? CEREBRAS_API_URL;
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
            'cerebras',
            'llm'
          );

          const data = await parseJsonResponse<CerebrasResponse>(response, 'cerebras', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<CerebrasLLMParams>): LLMStreamResult {
          const state = createStreamState();
          let responseResolve: (value: LLMResponse) => void;
          let responseReject: (error: Error) => void;

          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            responseResolve = resolve;
            responseReject = reject;
          });

          async function* generateEvents(): AsyncGenerator<StreamEvent, void, unknown> {
            try {
              const apiKey = await resolveApiKey(
                request.config,
                'CEREBRAS_API_KEY',
                'cerebras',
                'llm'
              );

              const baseUrl = request.config.baseUrl ?? CEREBRAS_API_URL;
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
                'cerebras',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'cerebras', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  ErrorCode.ProviderError,
                  'cerebras',
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

                // Check for Cerebras error event
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as CerebrasStreamChunk;

                  // Check for error in chunk
                  if ('error' in chunk && chunk.error) {
                    const errorData = chunk.error as { message?: string; type?: string };
                    const error = new UPPError(
                      errorData.message ?? 'Unknown error',
                      ErrorCode.ProviderError,
                      'cerebras',
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
