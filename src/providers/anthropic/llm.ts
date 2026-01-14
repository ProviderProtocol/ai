/**
 * @fileoverview Anthropic LLM handler implementation.
 *
 * This module provides the core LLM handler for Anthropic's Claude models,
 * implementing both synchronous completion and streaming capabilities.
 */

import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { AnthropicLLMParams, AnthropicResponse, AnthropicStreamEvent } from './types.ts';
import { betas } from './types.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
} from './transform.ts';
import type { ProviderConfig } from '../../types/provider.ts';
import type { JSONSchema } from '../../types/schema.ts';

/**
 * Checks if native structured outputs should be used.
 *
 * Native structured outputs are enabled when:
 * 1. The request includes a structure schema
 * 2. The beta header 'structured-outputs-2025-11-13' is present
 *
 * @param config - The provider configuration containing headers
 * @param structure - The structured output schema (if any)
 * @returns True if native structured outputs should be used
 */
function shouldUseNativeStructuredOutput(
  config: ProviderConfig,
  structure: JSONSchema | undefined
): boolean {
  if (!structure) {
    return false;
  }

  const betaHeader = config.headers?.['anthropic-beta'];
  if (!betaHeader) {
    return false;
  }

  // Beta header can contain multiple comma-separated values
  return betaHeader.includes(betas.structuredOutputs);
}

/** Base URL for the Anthropic Messages API. */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/** Default Anthropic API version header value. */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Capability flags for Anthropic Claude models.
 *
 * Defines what features are supported by the Anthropic provider:
 * - streaming: Real-time token generation via SSE
 * - tools: Function calling / tool use
 * - structuredOutput: JSON schema-constrained responses (via tool forcing)
 * - imageInput: Vision capabilities for image analysis
 * - documentInput: PDF and text document analysis
 */
const ANTHROPIC_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates an Anthropic LLM handler for the Universal Provider Protocol.
 *
 * The handler provides methods to bind specific Claude models and make
 * completion requests. It handles API authentication, request transformation,
 * and response parsing.
 *
 * @returns An LLMHandler configured for Anthropic's Messages API
 *
 * @example
 * ```typescript
 * const handler = createLLMHandler();
 * const model = handler.bind('claude-sonnet-4-20250514');
 *
 * const response = await model.complete({
 *   messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
 *   config: { apiKey: process.env.ANTHROPIC_API_KEY },
 * });
 * ```
 */
export function createLLMHandler(): LLMHandler<AnthropicLLMParams> {
  let providerRef: LLMProvider<AnthropicLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<AnthropicLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<AnthropicLLMParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'anthropic',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<AnthropicLLMParams> = {
        modelId,
        capabilities: ANTHROPIC_CAPABILITIES,

        get provider(): LLMProvider<AnthropicLLMParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<AnthropicLLMParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'ANTHROPIC_API_KEY',
            'anthropic',
            'llm'
          );

          const useNativeStructuredOutput = shouldUseNativeStructuredOutput(
            request.config,
            request.structure
          );
          const baseUrl = request.config.baseUrl ?? ANTHROPIC_API_URL;
          const body = transformRequest(request, modelId, useNativeStructuredOutput);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': request.config.apiVersion ?? ANTHROPIC_VERSION,
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
            'anthropic',
            'llm'
          );

          const data = await parseJsonResponse<AnthropicResponse>(response, 'anthropic', 'llm');
          return transformResponse(data, useNativeStructuredOutput);
        },

        stream(request: LLMRequest<AnthropicLLMParams>): LLMStreamResult {
          const state = createStreamState();
          const useNativeStructuredOutput = shouldUseNativeStructuredOutput(
            request.config,
            request.structure
          );
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
              const body = transformRequest(request, modelId, useNativeStructuredOutput);
              body.stream = true;

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': request.config.apiVersion ?? ANTHROPIC_VERSION,
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
                  ErrorCode.ProviderError,
                  'anthropic',
                  ModalityType.LLM
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                if (typeof data === 'object' && data !== null && 'type' in data) {
                  const event = data as AnthropicStreamEvent;

                  if (event.type === 'error') {
                    const error = new UPPError(
                      event.error.message,
                      ErrorCode.ProviderError,
                      'anthropic',
                      ModalityType.LLM
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

              responseResolve(buildResponseFromState(state, useNativeStructuredOutput));
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
