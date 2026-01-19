/**
 * OpenRouter Chat Completions API LLM handler.
 *
 * This module implements the LLMHandler interface for OpenRouter's Chat Completions API,
 * which is compatible with the OpenAI Chat Completions API format.
 *
 * @module llm.completions
 */

import type { BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { LLMHandler } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType, objectDelta } from '../../types/stream.ts';
import { parsePartialJson } from '../../utils/partial-json.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { OpenRouterCompletionsParams, OpenRouterCompletionsResponse, OpenRouterCompletionsStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.completions.ts';

/** Base URL for OpenRouter's Chat Completions API endpoint. */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Capability flags for the OpenRouter Chat Completions API.
 *
 * OpenRouter supports streaming, function calling (tools), structured JSON output,
 * image inputs, document/PDF inputs, audio inputs, and video inputs.
 */
const OPENROUTER_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: true,
  imageOutput: true,
  videoInput: true,
  audioInput: true,
};

/**
 * Creates an LLM handler for OpenRouter's Chat Completions API.
 *
 * This handler implements the UPP LLMHandler interface and provides
 * both synchronous completion and streaming capabilities.
 *
 * @returns An LLMHandler configured for OpenRouter Chat Completions
 *
 * @example
 * ```typescript
 * const handler = createCompletionsLLMHandler();
 * handler._setProvider(provider);
 * const model = handler.bind('openai/gpt-4o');
 * const response = await model.complete(request);
 * ```
 */
export function createCompletionsLLMHandler(): LLMHandler<OpenRouterCompletionsParams> {
  let providerRef: LLMProvider<OpenRouterCompletionsParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OpenRouterCompletionsParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OpenRouterCompletionsParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'openrouter',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<OpenRouterCompletionsParams> = {
        modelId,
        capabilities: OPENROUTER_CAPABILITIES,

        get provider(): LLMProvider<OpenRouterCompletionsParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<OpenRouterCompletionsParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENROUTER_API_KEY',
            'openrouter',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? OPENROUTER_API_URL;
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
            'openrouter',
            'llm'
          );

          const data = await parseJsonResponse<OpenRouterCompletionsResponse>(response, 'openrouter', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<OpenRouterCompletionsParams>): LLMStreamResult {
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
                'OPENROUTER_API_KEY',
                'openrouter',
                'llm'
              );

              const baseUrl = request.config.baseUrl ?? OPENROUTER_API_URL;
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
                'openrouter',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'openrouter', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  ErrorCode.ProviderError,
                  'openrouter',
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

                // Check for OpenRouter error event
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as OpenRouterCompletionsStreamChunk;

                  // Check for error in chunk
                  if ('error' in chunk && chunk.error) {
                    const errorData = chunk.error as { message?: string; type?: string };
                    const error = new UPPError(
                      errorData.message ?? 'Unknown error',
                      ErrorCode.ProviderError,
                      'openrouter',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(chunk, state);
                  for (const event of uppEvents) {
                    if (request.structure && event.type === StreamEventType.TextDelta) {
                      const parseResult = parsePartialJson(state.text);
                      yield objectDelta(event.delta.text ?? '', parseResult.value, event.index);
                    } else {
                      yield event;
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
