import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { OpenRouterLLMParams, OpenRouterResponsesResponse, OpenRouterResponsesStreamEvent, OpenRouterResponseErrorEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.responses.ts';

const OPENROUTER_RESPONSES_API_URL = 'https://openrouter.ai/api/v1/responses';

/**
 * OpenRouter API capabilities
 */
const OPENROUTER_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Create OpenRouter Responses API LLM handler
 */
export function createResponsesLLMHandler(): LLMHandler<OpenRouterLLMParams> {
  // Provider reference injected by createProvider() or OpenRouter's custom factory
  let providerRef: LLMProvider<OpenRouterLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OpenRouterLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OpenRouterLLMParams> {
      // Use the injected provider reference
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          'INVALID_REQUEST',
          'openrouter',
          'llm'
        );
      }

      const model: BoundLLMModel<OpenRouterLLMParams> = {
        modelId,
        capabilities: OPENROUTER_CAPABILITIES,

        get provider(): LLMProvider<OpenRouterLLMParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<OpenRouterLLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENROUTER_API_KEY',
            'openrouter',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? OPENROUTER_RESPONSES_API_URL;
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
            'openrouter',
            'llm'
          );

          const data = (await response.json()) as OpenRouterResponsesResponse;

          // Check for error in response
          if (data.status === 'failed' && data.error) {
            throw new UPPError(
              data.error.message,
              'PROVIDER_ERROR',
              'openrouter',
              'llm'
            );
          }

          return transformResponse(data);
        },

        stream(request: LLMRequest<OpenRouterLLMParams>): LLMStreamResult {
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
                  'PROVIDER_ERROR',
                  'openrouter',
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

                // Check for OpenRouter error event
                if (typeof data === 'object' && data !== null) {
                  const event = data as OpenRouterResponsesStreamEvent;

                  // Check for error event
                  if (event.type === 'error') {
                    const errorEvent = event as OpenRouterResponseErrorEvent;
                    const error = new UPPError(
                      errorEvent.error.message,
                      'PROVIDER_ERROR',
                      'openrouter',
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
