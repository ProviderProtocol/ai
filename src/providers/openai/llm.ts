import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { OpenAILLMParams, OpenAIResponse, OpenAIStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamChunk,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Create OpenAI LLM handler
 */
export function createLLMHandler(): LLMHandler<OpenAILLMParams> {
  return {
    bind(modelId: string): BoundLLMModel<OpenAILLMParams> {
      let providerRef: LLMProvider<OpenAILLMParams>;

      const model: BoundLLMModel<OpenAILLMParams> = {
        modelId,

        get provider(): LLMProvider<OpenAILLMParams> {
          return providerRef;
        },

        async complete(request: LLMRequest<OpenAILLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENAI_API_KEY',
            'openai',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? OPENAI_API_URL;
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
            'openai',
            'llm'
          );

          const data = (await response.json()) as OpenAIResponse;
          return transformResponse(data);
        },

        stream(request: LLMRequest<OpenAILLMParams>): LLMStreamResult {
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
                'OPENAI_API_KEY',
                'openai',
                'llm'
              );

              const baseUrl = request.config.baseUrl ?? OPENAI_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;
              body.stream_options = { include_usage: true };

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
                'openai',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'openai', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  'PROVIDER_ERROR',
                  'openai',
                  'llm'
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as OpenAIStreamChunk;

                  // Check for error
                  if ('error' in chunk) {
                    const error = new UPPError(
                      (chunk as any).error.message,
                      'PROVIDER_ERROR',
                      'openai',
                      'llm'
                    );
                    responseReject(error);
                    throw error;
                  }

                  const events = transformStreamChunk(chunk, state);
                  for (const event of events) {
                    yield event;
                  }
                }
              }

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

      providerRef = {
        name: 'openai',
        version: '1.0.0',
        modalities: {
          llm: { bind: () => model },
        },
      } as unknown as LLMProvider<OpenAILLMParams>;

      return model;
    },
  };
}
