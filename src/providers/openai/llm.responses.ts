/**
 * @fileoverview OpenAI Responses API Handler
 *
 * This module implements the LLM handler for OpenAI's modern Responses API
 * (`/v1/responses`). This is the recommended API that supports built-in tools
 * like web search, image generation, file search, code interpreter, and MCP.
 *
 * For the legacy Chat Completions API, see `llm.completions.ts`.
 *
 * @see {@link https://platform.openai.com/docs/api-reference/responses OpenAI Responses API Reference}
 * @module providers/openai/llm.responses
 */

import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { OpenAIResponsesParams, OpenAIResponsesResponse, OpenAIResponsesStreamEvent, OpenAIResponseErrorEvent } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.responses.ts';

/** Base URL for OpenAI's Responses API endpoint */
const OPENAI_RESPONSES_API_URL = 'https://api.openai.com/v1/responses';

/**
 * Capability declaration for the OpenAI Responses API.
 *
 * Defines what features are supported by this handler:
 * - Streaming: Real-time token-by-token response streaming via SSE
 * - Tools: Function calling plus built-in tools (web search, code interpreter, etc.)
 * - Structured Output: JSON schema-based response formatting
 * - Image Input: Vision capabilities for image understanding
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
 * Creates an LLM handler for OpenAI's modern Responses API.
 *
 * This factory function creates a handler that communicates with the
 * `/v1/responses` endpoint. The Responses API is the modern, recommended
 * approach that supports built-in tools like web search, image generation,
 * file search, code interpreter, and MCP servers.
 *
 * @returns An LLM handler configured for the Responses API
 *
 * @example Basic usage
 * ```typescript
 * const handler = createResponsesLLMHandler();
 * const model = handler.bind('gpt-4o');
 *
 * const response = await model.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   config: { apiKey: 'sk-...' }
 * });
 * ```
 *
 * @example With built-in tools
 * ```typescript
 * import { tools } from './types.ts';
 *
 * const response = await model.complete({
 *   messages: [{ role: 'user', content: 'What is the weather today?' }],
 *   params: {
 *     tools: [tools.webSearch()]
 *   },
 *   config: { apiKey: 'sk-...' }
 * });
 * ```
 *
 * @example Streaming responses
 * ```typescript
 * const stream = model.stream({
 *   messages: [{ role: 'user', content: 'Tell me a story' }],
 *   config: { apiKey: 'sk-...' }
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === 'text_delta') {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 *
 * @see {@link createCompletionsLLMHandler} for the legacy Chat Completions API handler
 */
export function createResponsesLLMHandler(): LLMHandler<OpenAIResponsesParams> {
  let providerRef: LLMProvider<OpenAIResponsesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<OpenAIResponsesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<OpenAIResponsesParams> {
      // Use the injected provider reference
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          'INVALID_REQUEST',
          'openai',
          'llm'
        );
      }

      const model: BoundLLMModel<OpenAIResponsesParams> = {
        modelId,
        capabilities: OPENAI_CAPABILITIES,

        get provider(): LLMProvider<OpenAIResponsesParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<OpenAIResponsesParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENAI_API_KEY',
            'openai',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? OPENAI_RESPONSES_API_URL;
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

          const data = await parseJsonResponse<OpenAIResponsesResponse>(response, 'openai', 'llm');

          // Check for error in response
          if (data.status === 'failed' && data.error) {
            throw new UPPError(
              data.error.message,
              'PROVIDER_ERROR',
              'openai',
              'llm'
            );
          }

          return transformResponse(data);
        },

        stream(request: LLMRequest<OpenAIResponsesParams>): LLMStreamResult {
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

              const baseUrl = request.config.baseUrl ?? OPENAI_RESPONSES_API_URL;
              const body = transformRequest(request, modelId);
              body.stream = true;

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
                  const event = data as OpenAIResponsesStreamEvent;

                  // Check for error event
                  if (event.type === 'error') {
                    const errorEvent = event as OpenAIResponseErrorEvent;
                    const error = new UPPError(
                      errorEvent.error.message,
                      'PROVIDER_ERROR',
                      'openai',
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
