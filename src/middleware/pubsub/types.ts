/**
 * @fileoverview Pub-sub middleware types for stream resumption.
 *
 * Defines interfaces for temporary stream storage, replay, and
 * multi-client broadcast during active generation.
 *
 * @module middleware/pubsub/types
 */

import type { StreamEvent } from '../../types/stream.ts';

/**
 * Stored stream state (in-flight only).
 */
export interface StoredStream {
  readonly streamId: string;
  readonly createdAt: number;
  readonly events: readonly StreamEvent[];
}

/**
 * Subscription callback for live events.
 *
 * @param event - Stream event payload
 * @param cursor - Zero-based event index when adapter supports cursors
 */
export type SubscriptionCallback = (event: StreamEvent, cursor?: number) => void;

/**
 * Completion callback when stream ends.
 *
 * Adapters should invoke this when {@link PubSubAdapter.remove} is called
 * so subscriber streams can terminate before the stream is deleted.
 */
export type CompletionCallback = () => void;

/**
 * Unsubscribe function returned by subscribe.
 */
export type Unsubscribe = () => void;

/**
 * Storage adapter interface for pub-sub middleware.
 *
 * Stores in-flight streams only. Completed streams are removed immediately.
 * Apps should persist completed conversations via `.then()` and serve from
 * their own storage on reconnect.
 */
export interface PubSubAdapter {
  /**
   * Checks if a stream exists.
   */
  exists(streamId: string): Promise<boolean>;

  /**
   * Appends an event to the stream (creates lazily if needed).
   */
  append(streamId: string, event: StreamEvent): Promise<void>;

  /**
   * Fetches all events for replay.
   */
  getEvents(streamId: string): Promise<StreamEvent[]>;

  /**
   * Subscribes to live events (creates lazily if needed).
   */
  subscribe(
    streamId: string,
    onEvent: SubscriptionCallback,
    onComplete: CompletionCallback
  ): Unsubscribe;

  /**
   * Publishes event to all subscribers.
   */
  publish(streamId: string, event: StreamEvent): void;

  /**
   * Notifies subscribers and removes stream from storage.
   */
  remove(streamId: string): Promise<void>;
}

/**
 * Options for pub-sub middleware.
 */
export interface PubSubOptions {
  /**
   * Storage adapter instance.
   * @default memoryAdapter()
   */
  adapter?: PubSubAdapter;

  /**
   * Stream identifier for pub-sub behavior.
   */
  streamId?: string;
}

/**
 * Options for memory adapter.
 */
export interface MemoryAdapterOptions {
  /**
   * Max concurrent streams allowed. Throws if exceeded.
   * @default 1000
   */
  maxStreams?: number;
}
