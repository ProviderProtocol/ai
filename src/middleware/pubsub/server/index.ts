/**
 * @fileoverview Framework adapters for pub-sub stream resumption.
 *
 * Provides framework-specific adapters for handling stream reconnections
 * with various server frameworks. The Web API adapter works with modern
 * frameworks like Bun, Deno, Next.js App Router, and Cloudflare Workers.
 * Additional adapters provide native integration for Express, Fastify, and H3/Nuxt.
 *
 * @module middleware/pubsub/server
 */

import { express } from './express.ts';
import { fastify } from './fastify.ts';
import { h3 } from './h3.ts';
import { webapi } from './webapi.ts';

export { express, fastify, h3, webapi };
export type { PubSubAdapter } from '../types.ts';

/**
 * Server adapters namespace for pub-sub stream resumption.
 *
 * Contains framework-specific adapters for Web API, Express, Fastify, and H3.
 *
 * @example Web API (Next.js App Router, Bun, Deno)
 * ```typescript
 * import { webapi } from '@providerprotocol/ai/middleware/pubsub/server';
 *
 * export async function POST(req: Request) {
 *   const { streamId } = await req.json();
 *   return new Response(webapi.createSubscriberStream(streamId, adapter), {
 *     headers: { 'Content-Type': 'text/event-stream' },
 *   });
 * }
 * ```
 *
 * @example Express
 * ```typescript
 * import { express } from '@providerprotocol/ai/middleware/pubsub/server';
 *
 * app.post('/api/ai/reconnect', (req, res) => {
 *   const { streamId } = req.body;
 *   express.streamSubscriber(streamId, adapter, res);
 * });
 * ```
 *
 * @example Fastify
 * ```typescript
 * import { fastify } from '@providerprotocol/ai/middleware/pubsub/server';
 *
 * app.post('/api/ai/reconnect', (request, reply) => {
 *   const { streamId } = request.body;
 *   return fastify.streamSubscriber(streamId, adapter, reply);
 * });
 * ```
 *
 * @example H3/Nuxt
 * ```typescript
 * import { h3 } from '@providerprotocol/ai/middleware/pubsub/server';
 *
 * export default defineEventHandler(async (event) => {
 *   const { streamId } = await readBody(event);
 *   return h3.streamSubscriber(streamId, adapter, event);
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
