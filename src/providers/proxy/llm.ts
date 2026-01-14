/**
 * @fileoverview Proxy LLM handler implementation.
 *
 * Transports PP LLM requests over HTTP to a backend server.
 * Supports both synchronous completion and streaming via SSE.
 * Full support for retry strategies, timeouts, and custom headers.
 *
 * @module providers/proxy/llm
 */

import type {
  LLMHandler,
  BoundLLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamResult,
  LLMCapabilities,
} from '../../types/llm.ts';
import type { LLMProvider } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { TurnJSON } from '../../types/turn.ts';
import { AssistantMessage } from '../../types/messages.ts';
import { emptyUsage } from '../../types/turn.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { ProxyLLMParams, ProxyProviderOptions } from './types.ts';
import { mergeHeaders } from './headers.ts';
import {
  serializeMessage,
  deserializeMessage,
  deserializeStreamEvent,
} from './serialization.ts';

/**
 * Capability flags for proxy provider.
 * All capabilities are enabled since the backend determines actual support.
 */
const PROXY_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  documentInput: true,
  videoInput: true,
  audioInput: true,
};

/**
 * Creates a proxy LLM handler.
 *
 * Supports full ProviderConfig options including retry strategies, timeouts,
 * custom headers, and custom fetch implementations. This allows client-side
 * retry logic for network failures to the proxy server.
 *
 * @param options - Proxy configuration options
 * @returns An LLM handler that transports requests over HTTP
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { proxy } from '@providerprotocol/ai/proxy';
 * import { ExponentialBackoff } from '@providerprotocol/ai/http';
 *
 * const claude = llm({
 *   model: proxy('https://api.myplatform.com/ai'),
 *   config: {
 *     headers: { 'Authorization': 'Bearer user-token' },
 *     retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
 *     timeout: 30000,
 *   },
 * });
 * ```
 */
export function createLLMHandler(options: ProxyProviderOptions): LLMHandler<ProxyLLMParams> {
  const { endpoint, headers: defaultHeaders = {} } = options;

  let providerRef: LLMProvider<ProxyLLMParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<ProxyLLMParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<ProxyLLMParams> {
      const provider = providerRef;
      if (!provider) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'proxy',
          ModalityType.LLM
        );
      }

      const model: BoundLLMModel<ProxyLLMParams> = {
        modelId,
        capabilities: PROXY_CAPABILITIES,

        get provider(): LLMProvider<ProxyLLMParams> {
          return provider;
        },

        async complete(request: LLMRequest<ProxyLLMParams>): Promise<LLMResponse> {
          const body = serializeRequest(request, modelId);
          const headers = mergeHeaders(request.config.headers, defaultHeaders);

          const response = await doFetch(
            endpoint,
            {
              method: 'POST',
              headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'proxy',
            'llm'
          );

          const data = await parseJsonResponse<TurnJSON>(response, 'proxy', 'llm');
          return turnJSONToLLMResponse(data);
        },

        stream(request: LLMRequest<ProxyLLMParams>): LLMStreamResult {
          const body = serializeRequest(request, modelId);
          const headers = mergeHeaders(request.config.headers, defaultHeaders);

          let resolveResponse: (value: LLMResponse) => void;
          let rejectResponse: (error: Error) => void;
          let responseSettled = false;
          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            resolveResponse = (value) => {
              if (!responseSettled) {
                responseSettled = true;
                resolve(value);
              }
            };
            rejectResponse = (error) => {
              if (!responseSettled) {
                responseSettled = true;
                reject(error);
              }
            };
          });

          const generator = async function* (): AsyncGenerator<StreamEvent> {
            try {
              const response = await doStreamFetch(
                endpoint,
                {
                  method: 'POST',
                  headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                  },
                  body: JSON.stringify(body),
                  signal: request.signal,
                },
                request.config,
                'proxy',
                'llm'
              );

              if (!response.ok) {
                throw await normalizeHttpError(response, 'proxy', 'llm');
              }

              if (!response.body) {
                throw new UPPError(
                  'Response body is null',
                  ErrorCode.ProviderError,
                  'proxy',
                  ModalityType.LLM
                );
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                  if (!line.trim() || line.startsWith(':')) continue;

                  if (line.startsWith('data:')) {
                    let data = line.slice(5);
                    if (data.startsWith(' ')) {
                      data = data.slice(1);
                    }
                    if (data === '[DONE]') continue;

                    try {
                      const parsed = JSON.parse(data);

                      // Check if this is the final turn data
                      if ('messages' in parsed && 'usage' in parsed && 'cycles' in parsed) {
                        resolveResponse(turnJSONToLLMResponse(parsed as TurnJSON));
                      } else {
                        // It's a StreamEvent
                        yield deserializeStreamEvent(parsed as StreamEvent);
                      }
                    } catch {
                      // Skip malformed JSON
                    }
                  }
                }
              }
              const remaining = decoder.decode();
              if (remaining) {
                buffer += remaining;
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                  if (!line.trim() || line.startsWith(':')) continue;
                  if (line.startsWith('data:')) {
                    let data = line.slice(5);
                    if (data.startsWith(' ')) {
                      data = data.slice(1);
                    }
                    if (data === '[DONE]') continue;
                    try {
                      const parsed = JSON.parse(data);
                      if ('messages' in parsed && 'usage' in parsed && 'cycles' in parsed) {
                        resolveResponse(turnJSONToLLMResponse(parsed as TurnJSON));
                      } else {
                        yield deserializeStreamEvent(parsed as StreamEvent);
                      }
                    } catch {
                      // Skip malformed JSON
                    }
                  }
                }
              }

              if (!responseSettled) {
                rejectResponse(new UPPError(
                  'Stream ended without final response',
                  ErrorCode.InvalidResponse,
                  'proxy',
                  ModalityType.LLM
                ));
              }
            } catch (error) {
              rejectResponse(toError(error));
              throw error;
            }
          };

          return {
            [Symbol.asyncIterator]: generator,
            response: responsePromise,
          };
        },
      };

      return model;
    },
  };
}

