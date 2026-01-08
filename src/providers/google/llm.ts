import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
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

/** Base URL for the Google Generative Language API (v1beta). */
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Capability flags for the Google Gemini API.
 *
 * Gemini models support streaming responses, function/tool calling,
 * structured JSON output, and multimodal inputs including images,
 * video, and audio.
 */
const GOOGLE_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: true,
  audioInput: true,
};

/**
 * Constructs the Google API endpoint URL for a specific model and action.
 *
 * @param modelId - The Gemini model identifier (e.g., 'gemini-1.5-pro')
 * @param action - The API action to perform
 * @param apiKey - The Google API key for authentication
 * @returns Fully qualified URL with API key as query parameter
 */
function buildUrl(modelId: string, action: 'generateContent' | 'streamGenerateContent', apiKey: string): string {
  const base = `${GOOGLE_API_BASE}/models/${modelId}:${action}`;
  return `${base}?key=${apiKey}`;
}

/**
 * Creates an LLM handler for Google Gemini models.
 *
 * The handler implements the UPP LLMHandler interface, providing `bind()`
 * to create model instances that support both synchronous completion and
 * streaming responses.
 *
 * @returns An LLMHandler configured for Google Gemini API
 *
 * @example
 * ```typescript
 * const handler = createLLMHandler();
 * const model = handler.bind('gemini-1.5-pro');
 *
 * const response = await model.complete({
 *   messages: [...],
 *   config: { apiKey: 'your-api-key' },
 * });
 * ```
 */
export function createLLMHandler(): LLMHandler<GoogleLLMParams> {
  let providerRef: LLMProvider<GoogleLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<GoogleLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<GoogleLLMParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'google',
          'llm'
        );
      }

      const model: BoundLLMModel<GoogleLLMParams> = {
        modelId,
        capabilities: GOOGLE_CAPABILITIES,

        get provider(): LLMProvider<GoogleLLMParams> {
          return providerRef!;
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

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (request.config.headers) {
            for (const [key, value] of Object.entries(request.config.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }
          }

          const response = await doFetch(
            url,
            {
              method: 'POST',
              headers,
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

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };

              if (request.config.headers) {
                for (const [key, value] of Object.entries(request.config.headers)) {
                  if (value !== undefined) {
                    headers[key] = value;
                  }
                }
              }

              const response = await doStreamFetch(
                url,
                {
                  method: 'POST',
                  headers,
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

      return model;
    },
  };
}
