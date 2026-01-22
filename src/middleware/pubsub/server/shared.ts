/**
 * @fileoverview Shared utilities for pub-sub server adapters.
 *
 * @module middleware/pubsub/server/shared
 * @internal
 */

import type { StreamEvent } from '../../../types/stream.ts';
import type { PubSubAdapter } from '../types.ts';
import { serializeStreamEvent } from '../../../stream/serialization.ts';

/**
 * Writer interface for abstracting how data is written to responses.
 * @internal
 */
export interface StreamWriter {
  write(data: string): void;
  end(): void;
}

/**
 * Options for runSubscriberStream.
 * @internal
 */
export interface StreamOptions {
  signal?: AbortSignal;
  /** Max time to wait for stream creation (ms). @default 5000 */
  creationTimeout?: number;
}

const DEFAULT_CREATION_TIMEOUT = 5000;
const CREATION_POLL_INTERVAL = 50;

/**
 * Formats a stream event as an SSE data line.
 */
export function formatSSE(event: StreamEvent): string {
  const serialized = serializeStreamEvent(event);
  return `data: ${JSON.stringify(serialized)}\n\n`;
}

/**
 * Waits for a stream to be created, with timeout.
 * Returns true if stream exists, false if timed out.
 */
async function waitForStream(
  streamId: string,
  adapter: PubSubAdapter,
  timeout: number,
  signal?: AbortSignal
): Promise<boolean> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (signal?.aborted) return false;

    const exists = await adapter.exists(streamId);
    if (exists) return true;

    await new Promise((resolve) => setTimeout(resolve, CREATION_POLL_INTERVAL));
  }

  return false;
}

/**
 * Core subscriber stream logic shared across all adapters.
 *
 * Handles:
 * 1. Waiting for stream creation (with timeout)
 * 2. Subscribing to live events FIRST (to prevent event loss)
 * 3. Replaying buffered events
 * 4. Checking if already completed
 * 5. Processing live events until completion
 * 6. Final cleanup
 * 7. Client disconnect via AbortSignal
 *
 * @internal
 */
export async function runSubscriberStream(
  streamId: string,
  adapter: PubSubAdapter,
  writer: StreamWriter,
  options: StreamOptions = {}
): Promise<void> {
  const { signal, creationTimeout = DEFAULT_CREATION_TIMEOUT } = options;

  // Early exit if already aborted
  if (signal?.aborted) {
    writer.end();
    return;
  }

  try {
    // 1. Wait for stream to be created (handles race with background generation)
    const streamExists = await waitForStream(streamId, adapter, creationTimeout, signal);

    if (signal?.aborted) {
      writer.end();
      return;
    }

    if (!streamExists) {
      writer.write(`data: ${JSON.stringify({ error: 'Stream not found' })}\n\n`);
      writer.end();
      return;
    }

    // 2. Subscribe FIRST to prevent event loss during replay
    // Any events emitted while we replay will queue up
    const queue: Array<{ event: StreamEvent; cursor: number | null }> = [];
    let resolveWait: (() => void) | null = null;
    let done = false;
    let lastSentCursor = -1;

    const unsubscribe = adapter.subscribe(streamId, (event: StreamEvent, cursor?: number) => {
      queue.push({ event, cursor: cursor ?? null });
      resolveWait?.();
    });

    // Handle client disconnect
    const onAbort = (): void => {
      done = true;
      resolveWait?.();
    };
    signal?.addEventListener('abort', onAbort);

    const drainQueue = (): void => {
      while (queue.length > 0 && !signal?.aborted) {
        const item = queue.shift();
        if (!item) {
          break;
        }
        const { event, cursor } = item;
        if (cursor !== null && cursor <= lastSentCursor) {
          continue;
        }
        writer.write(formatSSE(event));
        if (cursor !== null && cursor > lastSentCursor) {
          lastSentCursor = cursor;
        }
      }
    };

    const dropReplayDuplicates = (): void => {
      if (queue.length === 0) {
        return;
      }
      const filtered: Array<{ event: StreamEvent; cursor: number | null }> = [];
      for (const item of queue) {
        if (item.cursor !== null && item.cursor <= lastSentCursor) {
          continue;
        }
        filtered.push(item);
      }
      queue.length = 0;
      queue.push(...filtered);
    };

    const waitForNewEvents = (): Promise<void> => new Promise<void>((resolve) => {
      resolveWait = resolve;
      setTimeout(resolve, 500);
    });

    try {
      // 3. Replay buffered events (subscription is already active)
      const events = await adapter.getEvents(streamId);

      if (!events) {
        writer.write(`data: ${JSON.stringify({ error: 'Stream not found' })}\n\n`);
        writer.end();
        return;
      }

      for (const event of events) {
        if (signal?.aborted) break;
        writer.write(formatSSE(event));
      }

      lastSentCursor = events.length - 1;

      // Drop queued events that are already included in the replay (cursor-aware)
      dropReplayDuplicates();

      // Check abort after replay
      if (signal?.aborted) {
        writer.end();
        return;
      }

      // 4. Check if already completed
      const completed = await adapter.isCompleted(streamId).catch(() => false);
      if (completed) {
        // Drain any queued events first (these are post-replay events)
        drainQueue();
        writer.write('data: [DONE]\n\n');
        writer.end();
        return;
      }

      // 5. Process live events until completion
      while (!done) {
        // Check abort
        if (signal?.aborted) break;

        // Drain queue (all events here are post-replay, no duplicates)
        drainQueue();

        // Check abort again
        if (signal?.aborted) break;

        // Check completion
        const isComplete = await adapter.isCompleted(streamId).catch(() => false);
        if (isComplete) {
          done = true;
          break;
        }

        // Wait for new events
        await waitForNewEvents();
        resolveWait = null;
      }

      // Final drain (only if not aborted)
      if (!signal?.aborted) {
        drainQueue();
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    }

    // Only send DONE if not aborted
    if (!signal?.aborted) {
      writer.write('data: [DONE]\n\n');
    }
    writer.end();
  } catch (error) {
    // Don't send error if client disconnected
    if (!signal?.aborted) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      writer.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
    }
    writer.end();
  }
}
