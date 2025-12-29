import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { AnthropicLLMParams, AnthropicResponse, AnthropicStreamEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Create Anthropic LLM handler
 */
export function createLLMHandler(): LLMHandler<AnthropicLLMParams> {
  return {
    bind(modelId: string): BoundLLMModel<AnthropicLLMParams> {
      // We'll set the provider reference when the provider is created
      let providerRef: LLMProvider<AnthropicLLMParams>;

      const model: BoundLLMModel<AnthropicLLMParams> = {
        modelId,

        get provider(): LLMProvider<AnthropicLLMParams> {
          return providerRef;
        },

        async complete(request: LLMRequest<AnthropicLLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'ANTHROPIC_API_KEY',
            'anthropic',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? ANTHROPIC_API_URL;
          const body = transformRequest(request, modelId);

          const response = await doFetch(
            baseUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': request.config.apiVersion ?? ANTHROPIC_VERSION,
              },
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'anthropic',
            'llm'
          );

          const data = (await response.json()) as AnthropicResponse;
          return transformResponse(data);
        },

        stream(request: LLMRequest<AnthropicLLMParams>): LLMStreamResult {
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
                'ANTHROPIC_API_KEY',
                'anthropic',
                'llm'
              );

              const baseUrl = request.config.baseUrl ?? ANTHROPIC_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;

              const response = await doStreamFetch(
                baseUrl,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': request.config.apiVersion ?? ANTHROPIC_VERSION,
                  },
                  body: JSON.stringify(body),
                  signal: request.signal,
                },
                request.config,
                'anthropic',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'anthropic', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  'PROVIDER_ERROR',
                  'anthropic',
                  'llm'
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                // Check for Anthropic error event
                if (typeof data === 'object' && data !== null && 'type' in data) {
                  const event = data as AnthropicStreamEvent;

                  if (event.type === 'error') {
                    const error = new UPPError(
                      event.error.message,
                      'PROVIDER_ERROR',
                      'anthropic',
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

      // Set provider reference (will be updated by createProvider)
      providerRef = {
        name: 'anthropic',
        version: '1.0.0',
        modalities: {
          llm: { bind: () => model },
        },
      } as unknown as LLMProvider<AnthropicLLMParams>;

      return model;
    },
  };
}
