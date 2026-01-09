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
import { UPPError } from '../../types/errors.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { ProxyLLMParams, ProxyProviderOptions } from './types.ts';
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
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'proxy',
          'llm'
        );
      }

      const model: BoundLLMModel<ProxyLLMParams> = {
        modelId,
        capabilities: PROXY_CAPABILITIES,

        get provider(): LLMProvider<ProxyLLMParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<ProxyLLMParams>): Promise<LLMResponse> {
          const body = serializeRequest(request);
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

          const data = (await response.json()) as TurnJSON;
          return turnJSONToLLMResponse(data);
        },

        stream(request: LLMRequest<ProxyLLMParams>): LLMStreamResult {
          const body = serializeRequest(request);
          const headers = mergeHeaders(request.config.headers, defaultHeaders);

          let resolveResponse: (value: LLMResponse) => void;
          let rejectResponse: (error: Error) => void;
          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
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
                  'PROVIDER_ERROR',
                  'proxy',
                  'llm'
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

                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
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
            } catch (error) {
              rejectResponse(error instanceof Error ? error : new Error(String(error)));
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
function serializeRequest(request: LLMRequest<ProxyLLMParams>): Record<string, unknown> {
  return {
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
 * Merge request headers with default headers.
 */
function mergeHeaders(
  requestHeaders: Record<string, string | undefined> | undefined,
  defaultHeaders: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = { ...defaultHeaders };
  if (requestHeaders) {
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }
  }
  return headers;
}

/**
 * Convert TurnJSON to LLMResponse.
 */
function turnJSONToLLMResponse(data: TurnJSON): LLMResponse {
  const messages = data.messages.map(deserializeMessage);
  const lastAssistant = messages
    .filter((m): m is AssistantMessage => m.type === 'assistant')
    .pop();

  return {
    message: lastAssistant ?? new AssistantMessage(''),
    usage: data.usage ?? emptyUsage(),
    stopReason: 'stop',
    data: data.data,
  };
}

