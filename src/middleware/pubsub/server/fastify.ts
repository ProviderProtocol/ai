/**
 * @fileoverview Fastify adapter for pub-sub stream resumption.
 *
 * Provides utilities for Fastify servers to handle stream reconnections.
 *
 * @module middleware/pubsub/server/fastify
 */

import type { PubSubAdapter } from '../types.ts';
import { runSubscriberStream } from './shared.ts';

/**
 * Fastify Reply interface (minimal type to avoid dependency).
 */
interface FastifyReply {
  raw: {
    setHeader(name: string, value: string): void;
    write(chunk: string): boolean;
    end(): void;
    on(event: 'close', listener: () => void): void;
  };
}

/**
 * Stream buffered and live events to a Fastify reply.
 *
 * This utility handles the reconnection pattern for Fastify routes:
 * 1. Replays all buffered events from the adapter
 * 2. If stream is already completed, ends immediately
 * 3. Otherwise, subscribes to live events until completion
 *
 * @param streamId - The stream ID to subscribe to
 * @param adapter - The pub-sub adapter instance
 * @param reply - Fastify reply object
 *
 * @example
 * ```typescript
 * import { streamSubscriber } from '@providerprotocol/ai/middleware/pubsub/server/fastify';
 *
 * app.post('/api/ai/reconnect', async (request, reply) => {
 *   const { streamId } = request.body;
 *   return streamSubscriber(streamId, adapter, reply);
 * });
 * ```
 */
export async function streamSubscriber(
  streamId: string,
  adapter: PubSubAdapter,
  reply: FastifyReply
): Promise<void> {
  const res = reply.raw;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const abortController = new AbortController();
  res.on('close', () => abortController.abort());

  await runSubscriberStream(
    streamId,
    adapter,
    {
      write: (data: string) => res.write(data),
      end: () => res.end(),
    },
    { signal: abortController.signal }
  );
}

/**
 * Fastify adapter namespace for pub-sub server utilities.
 */
export const fastify = {
  streamSubscriber,
};
