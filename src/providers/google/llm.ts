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
  documentInput: true,
  videoInput: true,
  audioInput: true,
  imageOutput: true,
};

/**
 * Constructs the Google API endpoint URL for a specific model and action.
 *
 * @param modelId - The Gemini model identifier (e.g., 'gemini-1.5-pro')
 * @param action - The API action to perform
 * @returns Fully qualified URL for the model action
 */
function buildUrl(modelId: string, action: 'generateContent' | 'streamGenerateContent'): string {
  return `${GOOGLE_API_BASE}/models/${modelId}:${action}`;
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
          ErrorCode.InvalidRequest,
          'google',
          ModalityType.LLM
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
            ? `${request.config.baseUrl}/models/${modelId}:generateContent`
            : buildUrl(modelId, 'generateContent');

          const body = transformRequest(request, modelId);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
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

          const data = await parseJsonResponse<GoogleResponse>(response, 'google', 'llm');
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
                ? `${request.config.baseUrl}/models/${modelId}:streamGenerateContent?alt=sse`
                : `${buildUrl(modelId, 'streamGenerateContent')}?alt=sse`;

              const body = transformRequest(request, modelId);

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
                'x-goog-api-key': apiKey,
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
                  ErrorCode.ProviderError,
                  'google',
                  ModalityType.LLM
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as GoogleStreamChunk;

                  if (chunk.error) {
                    const error = new UPPError(
                      chunk.error.message,
                      ErrorCode.ProviderError,
                      'google',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const events = transformStreamChunk(chunk, state);
                  for (const event of events) {
                    if (request.structure && event.type === StreamEventType.TextDelta) {
                      // Emit ObjectDelta without parsing - middleware handles parsing
                      yield objectDelta(event.delta.text ?? '', event.index);
                    } else {
                      yield event;
                    }
                  }
                }
              }

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
