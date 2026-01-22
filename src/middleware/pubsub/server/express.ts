/**
 * @fileoverview Express/Connect adapter for pub-sub stream resumption.
 *
 * Provides utilities for Express.js or Connect-based servers
 * to handle stream reconnections.
 *
 * @module middleware/pubsub/server/express
 */

import type { PubSubAdapter } from '../types.ts';
import { runSubscriberStream } from './shared.ts';

/**
 * Express Response interface (minimal type to avoid dependency).
 */
interface ExpressResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  on(event: 'close', listener: () => void): void;
}

/**
 * Stream buffered and live events to an Express response.
 *
 * Handles reconnection for Express routes:
 * 1. Replays buffered events from the adapter
 * 2. Subscribes to live events until completion signal
 * 3. Ends when stream completes or client disconnects
 *
 * @param streamId - The stream ID to subscribe to
 * @param adapter - The pub-sub adapter instance
 * @param res - Express response object
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';
 * import { express } from '@providerprotocol/ai/middleware/pubsub/server';
 *
 * const adapter = memoryAdapter();
 *
 * app.post('/api/chat', async (req, res) => {
 *   const { input, conversationId } = req.body;
 *
 *   if (!await adapter.exists(conversationId)) {
 *     const model = llm({
 *       model: anthropic('claude-sonnet-4-20250514'),
 *       middleware: [pubsubMiddleware({ adapter, streamId: conversationId })],
 *     });
 *     model.stream(input).then(turn => saveToDatabase(conversationId, turn));
 *   }
 *
 *   return express.streamSubscriber(conversationId, adapter, res);
 * });
 * ```
 */
export async function streamSubscriber(
  streamId: string,
  adapter: PubSubAdapter,
  res: ExpressResponse
): Promise<void> {
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
 * Express adapter namespace for pub-sub server utilities.
 */
export const express = {
  streamSubscriber,
};
