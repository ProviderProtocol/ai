/**
 * @fileoverview Pub-sub middleware for stream resumption.
 *
 * Enables reconnecting clients to catch up on missed events during
 * active generation. The middleware buffers events and publishes them
 * to subscribers. Server routes handle reconnection logic using the
 * exported `createSubscriberStream` utility.
 *
 * @module middleware/pubsub
 */

import type {
  Middleware,
  MiddlewareContext,
  StreamContext,
} from '../../types/middleware.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { PubSubAdapter, PubSubOptions } from './types.ts';
import { memoryAdapter } from './memory-adapter.ts';

export type {
  PubSubAdapter,
  PubSubOptions,
  StoredStream,
  SubscriptionCallback,
  Unsubscribe,
  MemoryAdapterOptions,
} from './types.ts';
export { memoryAdapter } from './memory-adapter.ts';

const STATE_KEY_STREAM_ID = 'pubsub:streamId';
const STATE_KEY_ADAPTER = 'pubsub:adapter';

const DEFAULT_TTL = 600_000; // 10 minutes
const CLEANUP_INTERVAL = 60_000; // 1 minute

/** Track last cleanup time per adapter to avoid shared state issues */
const adapterCleanupTimes = new WeakMap<PubSubAdapter, number>();

interface AppendChainState {
  chain: Promise<void>;
}

/**
 * Gets the stream ID from middleware state.
 *
 * @param state - Middleware state map
 * @returns Stream ID or undefined if not set
 */
export function getStreamId(state: Map<string, unknown>): string | undefined {
  return state.get(STATE_KEY_STREAM_ID) as string | undefined;
}

/**
 * Gets the adapter from middleware state.
 *
 * @param state - Middleware state map
 * @returns Adapter or undefined if not set
 */
export function getAdapter(state: Map<string, unknown>): PubSubAdapter | undefined {
  return state.get(STATE_KEY_ADAPTER) as PubSubAdapter | undefined;
}

/**
 * Creates pub-sub middleware for stream buffering and publishing.
 *
 * The middleware:
 * - Creates stream entries for new requests
 * - Buffers all stream events
 * - Publishes events to subscribers
 * - Marks streams as completed
 *
 * Server routes handle reconnection logic using `createSubscriberStream`.
 *
 * @param options - Middleware configuration
 * @returns Middleware instance
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { pubsubMiddleware } from '@providerprotocol/ai/middleware/pubsub';
 * import { createSubscriberStream } from '@providerprotocol/ai/middleware/pubsub/server/webapi';
 *
 * // Server route handling both new requests and reconnections
 * export async function POST(req: Request) {
 *   const { messages, streamId } = await req.json();
 *   const exists = await adapter.exists(streamId);
 *
 *   if (!exists) {
 *     // Start background generation (fire and forget)
 *     const model = llm({
 *       model: anthropic('claude-sonnet-4-20250514'),
 *       middleware: [pubsubMiddleware({ adapter, streamId })],
 *     });
 *     consumeInBackground(model.stream(messages));
 *   }
 *
 *   // Both new and reconnect: subscribe to events
 *   return new Response(createSubscriberStream(streamId, adapter), {
 *     headers: { 'Content-Type': 'text/event-stream' },
 *   });
 * }
 * ```
 */
export function pubsubMiddleware(options: PubSubOptions = {}): Middleware {
  const {
    adapter = memoryAdapter(),
    streamId,
    ttl = DEFAULT_TTL,
  } = options;

  const appendChains = new Map<string, AppendChainState>();

  const enqueueAppend = (id: string, event: StreamEvent): void => {
    const state = appendChains.get(id) ?? { chain: Promise.resolve() };

    const task = state.chain
      .catch(() => {})
      .then(async () => {
        await adapter.append(id, event);
        adapter.publish(id, event);
      });

    state.chain = task.catch(() => {});
    appendChains.set(id, state);
  };

  const waitForAppends = async (id: string): Promise<void> => {
    const state = appendChains.get(id);
    if (!state) {
      return;
    }

    await state.chain.catch(() => {});
  };

  const clearAppendState = (id: string): void => {
    appendChains.delete(id);
  };

  const maybeCleanup = (): void => {
    const now = Date.now();
    const lastCleanup = adapterCleanupTimes.get(adapter) ?? 0;
    if (now - lastCleanup > CLEANUP_INTERVAL) {
      adapterCleanupTimes.set(adapter, now);
      adapter.cleanup(ttl).catch(() => {
        // Cleanup errors are non-fatal
      });
    }
  };

  const finalizeStream = async (ctx: MiddlewareContext): Promise<void> => {
    const id = ctx.state.get(STATE_KEY_STREAM_ID) as string | undefined;
    if (!id) {
      return;
    }

    await waitForAppends(id);

    await adapter.markCompleted(id).catch(() => {
      // Completion errors are non-fatal
    });

    clearAppendState(id);

    maybeCleanup();
  };

  return {
    name: 'pubsub',

    onStart(ctx: MiddlewareContext): void {
      ctx.state.set(STATE_KEY_ADAPTER, adapter);

      if (streamId) {
        ctx.state.set(STATE_KEY_STREAM_ID, streamId);
      }
    },

    async onRequest(ctx: MiddlewareContext): Promise<void> {
      if (!streamId) {
        return;
      }
      if (!ctx.streaming) {
        return;
      }

      // Create stream entry if it doesn't exist
      const exists = await adapter.exists(streamId);
      if (!exists) {
        await adapter.create(streamId, {
          modelId: ctx.modelId,
          provider: ctx.provider,
        });
      }
    },

    onStreamEvent(event: StreamEvent, ctx: StreamContext): StreamEvent {
      const id = ctx.state.get(STATE_KEY_STREAM_ID) as string | undefined;
      if (!id) {
        return event;
      }

      // Buffer first, then broadcast - ensures event is persisted before
      // subscribers are notified, preventing replay gaps with async adapters
      enqueueAppend(id, event);

      return event;
    },

    async onStreamEnd(ctx: StreamContext): Promise<void> {
      const id = ctx.state.get(STATE_KEY_STREAM_ID) as string | undefined;
      if (!id) {
        return;
      }

      await waitForAppends(id);

      await adapter.markCompleted(id).catch(() => {
        // Completion errors are non-fatal
      });

      clearAppendState(id);

      maybeCleanup();
    },

    async onError(_error: Error, ctx: MiddlewareContext): Promise<void> {
      await finalizeStream(ctx);
    },

    async onAbort(_error: Error, ctx: MiddlewareContext): Promise<void> {
      await finalizeStream(ctx);
    },
  };
}
