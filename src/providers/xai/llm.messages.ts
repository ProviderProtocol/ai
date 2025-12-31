import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { XAIMessagesParams, XAIMessagesResponse, XAIMessagesStreamEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.messages.ts';

const XAI_MESSAGES_API_URL = 'https://api.x.ai/v1/messages';

/**
 * xAI Messages API capabilities (Anthropic-compatible)
 */
const XAI_MESSAGES_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Create xAI Messages API LLM handler (Anthropic-compatible)
 */
export function createMessagesLLMHandler(): LLMHandler<XAIMessagesParams> {
  // Provider reference injected by createProvider() or xAI's custom factory
  let providerRef: LLMProvider<XAIMessagesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<XAIMessagesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<XAIMessagesParams> {
      // Use the injected provider reference
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          'INVALID_REQUEST',
          'xai',
          'llm'
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

          const response = await doFetch(
            baseUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'xai',
            'llm'
          );

          const data = (await response.json()) as XAIMessagesResponse;
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

              const response = await doStreamFetch(
                baseUrl,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                  },
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
                  'PROVIDER_ERROR',
                  'xai',
                  'llm'
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
                      'PROVIDER_ERROR',
                      'xai',
                      'llm'
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvent = transformStreamEvent(event, state);
                  if (uppEvent) {
                    yield uppEvent;
                  }
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
