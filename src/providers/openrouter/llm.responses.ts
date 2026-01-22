/**
 * OpenRouter Responses API LLM handler.
 *
 * This module implements the LLMHandler interface for OpenRouter's Responses API,
 * which is currently in beta and provides additional features like reasoning support.
 *
 * @module llm.responses
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
import type { OpenRouterResponsesParams, OpenRouterResponsesResponse, OpenRouterResponsesStreamEvent, OpenRouterResponseErrorEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.responses.ts';

/** Base URL for OpenRouter's Responses API endpoint (beta). */
const OPENROUTER_RESPONSES_API_URL = 'https://openrouter.ai/api/v1/responses';

/**
 * Capability flags for the OpenRouter Responses API.
 *
 * The Responses API supports streaming, function calling (tools), structured JSON output,
 * image inputs, document/PDF inputs, audio inputs, video inputs, and reasoning models.
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
 * Creates an LLM handler for OpenRouter's Responses API (beta).
 *
 * The Responses API provides a different interface than Chat Completions,
 * with features like reasoning effort configuration and different output formats.
 *
 * @returns An LLMHandler configured for OpenRouter Responses API
 *
 * @example
 * ```typescript
 * const handler = createResponsesLLMHandler();
 * handler._setProvider(provider);
 * const model = handler.bind('openai/gpt-4o');
 * const response = await model.complete(request);
 * ```
 */
export function createResponsesLLMHandler(): LLMHandler<OpenRouterResponsesParams> {
  let providerRef: LLMProvider<OpenRouterResponsesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OpenRouterResponsesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OpenRouterResponsesParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'openrouter',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<OpenRouterResponsesParams> = {
        modelId,
        capabilities: OPENROUTER_CAPABILITIES,

        get provider(): LLMProvider<OpenRouterResponsesParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<OpenRouterResponsesParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENROUTER_API_KEY',
            'openrouter',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? OPENROUTER_RESPONSES_API_URL;
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

          const data = await parseJsonResponse<OpenRouterResponsesResponse>(response, 'openrouter', 'llm');

          // Check for error in response
          if (data.status === 'failed') {
            const message = data.error?.message ?? 'Provider returned a failed response.';
            throw new UPPError(
              message,
              ErrorCode.ProviderError,
              'openrouter',
              ModalityType.LLM
            );
          }

          return transformResponse(data);
        },

        stream(request: LLMRequest<OpenRouterResponsesParams>): LLMStreamResult {
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

              const baseUrl = request.config.baseUrl ?? OPENROUTER_RESPONSES_API_URL;
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
                  const event = data as OpenRouterResponsesStreamEvent;

                  // Check for error event
                  if (event.type === 'error') {
                    const errorEvent = event as OpenRouterResponseErrorEvent;
                    const error = new UPPError(
                      errorEvent.error.message,
                      ErrorCode.ProviderError,
                      'openrouter',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(event, state);
                  for (const uppEvent of uppEvents) {
                    yield uppEvent;
                    // Also emit ObjectDelta for structured output - gives developers explicit hook
                    if (request.structure && uppEvent.type === StreamEventType.TextDelta) {
                      yield objectDelta(uppEvent.delta.text ?? '', uppEvent.index);
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
