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
}

/**
 * Formats a stream event as an SSE data line.
 */
export function formatSSE(event: StreamEvent): string {
  const serialized = serializeStreamEvent(event);
  return `data: ${JSON.stringify(serialized)}\n\n`;
}

/**
 * Core subscriber stream logic shared across all adapters.
 *
 * Handles:
 * 1. Waiting for stream creation (with timeout)
 * 2. Subscribing to live events and completion signal
 * 3. Replaying buffered events
 * 4. Processing live events until completion signal
 * 5. Final cleanup
 * 6. Client disconnect via AbortSignal
 *
 * @internal
 */
export async function runSubscriberStream(
  streamId: string,
  adapter: PubSubAdapter,
  writer: StreamWriter,
  options: StreamOptions = {}
): Promise<void> {
  const { signal } = options;

  if (signal?.aborted) {
    writer.end();
    return;
  }

  try {
    if (signal?.aborted) {
      writer.end();
      return;
    }

    const streamExists = await adapter.exists(streamId);
    if (!streamExists) {
      writer.write(`data: ${JSON.stringify({ error: 'Stream not found' })}\n\n`);
      writer.end();
      return;
    }

    const queue: Array<{ event: StreamEvent; cursor: number | null }> = [];
    let resolveWait: (() => void) | null = null;
    let completed = false;
    let lastSentCursor = -1;

    const onEvent = (event: StreamEvent, cursor?: number): void => {
      queue.push({ event, cursor: cursor ?? null });
      resolveWait?.();
    };

    const onComplete = (): void => {
      completed = true;
      resolveWait?.();
    };

    const unsubscribe = adapter.subscribe(streamId, onEvent, onComplete);

    const onAbort = (): void => {
      completed = true;
      resolveWait?.();
    };
    signal?.addEventListener('abort', onAbort);

    const drainQueue = (): void => {
      while (queue.length > 0 && !signal?.aborted) {
        const item = queue.shift();
        if (!item) break;
        const { event, cursor } = item;
        if (cursor !== null && cursor <= lastSentCursor) continue;
        writer.write(formatSSE(event));
        if (cursor !== null && cursor > lastSentCursor) {
          lastSentCursor = cursor;
        }
      }
    };

    const dropReplayDuplicates = (): void => {
      if (queue.length === 0) return;
      const filtered: Array<{ event: StreamEvent; cursor: number | null }> = [];
      for (const item of queue) {
        if (item.cursor !== null && item.cursor <= lastSentCursor) continue;
        filtered.push(item);
      }
      queue.length = 0;
      queue.push(...filtered);
    };

    const waitForSignal = (): Promise<void> => new Promise((resolve) => {
      let settled = false;

      const settle = (): void => {
        if (settled) return;
        settled = true;
        resolveWait = null;
        resolve();
      };

      resolveWait = settle;

      if (completed || signal?.aborted || queue.length > 0) {
        settle();
      }
    });

    try {
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
      dropReplayDuplicates();

      if (signal?.aborted) {
        writer.end();
        return;
      }

      // Check if already completed before we subscribed
      const alreadyCompleted = await adapter.isCompleted(streamId).catch(() => false);
      if (alreadyCompleted) {
        drainQueue();
        writer.write('data: [DONE]\n\n');
        writer.end();
        return;
      }

      // Wait for events or completion signal (no polling)
      while (!completed && !signal?.aborted) {
        drainQueue();
        if (completed || signal?.aborted) break;
        await waitForSignal();
      }

      if (!signal?.aborted) {
        drainQueue();
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    }

    if (!signal?.aborted) {
      writer.write('data: [DONE]\n\n');
    }
    writer.end();
  } catch (error) {
    if (!signal?.aborted) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      writer.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
    }
    writer.end();
  }
}
