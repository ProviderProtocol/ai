/**
 * @fileoverview Fastify adapter for proxy server.
 *
 * Provides utilities for using PP proxy with Fastify servers.
 * These adapters convert PP types to Fastify-compatible responses.
 *
 * @module providers/proxy/server/fastify
 */

import type { Turn } from '../../../types/turn.ts';
import type { StreamResult } from '../../../types/stream.ts';
import { serializeTurn, serializeStreamEvent } from '../serialization.ts';

/**
 * Fastify Reply interface (minimal type to avoid dependency).
 */
interface FastifyReply {
  header(name: string, value: string): FastifyReply;
  status(code: number): FastifyReply;
  send(payload: unknown): FastifyReply;
  raw: {
    write(chunk: string): boolean;
    end(): void;
  };
}

/**
 * Send a Turn as JSON response.
 *
 * @param turn - The completed inference turn
 * @param reply - Fastify reply object
 *
 * @example
 * ```typescript
 * const turn = await instance.generate(messages);
 * return fastifyAdapter.sendJSON(turn, reply);
 * ```
 */
export function sendJSON(turn: Turn, reply: FastifyReply): FastifyReply {
  return reply
    .header('Content-Type', 'application/json')
    .send(serializeTurn(turn));
}

/**
 * Stream a StreamResult as Server-Sent Events.
 *
 * @param stream - The StreamResult from instance.stream()
 * @param reply - Fastify reply object
 *
 * @example
 * ```typescript
 * const stream = instance.stream(messages);
 * return fastifyAdapter.streamSSE(stream, reply);
 * ```
 */
export function streamSSE(stream: StreamResult, reply: FastifyReply): FastifyReply {
  reply
    .header('Content-Type', 'text/event-stream')
    .header('Cache-Control', 'no-cache')
    .header('Connection', 'keep-alive');

  const raw = reply.raw;

  (async () => {
    try {
      for await (const event of stream) {
        const serialized = serializeStreamEvent(event);
        raw.write(`data: ${JSON.stringify(serialized)}\n\n`);
      }

      const turn = await stream.turn;
      raw.write(`data: ${JSON.stringify(serializeTurn(turn))}\n\n`);
      raw.write('data: [DONE]\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      raw.end();
    }
  })();

  return reply;
}

/**
 * Send an error response.
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @param reply - Fastify reply object
 */
export function sendError(message: string, status: number, reply: FastifyReply): FastifyReply {
  return reply.status(status).send({ error: message });
}

/**
 * Fastify adapter utilities.
 *
 * @example Basic usage
 * ```typescript
 * import Fastify from 'fastify';
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { parseBody } from '@providerprotocol/ai/proxy';
 * import { fastify as fastifyAdapter } from '@providerprotocol/ai/proxy/server';
 *
 * const app = Fastify();
 *
 * app.post('/api/ai', async (request, reply) => {
 *   const { messages, system, params } = parseBody(request.body);
 *   const instance = llm({ model: anthropic('claude-sonnet-4-20250514'), system });
 *
 *   if (request.headers.accept?.includes('text/event-stream')) {
 *     return fastifyAdapter.streamSSE(instance.stream(messages), reply);
 *   } else {
 *     const turn = await instance.generate(messages);
 *     return fastifyAdapter.sendJSON(turn, reply);
 *   }
 * });
 * ```
 *
 * @example API Gateway with authentication
 * ```typescript
 * import Fastify from 'fastify';
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { ExponentialBackoff, RoundRobinKeys } from '@providerprotocol/ai/http';
 * import { parseBody } from '@providerprotocol/ai/proxy';
 * import { fastify as fastifyAdapter } from '@providerprotocol/ai/proxy/server';
 *
 * const app = Fastify();
 *
 * // Server manages AI provider keys - users never see them
 * const claude = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   config: {
 *     apiKey: new RoundRobinKeys([process.env.ANTHROPIC_KEY_1!, process.env.ANTHROPIC_KEY_2!]),
 *     retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
 *   },
 * });
 *
 * // Auth hook for your platform
 * app.addHook('preHandler', async (request, reply) => {
 *   const token = request.headers.authorization?.replace('Bearer ', '');
 *   const user = await validatePlatformToken(token);
 *   if (!user) {
 *     reply.status(401).send({ error: 'Unauthorized' });
 *     return;
 *   }
 *   request.user = user;
 * });
 *
 * app.post('/api/ai', async (request, reply) => {
 *   // Track usage per user
 *   // await trackUsage(request.user.id);
 *
 *   const { messages, system, params } = parseBody(request.body);
 *
 *   if (params?.stream) {
 *     return fastifyAdapter.streamSSE(claude.stream(messages, { system }), reply);
 *   }
 *   const turn = await claude.generate(messages, { system });
 *   return fastifyAdapter.sendJSON(turn, reply);
 * });
 * ```
 */
export const fastify = {
  sendJSON,
  streamSSE,
  sendError,
};
