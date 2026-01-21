/**
 * @fileoverview Web API adapter for pub-sub stream resumption.
 *
 * Provides utilities for Web API native frameworks (Bun, Deno, Next.js App Router,
 * Cloudflare Workers) to handle stream reconnections.
 *
 * @module middleware/pubsub/server/webapi
 */

import type { PubSubAdapter } from '../types.ts';
import { runSubscriberStream } from './shared.ts';

/**
 * Creates a ReadableStream that replays buffered events and subscribes to live events.
 *
 * This utility handles the reconnection pattern for server routes:
 * 1. Replays all buffered events from the adapter
 * 2. If stream is already completed, closes immediately
 * 3. Otherwise, subscribes to live events until completion
 *
 * Works with any framework that supports web standard ReadableStream.
 *
 * @param streamId - The stream ID to subscribe to
 * @param adapter - The pub-sub adapter instance
 * @returns A ReadableStream of SSE-formatted data
 *
 * @example
 * ```typescript
 * import { createSubscriberStream } from '@providerprotocol/ai/middleware/pubsub/server/webapi';
 *
 * // Next.js App Router
 * export async function POST(req: Request) {
 *   const { streamId } = await req.json();
 *
 *   return new Response(createSubscriberStream(streamId, adapter), {
 *     headers: {
 *       'Content-Type': 'text/event-stream',
 *       'Cache-Control': 'no-cache',
 *       'Connection': 'keep-alive',
 *     },
 *   });
 * }
 * ```
 */
export function createSubscriberStream(
  streamId: string,
  adapter: PubSubAdapter
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let closed = false;

  return new ReadableStream({
    async start(controller) {
      await runSubscriberStream(
        streamId,
        adapter,
        {
          write: (data: string) => {
            if (closed) {
              return;
            }
            controller.enqueue(encoder.encode(data));
          },
          end: () => {
            if (closed) {
              return;
            }
            closed = true;
            try {
              controller.close();
            } catch {
              // Ignore close errors after cancellation
            }
          },
        },
        { signal: abortController.signal }
      );
    },
    cancel() {
      abortController.abort();
    },
  });
}

/**
 * Web API adapter namespace for pub-sub server utilities.
 */
export const webapi = {
  createSubscriberStream,
};
