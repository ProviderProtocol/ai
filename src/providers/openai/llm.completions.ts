import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { OpenAILLMParams, OpenAICompletionsResponse, OpenAICompletionsStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.completions.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI API capabilities
 */
const OPENAI_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Create OpenAI Chat Completions LLM handler
 */
export function createCompletionsLLMHandler(): LLMHandler<OpenAILLMParams> {
  // Provider reference injected by createProvider() or OpenAI's custom factory
  let providerRef: LLMProvider<OpenAILLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OpenAILLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OpenAILLMParams> {
      // Use the injected provider reference
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          'INVALID_REQUEST',
          'openai',
          'llm'
        );
      }

      const model: BoundLLMModel<OpenAILLMParams> = {
        modelId,
        capabilities: OPENAI_CAPABILITIES,

        get provider(): LLMProvider<OpenAILLMParams> {
          return providerRef!;
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

          const data = (await response.json()) as OpenAICompletionsResponse;
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
                // Skip [DONE] marker
                if (data === '[DONE]') {
                  continue;
                }

                // Check for OpenAI error event
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as OpenAICompletionsStreamChunk;

                  // Check for error in chunk
                  if ('error' in chunk && chunk.error) {
                    const errorData = chunk.error as { message?: string; type?: string };
                    const error = new UPPError(
                      errorData.message ?? 'Unknown error',
                      'PROVIDER_ERROR',
                      'openai',
                      'llm'
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(chunk, state);
                  for (const event of uppEvents) {
                    yield event;
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
