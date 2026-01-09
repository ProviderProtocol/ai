/**
 * Proxy provider for UPP (Unified Provider Protocol)
 *
 * This module exports the proxy provider for transporting PP requests
 * over HTTP to a backend server, plus server-side utilities for
 * implementing proxy endpoints.
 *
 * @example Client usage
 * ```typescript
 * import { proxy } from '@providerprotocol/ai/proxy';
 * import { llm } from '@providerprotocol/ai';
 *
 * const backend = proxy({ endpoint: '/api/ai' });
 * const instance = llm({ model: backend('default') });
 *
 * const turn = await instance.generate('Hello!');
 * ```
 *
 * @example Server usage (Bun.serve)
 * ```typescript
 * import { llm, anthropic } from '@providerprotocol/ai';
 * import { parseBody, toJSON, toSSE, toError } from '@providerprotocol/ai/proxy';
 *
 * Bun.serve({
 *   async fetch(req) {
 *     if (req.method === 'POST' && new URL(req.url).pathname === '/api/ai') {
 *       try {
 *         const { messages, system, params } = parseBody(await req.json());
 *         const instance = llm({
 *           model: anthropic('claude-sonnet-4-20250514'),
 *           system,
 *           params: { max_tokens: 4096, ...params },
 *         });
 *
 *         const wantsStream = req.headers.get('accept')?.includes('text/event-stream');
 *         if (wantsStream) {
 *           return toSSE(instance.stream(messages));
 *         }
 *         return toJSON(await instance.generate(messages));
 *       } catch (e) {
 *         return toError(e.message, 400);
 *       }
 *     }
 *     return new Response('Not found', { status: 404 });
 *   }
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client: Provider and model creation
export { proxy, proxyModel } from '../providers/proxy/index.ts';
export type {
  ProxyLLMParams,
  ProxyProviderOptions,
  ProxyRequestOptions,
} from '../providers/proxy/index.ts';

// Client: Serialization utilities
export {
  serializeMessage,
  deserializeMessage,
  serializeTurn,
  serializeStreamEvent,
  deserializeStreamEvent,
} from '../providers/proxy/index.ts';

// Server: All adapters (Web API, Express, Fastify, H3)
export {
  server,
  webapi,
  express,
  fastify,
  h3,
  parseBody,
  toJSON,
  toSSE,
  toError,
  bindTools,
} from '../providers/proxy/server/index.ts';
export type {
  ParsedRequest,
  ParsedBody,
  ProxyHandler,
  RequestMeta,
  AdapterOptions,
} from '../providers/proxy/server/index.ts';

// SDK types used by proxy
export type { TurnJSON } from '../types/turn.ts';
