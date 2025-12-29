import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { GoogleLLMParams, GoogleResponse, GoogleStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamChunk,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Build Google API URL for a model
 */
function buildUrl(modelId: string, action: 'generateContent' | 'streamGenerateContent', apiKey: string): string {
  const base = `${GOOGLE_API_BASE}/models/${modelId}:${action}`;
  return `${base}?key=${apiKey}`;
}

/**
 * Create Google LLM handler
 */
export function createLLMHandler(): LLMHandler<GoogleLLMParams> {
  return {
    bind(modelId: string): BoundLLMModel<GoogleLLMParams> {
      let providerRef: LLMProvider<GoogleLLMParams>;

      const model: BoundLLMModel<GoogleLLMParams> = {
        modelId,

        get provider(): LLMProvider<GoogleLLMParams> {
          return providerRef;
        },

        async complete(request: LLMRequest<GoogleLLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'GOOGLE_API_KEY',
            'google',
            'llm'
          );

          const url = request.config.baseUrl
            ? `${request.config.baseUrl}/models/${modelId}:generateContent?key=${apiKey}`
            : buildUrl(modelId, 'generateContent', apiKey);

          const body = transformRequest(request, modelId);

          const response = await doFetch(
            url,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'google',
            'llm'
          );

          const data = (await response.json()) as GoogleResponse;
          return transformResponse(data);
        },

        stream(request: LLMRequest<GoogleLLMParams>): LLMStreamResult {
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
                'GOOGLE_API_KEY',
                'google',
                'llm'
              );

              const url = request.config.baseUrl
                ? `${request.config.baseUrl}/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`
                : `${buildUrl(modelId, 'streamGenerateContent', apiKey)}&alt=sse`;

              const body = transformRequest(request, modelId);

              const response = await doStreamFetch(
                url,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(body),
                  signal: request.signal,
                },
                request.config,
                'google',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'google', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  'PROVIDER_ERROR',
                  'google',
                  'llm'
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as GoogleStreamChunk;

                  // Check for error
                  if ('error' in chunk) {
                    const error = new UPPError(
                      (chunk as any).error.message,
                      'PROVIDER_ERROR',
                      'google',
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
        name: 'google',
        version: '1.0.0',
        modalities: {
          llm: { bind: () => model },
        },
      } as unknown as LLMProvider<GoogleLLMParams>;

      return model;
    },
  };
}