/**
 * Serialize an LLMRequest for HTTP transport.
 */
function serializeRequest(
  request: LLMRequest<ProxyLLMParams>,
  modelId: string
): Record<string, unknown> {
  return {
    model: modelId,
    messages: request.messages.map(serializeMessage),
    system: request.system,
    params: request.params,
    tools: request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      metadata: t.metadata,
    })),
    structure: request.structure,
  };
}

/**
 * Convert TurnJSON to LLMResponse.
 */
function turnJSONToLLMResponse(data: TurnJSON): LLMResponse {
  const messages = data.messages.map(deserializeMessage);
  const lastAssistant = messages
    .filter((m): m is AssistantMessage => m.type === 'assistant')
    .pop();

  const stopReason = deriveStopReason(lastAssistant);

  return {
    message: lastAssistant ?? new AssistantMessage(''),
    usage: data.usage ?? emptyUsage(),
    stopReason,
    data: data.data,
  };
}

function deriveStopReason(message: AssistantMessage | undefined): string {
  if (!message) {
    return 'end_turn';
  }

  if (message.toolCalls && message.toolCalls.length > 0) {
    return 'tool_use';
  }

  const metadata = message.metadata;
  const openaiMeta = metadata?.openai as { finish_reason?: string; status?: string } | undefined;
  if (openaiMeta?.status) {
    if (openaiMeta.status === 'failed') {
      return 'error';
    }
    if (openaiMeta.status === 'completed') {
      return 'end_turn';
    }
  }
  if (openaiMeta?.finish_reason) {
    return mapCompletionStopReason(openaiMeta.finish_reason);
  }

  const openrouterMeta = metadata?.openrouter as { finish_reason?: string } | undefined;
  if (openrouterMeta?.finish_reason) {
    return mapCompletionStopReason(openrouterMeta.finish_reason);
  }

  const xaiMeta = metadata?.xai as { finish_reason?: string; status?: string } | undefined;
  if (xaiMeta?.status) {
    if (xaiMeta.status === 'failed') {
      return 'error';
    }
    if (xaiMeta.status === 'completed') {
      return 'end_turn';
    }
  }
  if (xaiMeta?.finish_reason) {
    return mapCompletionStopReason(xaiMeta.finish_reason);
  }

  const anthropicMeta = metadata?.anthropic as { stop_reason?: string } | undefined;
  if (anthropicMeta?.stop_reason) {
    return mapAnthropicStopReason(anthropicMeta.stop_reason);
  }

  const googleMeta = metadata?.google as { finishReason?: string } | undefined;
  if (googleMeta?.finishReason) {
    return mapGoogleStopReason(googleMeta.finishReason);
  }

  const ollamaMeta = metadata?.ollama as { done_reason?: string } | undefined;
  if (ollamaMeta?.done_reason) {
    return mapOllamaStopReason(ollamaMeta.done_reason);
  }

  return 'end_turn';
}

function mapCompletionStopReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'end_turn';
  }
}

function mapAnthropicStopReason(reason: string): string {
  switch (reason) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'end_turn':
      return 'end_turn';
    case 'stop_sequence':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}

function mapGoogleStopReason(reason: string): string {
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
      return 'content_filter';
    case 'RECITATION':
      return 'content_filter';
    case 'OTHER':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}

function mapOllamaStopReason(reason: string): string {
  if (reason === 'length') {
    return 'max_tokens';
  }
  if (reason === 'stop') {
    return 'end_turn';
  }
  return 'end_turn';
}
