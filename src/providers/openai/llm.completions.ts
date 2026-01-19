/**
 * @fileoverview OpenAI Chat Completions API Handler
 *
 * This module implements the LLM handler for OpenAI's Chat Completions API
 * (`/v1/chat/completions`). This is the legacy API that provides standard
 * chat completion functionality with function calling support.
 *
 * For the modern Responses API with built-in tools support, see `llm.responses.ts`.
 *
 * @see {@link https://platform.openai.com/docs/api-reference/chat OpenAI Chat Completions API Reference}
 * @module providers/openai/llm.completions
 */

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
import type { OpenAICompletionsParams, OpenAICompletionsResponse, OpenAICompletionsStreamChunk } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.completions.ts';

/** Base URL for OpenAI's Chat Completions API endpoint */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Capability declaration for the OpenAI Chat Completions API.
 *
 * Defines what features are supported by this handler:
 * - Streaming: Real-time token-by-token response streaming via SSE
 * - Tools: Function calling for structured interactions
 * - Structured Output: JSON schema-based response formatting
 * - Image Input: Vision capabilities for image understanding
 * - Document Input: PDF file support via inline base64
 */
const OPENAI_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates an LLM handler for OpenAI's Chat Completions API.
 *
 * This factory function creates a handler that communicates with the
 * `/v1/chat/completions` endpoint. The handler supports both synchronous
 * completion requests and streaming responses.
 *
 * @returns An LLM handler configured for the Chat Completions API
 *
 * @example
 * ```typescript
 * const handler = createCompletionsLLMHandler();
 * const model = handler.bind('gpt-4o');
 *
 * // Synchronous completion
 * const response = await model.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   config: { apiKey: 'sk-...' }
 * });
 *
 * // Streaming completion
 * const stream = model.stream({
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 *   config: { apiKey: 'sk-...' }
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 *
 * @see {@link createResponsesLLMHandler} for the modern Responses API handler
 */
export function createCompletionsLLMHandler(): LLMHandler<OpenAICompletionsParams> {
  let providerRef: LLMProvider<OpenAICompletionsParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OpenAICompletionsParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OpenAICompletionsParams> {
      // Use the injected provider reference
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'openai',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<OpenAICompletionsParams> = {
        modelId,
        capabilities: OPENAI_CAPABILITIES,

        get provider(): LLMProvider<OpenAICompletionsParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<OpenAICompletionsParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENAI_API_KEY',
            'openai',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? OPENAI_API_URL;
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
            'openai',
            'llm'
          );

          const data = await parseJsonResponse<OpenAICompletionsResponse>(response, 'openai', 'llm');
          return transformResponse(data);
        },

        stream(request: LLMRequest<OpenAICompletionsParams>): LLMStreamResult {
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
                  ErrorCode.ProviderError,
                  'openai',
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

                // Check for OpenAI error event
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as OpenAICompletionsStreamChunk;

                  // Check for error in chunk
                  if ('error' in chunk && chunk.error) {
                    const errorData = chunk.error as { message?: string; type?: string };
                    const error = new UPPError(
                      errorData.message ?? 'Unknown error',
                      ErrorCode.ProviderError,
                      'openai',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(chunk, state);
                  for (const event of uppEvents) {
                    if (request.structure && event.type === StreamEventType.TextDelta) {
                      // Emit ObjectDelta without parsing - middleware handles parsing
                      yield objectDelta(event.delta.text ?? '', event.index);
                    } else {
                      yield event;
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
