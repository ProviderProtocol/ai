/**
 * @fileoverview H3/Nitro/Nuxt adapter for pub-sub stream resumption.
 *
 * Provides utilities for H3-based servers (Nuxt, Nitro, or standalone H3)
 * to handle stream reconnections.
 *
 * @module middleware/pubsub/server/h3
 */

import type { PubSubAdapter } from '../types.ts';
import { runSubscriberStream } from './shared.ts';

/**
 * H3 Event interface (minimal type to avoid dependency).
 */
interface H3Event {
  node: {
    res: {
      setHeader(name: string, value: string): void;
      write(chunk: string): boolean;
      end(): void;
      on(event: 'close', listener: () => void): void;
    };
  };
}

/**
 * Stream buffered and live events to an H3 event response.
 *
 * This utility handles the reconnection pattern for H3/Nuxt routes:
 * 1. Replays all buffered events from the adapter
 * 2. If stream is already completed, ends immediately
 * 3. Otherwise, subscribes to live events until completion
 *
 * @param streamId - The stream ID to subscribe to
 * @param adapter - The pub-sub adapter instance
 * @param event - H3 event object
 *
 * @example
 * ```typescript
 * import { streamSubscriber } from '@providerprotocol/ai/middleware/pubsub/server/h3';
 *
 * export default defineEventHandler(async (event) => {
 *   const { streamId } = await readBody(event);
 *   return streamSubscriber(streamId, adapter, event);
 * });
 * ```
 */
export async function streamSubscriber(
  streamId: string,
  adapter: PubSubAdapter,
  event: H3Event
): Promise<void> {
  const res = event.node.res;
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
 * H3 adapter namespace for pub-sub server utilities.
 */
export const h3 = {
  streamSubscriber,
};
