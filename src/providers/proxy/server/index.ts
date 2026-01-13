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

import { express } from './express.ts';
import { fastify } from './fastify.ts';
import { h3 } from './h3.ts';
import {
  webapi,
  parseBody,
  parseEmbeddingBody,
  parseImageBody,
  toJSON,
  toEmbeddingJSON,
  toImageJSON,
  toSSE,
  toImageSSE,
  toError,
  bindTools,
} from './webapi.ts';

export { express, fastify, h3, webapi };
export {
  parseBody,
  parseEmbeddingBody,
  parseImageBody,
  toJSON,
  toEmbeddingJSON,
  toImageJSON,
  toSSE,
  toImageSSE,
  toError,
  bindTools,
};
export type { ParsedRequest, ParsedEmbeddingRequest, ParsedImageRequest } from './webapi.ts';

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
 *
 * @example Express
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
 *
 * @example Fastify
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
 *
 * @example H3/Nuxt
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
