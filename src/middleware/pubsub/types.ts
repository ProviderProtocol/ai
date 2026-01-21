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
 * Stored stream state.
 */
export interface StoredStream {
  readonly streamId: string;
  readonly modelId: string;
  readonly provider: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completed: boolean;
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
 * Unsubscribe function returned by subscribe.
 */
export type Unsubscribe = () => void;

/**
 * Storage adapter interface for pub-sub middleware.
 *
 * Implement this interface for custom backends (Redis, etc.).
 *
 * @example
 * ```typescript
 * const redisAdapter: PubSubAdapter = {
 *   async create(streamId, metadata) {
 *     await redis.hset(`stream:${streamId}`, metadata);
 *   },
 *   // ... other methods
 * };
 * ```
 */
export interface PubSubAdapter {
  /**
   * Checks if a stream exists.
   *
   * @param streamId - Stream identifier to check
   * @returns True if the stream exists
   */
  exists(streamId: string): Promise<boolean>;

  /**
   * Creates a stream entry.
   *
   * @param streamId - Unique stream identifier
   * @param metadata - Stream metadata (modelId, provider)
   */
  create(streamId: string, metadata: { modelId: string; provider: string }): Promise<void>;

  /**
   * Appends an event to the stream.
   *
   * @param streamId - Stream to append to
   * @param event - Stream event to store
   */
  append(streamId: string, event: StreamEvent): Promise<void>;

  /**
   * Marks stream as completed.
   *
   * @param streamId - Stream to mark complete
   */
  markCompleted(streamId: string): Promise<void>;

  /**
   * Checks if stream is completed.
   *
   * @param streamId - Stream to check
   * @returns True if stream is completed
   */
  isCompleted(streamId: string): Promise<boolean>;

  /**
   * Fetches all events for replay.
   *
   * @param streamId - Stream to fetch events from
   * @returns Array of events or null if stream doesn't exist
   */
  getEvents(streamId: string): Promise<StreamEvent[] | null>;

  /**
   * Gets stream metadata.
   *
   * @param streamId - Stream to get
   * @returns Stream metadata or null if not found
   */
  getStream(streamId: string): Promise<StoredStream | null>;

  /**
   * Subscribes to live events for a stream.
   *
   * @param streamId - Stream to subscribe to
   * @param callback - Function called for each new event
   * @param callback.cursor - Zero-based index of the event when supported
   * @returns Unsubscribe function
   */
  subscribe(streamId: string, callback: SubscriptionCallback): Unsubscribe;

  /**
   * Publishes event to all subscribers.
   *
   * @param streamId - Stream to publish to
   * @param event - Event to broadcast
   */
  publish(streamId: string, event: StreamEvent): void;

  /**
   * Removes a stream (cleanup).
   *
   * @param streamId - Stream to remove
   */
  remove(streamId: string): Promise<void>;

  /**
   * Removes streams older than maxAge.
   *
   * @param maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge: number): Promise<void>;
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
   * Stream identifier for reconnection support.
   *
   * When provided:
   * - If stream exists in adapter → Reconnection, replay buffered events
   * - If stream doesn't exist → New request, create entry and proceed
   *
   * When not provided:
   * - No pub/sub behavior, middleware is effectively disabled
   */
  streamId?: string;

  /**
   * TTL for stored streams in milliseconds.
   * @default 600000 (10 minutes)
   */
  ttl?: number;
}

/**
 * Options for memory adapter.
 */
export interface MemoryAdapterOptions {
  /**
   * Max streams to keep (LRU eviction).
   * @default 1000
   */
  maxStreams?: number;
}
