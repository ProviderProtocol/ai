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
import type { XAIMessagesParams, XAIMessagesResponse, XAIMessagesStreamEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.messages.ts';

/** Base URL for the xAI Messages API endpoint. */
const XAI_MESSAGES_API_URL = 'https://api.x.ai/v1/messages';

/**
 * Capability declarations for the xAI Messages API.
 * Indicates which features are supported by this Anthropic-compatible API mode.
 */
const XAI_MESSAGES_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: false,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates an LLM handler for the xAI Messages API (Anthropic-compatible).
 *
 * The Messages API provides compatibility with Anthropic's Messages API,
 * making it easy for developers migrating from Claude to use xAI's Grok models
 * with minimal code changes.
 *
 * @returns An LLM handler configured for the Messages API
 *
 * @example
 * ```typescript
 * import { xai } from './providers/xai';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: xai('grok-4', { api: 'messages' }),
 *   params: {
 *     max_tokens: 1000,
 *     thinking: { type: 'enabled', budget_tokens: 500 }, // Extended thinking
 *   }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @see {@link createCompletionsLLMHandler} for OpenAI-compatible mode
 * @see {@link createResponsesLLMHandler} for stateful Responses API mode
 */
export function createMessagesLLMHandler(): LLMHandler<XAIMessagesParams> {
  let providerRef: LLMProvider<XAIMessagesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<XAIMessagesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<XAIMessagesParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'xai',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<XAIMessagesParams> = {
        modelId,
        capabilities: XAI_MESSAGES_CAPABILITIES,

        get provider(): LLMProvider<XAIMessagesParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<XAIMessagesParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'XAI_API_KEY',
            'xai',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? XAI_MESSAGES_API_URL;
          const body = transformRequest(request, modelId);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
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

          const data = await parseJsonResponse<XAIMessagesResponse>(response, 'xai', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<XAIMessagesParams>): LLMStreamResult {
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

              const baseUrl = request.config.baseUrl ?? XAI_MESSAGES_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
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
                // Check for xAI error event
                if (typeof data === 'object' && data !== null && 'type' in data) {
                  const event = data as XAIMessagesStreamEvent;

                  if (event.type === 'error') {
                    const error = new UPPError(
                      event.error.message,
                      ErrorCode.ProviderError,
                      'xai',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvent = transformStreamEvent(event, state);
                  if (uppEvent) {
                    if (request.structure && uppEvent.type === StreamEventType.TextDelta) {
                      // Emit ObjectDelta without parsing - middleware handles parsing
                      yield objectDelta(uppEvent.delta.text ?? '', uppEvent.index);
                    } else {
                      yield uppEvent;
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
