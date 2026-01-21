/**
 * @fileoverview In-memory storage adapter for pub-sub middleware.
 *
 * Provides a simple Map-based implementation with LRU eviction
 * for temporary stream storage during active generation.
 *
 * @module middleware/pubsub/memory-adapter
 */

import type { StreamEvent } from '../../types/stream.ts';
import type {
  PubSubAdapter,
  StoredStream,
  SubscriptionCallback,
  Unsubscribe,
  MemoryAdapterOptions,
} from './types.ts';

/**
 * Internal mutable version of StoredStream for adapter operations.
 * Public API exposes readonly StoredStream.
 */
interface MutableStoredStream {
  streamId: string;
  modelId: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
  completed: boolean;
  events: StreamEvent[];
}

interface StreamEntry {
  stream: MutableStoredStream;
  subscribers: Set<SubscriptionCallback>;
}

/**
 * Creates an in-memory storage adapter for pub-sub middleware.
 *
 * Stores streams in a Map with LRU eviction when maxStreams is reached.
 * All methods return promises for interface compatibility with async backends.
 *
 * @param options - Adapter configuration
 * @returns A PubSubAdapter instance
 *
 * @example
 * ```typescript
 * import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';
 *
 * const mw = pubsubMiddleware({
 *   adapter: memoryAdapter({ maxStreams: 500 }),
 * });
 * ```
 */
export function memoryAdapter(options: MemoryAdapterOptions = {}): PubSubAdapter {
  const { maxStreams = 1000 } = options;

  const streams = new Map<string, StreamEntry>();
  const eventCursors = new WeakMap<StreamEvent, number>();

  const evictOldest = (): void => {
    if (streams.size >= maxStreams) {
      let oldest: string | null = null;
      let oldestTime = Infinity;

      for (const [id, entry] of streams) {
        if (entry.stream.updatedAt < oldestTime) {
          oldestTime = entry.stream.updatedAt;
          oldest = id;
        }
      }

      if (oldest) {
        streams.delete(oldest);
      }
    }
  };

  return {
    async exists(streamId): Promise<boolean> {
      return streams.has(streamId);
    },

    async create(streamId, metadata): Promise<void> {
      evictOldest();

      const now = Date.now();
      const stream: MutableStoredStream = {
        streamId,
        modelId: metadata.modelId,
        provider: metadata.provider,
        createdAt: now,
        updatedAt: now,
        completed: false,
        events: [],
      };

      streams.set(streamId, {
        stream,
        subscribers: new Set(),
      });
    },

    async append(streamId, event): Promise<void> {
      const entry = streams.get(streamId);
      if (!entry) {
        return;
      }

      entry.stream.events.push(event);
      eventCursors.set(event, entry.stream.events.length - 1);
      entry.stream.updatedAt = Date.now();
    },

    async markCompleted(streamId): Promise<void> {
      const entry = streams.get(streamId);
      if (!entry) {
        return;
      }

      entry.stream.completed = true;
      entry.stream.updatedAt = Date.now();
    },

    async isCompleted(streamId): Promise<boolean> {
      const entry = streams.get(streamId);
      return entry?.stream.completed ?? false;
    },

    async getEvents(streamId): Promise<StreamEvent[] | null> {
      const entry = streams.get(streamId);
      if (!entry) {
        return null;
      }

      return [...entry.stream.events];
    },

    async getStream(streamId): Promise<StoredStream | null> {
      const entry = streams.get(streamId);
      return entry?.stream ?? null;
    },

    subscribe(streamId, callback): Unsubscribe {
      const entry = streams.get(streamId);
      if (!entry) {
        return () => {};
      }

      entry.subscribers.add(callback);

      return () => {
        entry.subscribers.delete(callback);
      };
    },

    publish(streamId, event): void {
      const entry = streams.get(streamId);
      if (!entry) {
        return;
      }

      const cursor = eventCursors.get(event) ?? entry.stream.events.length - 1;
      for (const callback of entry.subscribers) {
        try {
          callback(event, cursor);
        } catch {
          // Subscriber errors should not affect other subscribers
        }
      }
    },

    async remove(streamId): Promise<void> {
      streams.delete(streamId);
    },

    async cleanup(maxAge): Promise<void> {
      const now = Date.now();
      const cutoff = now - maxAge;

      for (const [id, entry] of streams) {
        if (entry.stream.updatedAt < cutoff) {
          streams.delete(id);
        }
      }
    },
  };
}
