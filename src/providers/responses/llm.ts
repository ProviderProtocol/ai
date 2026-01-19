/**
 * @fileoverview OpenResponses API Handler
 *
 * This module implements the LLM handler for any OpenResponses-compatible server.
 * The OpenResponses specification enables multi-provider, interoperable LLM interfaces
 * based on the OpenAI Responses API.
 *
 * The handler accepts a configurable host URL, making it work with:
 * - OpenAI (`https://api.openai.com/v1`)
 * - OpenRouter (`https://openrouter.ai/api/v1`)
 * - Self-hosted servers
 * - Any OpenResponses-compatible endpoint
 *
 * @see {@link https://www.openresponses.org OpenResponses Specification}
 * @module providers/responses/llm
 */

import type { BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { LLMHandler, LLMProvider } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType, objectDelta } from '../../types/stream.ts';
import { parsePartialJson } from '../../utils/partial-json.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type {
  ResponsesParams,
  ResponsesResponse,
  ResponsesStreamEvent,
  ResponsesErrorEvent,
} from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';

/**
 * Internal context for handler configuration.
 * Stored on the model reference via providerConfig.
 */
interface ResponsesHandlerContext {
  host: string;
  apiKeyEnv: string;
}

/**
 * Capability declaration for the OpenResponses API.
 *
 * Defines what features are supported by this handler:
 * - Streaming: Real-time token-by-token response streaming via SSE
 * - Tools: Function calling support
 * - Structured Output: JSON schema-based response formatting
 * - Image Input: Vision capabilities for image understanding
 * - Document Input: File/document support
 * - Video Input: Video content support (per OpenResponses spec)
 * - Audio Input: Audio content support (as file upload)
 */
const RESPONSES_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: true,
  videoInput: true,
  audioInput: true,
};

/**
 * Creates an LLM handler for OpenResponses-compatible servers.
 *
 * This factory function creates a handler that communicates with any
 * server implementing the OpenResponses specification. The host URL
 * and API key environment variable are configured via provider options.
 *
 * @returns An LLM handler configured for the OpenResponses API
 *
 * @example Basic usage with OpenAI
 * ```typescript
 * const handler = createLLMHandler();
 * // Host is configured via provider options when creating model reference
 * ```
 */
export function createLLMHandler(): LLMHandler<ResponsesParams> {
  let providerRef: LLMProvider<ResponsesParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<ResponsesParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<ResponsesParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider() or have _setProvider called.',
          ErrorCode.InvalidRequest,
          'responses',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<ResponsesParams> = {
        modelId,
        capabilities: RESPONSES_CAPABILITIES,

        get provider(): LLMProvider<ResponsesParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<ResponsesParams>): Promise<LLMResponse> {
          const context = extractContext(request);
          const apiKey = await resolveApiKey(
            request.config,
            context.apiKeyEnv,
            'responses',
            'llm'
          );

          const baseUrl = request.config.baseUrl ?? `${context.host}/responses`;
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
            'responses',
            'llm'
          );

          const data = await parseJsonResponse<ResponsesResponse>(response, 'responses', 'llm');

          if (data.status === 'failed') {
            const message = data.error?.message ?? 'Provider returned a failed response.';
            throw new UPPError(
              message,
              ErrorCode.ProviderError,
              'responses',
              ModalityType.LLM
            );
          }

          return transformResponse(data);
        },

        stream(request: LLMRequest<ResponsesParams>): LLMStreamResult {
          const state = createStreamState();
          let responseResolve: (value: LLMResponse) => void;
          let responseReject: (error: Error) => void;

          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            responseResolve = resolve;
            responseReject = reject;
          });

          async function* generateEvents(): AsyncGenerator<StreamEvent, void, unknown> {
            try {
              const context = extractContext(request);
              const apiKey = await resolveApiKey(
                request.config,
                context.apiKeyEnv,
                'responses',
                'llm'
              );

              const baseUrl = request.config.baseUrl ?? `${context.host}/responses`;
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
                'responses',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'responses', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  ErrorCode.ProviderError,
                  'responses',
                  ModalityType.LLM
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                if (data === '[DONE]') {
                  continue;
                }

                if (typeof data === 'object' && data !== null) {
                  const event = data as ResponsesStreamEvent;

                  if (event.type === 'error') {
                    const errorEvent = event as ResponsesErrorEvent;
                    const error = new UPPError(
                      errorEvent.error.message,
                      ErrorCode.ProviderError,
                      'responses',
                      ModalityType.LLM
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvents = transformStreamEvent(event, state);
                  for (const uppEvent of uppEvents) {
                    if (request.structure && uppEvent.type === StreamEventType.TextDelta) {
                      const accumulatedText = state.textByIndex.get(uppEvent.index) ?? '';
                      const parseResult = parsePartialJson(accumulatedText);
                      yield objectDelta(uppEvent.delta.text ?? '', parseResult.value, uppEvent.index);
                    } else {
                      yield uppEvent;
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

/**
 * Extracts the handler context from the request config.
 * The context is stored in providerConfig when creating the model reference.
 */
function extractContext(request: LLMRequest<ResponsesParams>): ResponsesHandlerContext {
  const config = request.config;
  const responsesConfig = (config as { _responsesContext?: ResponsesHandlerContext })._responsesContext;

  if (!responsesConfig) {
    throw new UPPError(
      'OpenResponses provider requires host configuration. Use responses(modelId, { host: "..." })',
      ErrorCode.InvalidRequest,
      'responses',
      ModalityType.LLM
    );
  }

  return responsesConfig;
}
