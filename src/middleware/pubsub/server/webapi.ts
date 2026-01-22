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
 * Handles reconnection for Web API frameworks (Bun, Deno, Next.js, Cloudflare Workers):
 * 1. Replays buffered events from the adapter
 * 2. Subscribes to live events until completion signal
 * 3. Closes when stream completes or client disconnects
 *
 * @param streamId - The stream ID to subscribe to
 * @param adapter - The pub-sub adapter instance
 * @returns A ReadableStream of SSE-formatted data
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';
 * import { webapi } from '@providerprotocol/ai/middleware/pubsub/server';
 *
 * const adapter = memoryAdapter();
 *
 * // Next.js App Router / Bun.serve / Deno.serve
 * export async function POST(req: Request) {
 *   const { input, conversationId } = await req.json();
 *
 *   if (!await adapter.exists(conversationId)) {
 *     const model = llm({
 *       model: anthropic('claude-sonnet-4-20250514'),
 *       middleware: [pubsubMiddleware({ adapter, streamId: conversationId })],
 *     });
 *     model.stream(input).then(turn => saveToDatabase(conversationId, turn));
 *   }
 *
 *   return new Response(webapi.createSubscriberStream(conversationId, adapter), {
 *     headers: {
 *       'Content-Type': 'text/event-stream',
 *       'Cache-Control': 'no-cache',
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
