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
import type { XAIResponsesParams, XAIResponsesResponse, XAIResponsesStreamEvent, XAIResponseErrorEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.responses.ts';

/** Base URL for the xAI Responses API endpoint. */
const XAI_RESPONSES_API_URL = 'https://api.x.ai/v1/responses';

/**
 * Capability declarations for the xAI Responses API.
 * Indicates which features are supported by this OpenAI Responses-compatible API mode.
 */
const XAI_RESPONSES_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: false,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates an LLM handler for the xAI Responses API (OpenAI Responses-compatible).
 *
 * The Responses API provides stateful conversation support, allowing you to
 * continue conversations across requests using `previous_response_id`. This
 * is useful for building applications that need to maintain context over
 * extended interactions.
 *
 * @returns An LLM handler configured for the Responses API
 *
 * @example
 * ```typescript
 * import { xai } from './providers/xai';
 * import { llm } from './core/llm';
 *
 * // Initial request
 * const model = llm({
 *   model: xai('grok-4', { api: 'responses' }),
 *   params: {
 *     max_output_tokens: 1000,
 *     store: true, // Enable stateful storage
 *   }
 * });
 *
 * const turn = await model.generate('Hello!');
 * const responseId = turn.response.message.metadata?.xai?.response_id;
 *
 * // Continue the conversation
 * const continuedModel = llm({
 *   model: xai('grok-4', { api: 'responses' }),
 *   params: {
 *     previous_response_id: responseId,
 *   }
 * });
 * ```
 *
 * @see {@link createCompletionsLLMHandler} for OpenAI Chat Completions mode
 * @see {@link createMessagesLLMHandler} for Anthropic-compatible mode
 */
export function createResponsesLLMHandler(): LLMHandler<XAIResponsesParams> {
  let providerRef: LLMProvider<XAIResponsesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<XAIResponsesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<XAIResponsesParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'xai',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<XAIResponsesParams> = {
        modelId,
        capabilities: XAI_RESPONSES_CAPABILITIES,

        get provider(): LLMProvider<XAIResponsesParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<XAIResponsesParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'XAI_API_KEY',
            'xai',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? XAI_RESPONSES_API_URL;
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
            'xai',
            'llm'
          );

          const data = await parseJsonResponse<XAIResponsesResponse>(response, 'xai', 'llm');

          // Check for error in response
          if (data.status === 'failed') {
            const message = data.error?.message ?? 'Provider returned a failed response.';
            throw new UPPError(
              message,
              ErrorCode.ProviderError,
              'xai',
              ModalityType.LLM
            );
          }

          return transformResponse(data);
        },

        stream(request: LLMRequest<XAIResponsesParams>): LLMStreamResult {
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
                'XAI_API_KEY',
                'xai',
                'llm'
              );

              const baseUrl = request.config.baseUrl ?? XAI_RESPONSES_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;

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
                'xai',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'xai', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  ErrorCode.ProviderError,
                  'xai',
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

                // Check for xAI error event
                if (typeof data === 'object' && data !== null) {
                  const event = data as XAIResponsesStreamEvent;

                  // Check for error event
                  if (event.type === 'error') {
                    const errorEvent = event as XAIResponseErrorEvent;
                    const error = new UPPError(
                      errorEvent.error.message,
                      ErrorCode.ProviderError,
                      'xai',
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
