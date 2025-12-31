import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { XAIResponsesParams, XAIResponsesResponse, XAIResponsesStreamEvent, XAIResponseErrorEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.responses.ts';

const XAI_RESPONSES_API_URL = 'https://api.x.ai/v1/responses';

/**
 * xAI Responses API capabilities
 */
const XAI_RESPONSES_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Create xAI Responses API LLM handler
 */
export function createResponsesLLMHandler(): LLMHandler<XAIResponsesParams> {
  // Provider reference injected by createProvider() or xAI's custom factory
  let providerRef: LLMProvider<XAIResponsesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<XAIResponsesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<XAIResponsesParams> {
      // Use the injected provider reference
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          'INVALID_REQUEST',
          'xai',
          'llm'
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

          const response = await doFetch(
            baseUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'xai',
            'llm'
          );

          const data = (await response.json()) as XAIResponsesResponse;

          // Check for error in response
          if (data.status === 'failed' && data.error) {
            throw new UPPError(
              data.error.message,
              'PROVIDER_ERROR',
              'xai',
              'llm'
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

              const response = await doStreamFetch(
                baseUrl,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
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
                      'PROVIDER_ERROR',
                      'xai',
                      'llm'
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(event, state);
                  for (const uppEvent of uppEvents) {
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
