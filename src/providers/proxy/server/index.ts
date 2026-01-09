/**
 * @fileoverview Framework adapters for proxy server utilities.
 *
 * Provides framework-specific adapters for using PP proxy with various
 * server frameworks. The base Web API utilities (toJSON, toSSE) work with
 * modern frameworks like Bun, Deno, and Next.js App Router. These adapters
 * provide native integration for Express, Fastify, and H3/Nuxt.
 *
 * @module providers/proxy/server
 */

/**
 * Express usage example.
 * @example
 * ```typescript
 * import { express } from '@providerprotocol/ai/proxy/server';
 *
 * app.post('/api/ai', async (req, res) => {
 *   const { messages } = parseBody(req.body);
 *   if (req.headers.accept?.includes('text/event-stream')) {
 *     express.streamSSE(instance.stream(messages), res);
 *   } else {
 *     express.sendJSON(await instance.generate(messages), res);
 *   }
 * });
 * ```
 */

/**
 * Fastify usage example.
 * @example
 * ```typescript
 * import { fastify } from '@providerprotocol/ai/proxy/server';
 *
 * app.post('/api/ai', async (request, reply) => {
 *   const { messages } = parseBody(request.body);
 *   if (request.headers.accept?.includes('text/event-stream')) {
 *     return fastify.streamSSE(instance.stream(messages), reply);
 *   }
 *   return fastify.sendJSON(await instance.generate(messages), reply);
 * });
 * ```
 */

/**
 * Nuxt/Nitro/H3 usage example.
 * @example
 * ```typescript
 * import { h3 } from '@providerprotocol/ai/proxy/server';
 *
 * export default defineEventHandler(async (event) => {
 *   const { messages } = parseBody(await readBody(event));
 *   if (getHeader(event, 'accept')?.includes('text/event-stream')) {
 *     return h3.streamSSE(instance.stream(messages), event);
 *   }
 *   return h3.sendJSON(await instance.generate(messages), event);
 * });
 * ```
 */

import { express } from './express.ts';
import { fastify } from './fastify.ts';
import { h3 } from './h3.ts';
import { webapi, parseBody, toJSON, toSSE, toError, bindTools } from './webapi.ts';

export { express, fastify, h3, webapi };
export { parseBody, toJSON, toSSE, toError, bindTools };
export type { ParsedRequest } from './webapi.ts';

export type {
  ParsedBody,
  ProxyHandler,
  RequestMeta,
  AdapterOptions,
} from './types.ts';

/**
 * Server adapters namespace.
 *
 * Contains framework-specific adapters for Web API, Express, Fastify, and H3.
 */
export const server = {
  /** Web API adapter (Bun, Deno, Next.js, Workers) */
  webapi,
  /** Express/Connect adapter */
  express,
  /** Fastify adapter */
  fastify,
  /** H3/Nitro/Nuxt adapter */
  h3,
};
