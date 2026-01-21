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
 * This utility handles the reconnection pattern for Express routes:
 * 1. Replays all buffered events from the adapter
 * 2. If stream is already completed, ends immediately
 * 3. Otherwise, subscribes to live events until completion
 *
 * @param streamId - The stream ID to subscribe to
 * @param adapter - The pub-sub adapter instance
 * @param res - Express response object
 *
 * @example
 * ```typescript
 * import { streamSubscriber } from '@providerprotocol/ai/middleware/pubsub/server/express';
 *
 * app.post('/api/ai/reconnect', async (req, res) => {
 *   const { streamId } = req.body;
 *   streamSubscriber(streamId, adapter, res);
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
