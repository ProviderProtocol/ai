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
import type { XAICompletionsParams, XAICompletionsResponse, XAICompletionsStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.completions.ts';

/** Base URL for the xAI Chat Completions API endpoint. */
const XAI_COMPLETIONS_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Capability declarations for the xAI Chat Completions API.
 * Indicates which features are supported by this API mode.
 */
const XAI_COMPLETIONS_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: false,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates an LLM handler for the xAI Chat Completions API (OpenAI-compatible).
 *
 * The Chat Completions API is the default and recommended API mode for xAI.
 * It provides full compatibility with OpenAI's Chat Completions API, making
 * it easy to migrate existing OpenAI-based applications.
 *
 * @returns An LLM handler configured for the Chat Completions API
 *
 * @example
 * ```typescript
 * import { xai } from './providers/xai';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: xai('grok-4'),
 *   params: {
 *     max_tokens: 1000,
 *     temperature: 0.7,
 *   }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @see {@link createMessagesLLMHandler} for Anthropic-compatible mode
 * @see {@link createResponsesLLMHandler} for stateful Responses API mode
 */
export function createCompletionsLLMHandler(): LLMHandler<XAICompletionsParams> {
  let providerRef: LLMProvider<XAICompletionsParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<XAICompletionsParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<XAICompletionsParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'xai',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<XAICompletionsParams> = {
        modelId,
        capabilities: XAI_COMPLETIONS_CAPABILITIES,

        get provider(): LLMProvider<XAICompletionsParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<XAICompletionsParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'XAI_API_KEY',
            'xai',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? XAI_COMPLETIONS_API_URL;
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

          const data = await parseJsonResponse<XAICompletionsResponse>(response, 'xai', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<XAICompletionsParams>): LLMStreamResult {
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

              const baseUrl = request.config.baseUrl ?? XAI_COMPLETIONS_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;
              body.stream_options = { include_usage: true };

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
                  const chunk = data as XAICompletionsStreamChunk;

                  // Check for error in chunk
                  if ('error' in chunk && chunk.error) {
                    const errorData = chunk.error as { message?: string; type?: string };
                    const error = new UPPError(
                      errorData.message ?? 'Unknown error',
                      ErrorCode.ProviderError,
                      'xai',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(chunk, state);
                  for (const event of uppEvents) {
                    yield event;
                    // Also emit ObjectDelta for structured output - gives developers explicit hook
                    if (request.structure && event.type === StreamEventType.TextDelta) {
                      yield objectDelta(event.delta.text ?? '', event.index);
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
