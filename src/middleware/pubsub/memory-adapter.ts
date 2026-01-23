/**
 * @fileoverview In-memory storage adapter for pub-sub middleware.
 *
 * Provides a simple Map-based implementation for temporary stream
 * storage during active generation.
 *
 * @module middleware/pubsub/memory-adapter
 */

import type { StreamEvent } from '../../types/stream.ts';
import type {
  PubSubAdapter,
  StoredStream,
  SubscriptionCallback,
  CompletionCallback,
  Unsubscribe,
  MemoryAdapterOptions,
} from './types.ts';

interface MutableStoredStream {
  streamId: string;
  createdAt: number;
  events: StreamEvent[];
}

interface Subscriber {
  onEvent: SubscriptionCallback;
  onComplete: CompletionCallback;
}

interface StreamEntry {
  stream: MutableStoredStream;
  subscribers: Set<Subscriber>;
}

/**
 * Creates an in-memory storage adapter for pub-sub middleware.
 *
 * Stores streams in a Map. Throws when maxStreams is exceeded.
 * Streams are created lazily on first append or subscribe.
 *
 * @param options - Adapter configuration
 * @returns A PubSubAdapter instance
 *
 * @example
 * ```typescript
 * import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';
 *
 * const adapter = memoryAdapter({ maxStreams: 500 });
 * ```
 */
export function memoryAdapter(options: MemoryAdapterOptions = {}): PubSubAdapter {
  const { maxStreams = 1000 } = options;

  const streams = new Map<string, StreamEntry>();
  const eventCursors = new WeakMap<StreamEvent, number>();

  const scheduleCallback = (callback: () => void): void => {
    queueMicrotask(() => {
      try {
        callback();
      } catch {
        // Subscriber errors should not affect other subscribers
      }
    });
  };

  const getOrCreate = (streamId: string): StreamEntry => {
    let entry = streams.get(streamId);
    if (!entry) {
      if (streams.size >= maxStreams) {
        throw new Error(`Maximum concurrent streams (${maxStreams}) exceeded`);
      }
      entry = {
        stream: {
          streamId,
          createdAt: Date.now(),
          events: [],
        },
        subscribers: new Set(),
      };
      streams.set(streamId, entry);
    }
    return entry;
  };

  return {
    async exists(streamId): Promise<boolean> {
      return streams.has(streamId);
    },

    async append(streamId, event): Promise<void> {
      const entry = getOrCreate(streamId);
      entry.stream.events.push(event);
      eventCursors.set(event, entry.stream.events.length - 1);
    },

    async getEvents(streamId): Promise<StreamEvent[]> {
      const entry = streams.get(streamId);
      return entry ? [...entry.stream.events] : [];
    },

    subscribe(streamId, onEvent, onComplete): Unsubscribe {
      const entry = getOrCreate(streamId);
      const subscriber: Subscriber = { onEvent, onComplete };
      entry.subscribers.add(subscriber);

      return () => {
        entry.subscribers.delete(subscriber);
      };
    },

    publish(streamId, event): void {
      const entry = streams.get(streamId);
      if (!entry) {
        return;
      }

      const cursor = eventCursors.get(event) ?? entry.stream.events.length - 1;
      for (const subscriber of entry.subscribers) {
        scheduleCallback(() => {
          subscriber.onEvent(event, cursor);
        });
      }
    },

    async remove(streamId): Promise<void> {
      const entry = streams.get(streamId);
      if (entry) {
        for (const subscriber of entry.subscribers) {
          scheduleCallback(subscriber.onComplete);
        }
        streams.delete(streamId);
      }
    },
  };
}
