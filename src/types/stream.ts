/**
 * @fileoverview Streaming types for real-time LLM responses.
 *
 * Defines the event types and interfaces for streaming LLM inference,
 * including text deltas, tool call deltas, and control events.
 *
 * @module types/stream
 */

import type { Turn } from './turn.ts';

/**
 * Stream event type constants.
 *
 * Use these constants instead of raw strings for type-safe event handling:
 *
 * @example
 * ```typescript
 * import { StreamEventType } from 'upp';
 *
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text ?? '');
 *   }
 * }
 * ```
 */
export const StreamEventType = {
  /** Incremental text output */
  TextDelta: 'text_delta',
  /** Incremental reasoning/thinking output */
  ReasoningDelta: 'reasoning_delta',
  /** Incremental image data */
  ImageDelta: 'image_delta',
  /** Incremental audio data */
  AudioDelta: 'audio_delta',
  /** Incremental video data */
  VideoDelta: 'video_delta',
  /** Incremental tool call data (arguments being streamed) */
  ToolCallDelta: 'tool_call_delta',
  /** Incremental structured object data (for structured output responses) */
  ObjectDelta: 'object_delta',
  /** Tool execution has started (may be emitted after completion in some implementations) */
  ToolExecutionStart: 'tool_execution_start',
  /** Tool execution has completed */
  ToolExecutionEnd: 'tool_execution_end',
  /** Beginning of a message */
  MessageStart: 'message_start',
  /** End of a message */
  MessageStop: 'message_stop',
  /** Beginning of a content block */
  ContentBlockStart: 'content_block_start',
  /** End of a content block */
  ContentBlockStop: 'content_block_stop',
} as const;

/**
 * Stream event type discriminator union.
 *
 * This type is derived from {@link StreamEventType} constants. Use `StreamEventType.TextDelta`
 * for constants or `type MyType = StreamEventType` for type annotations.
 */
export type StreamEventType = (typeof StreamEventType)[keyof typeof StreamEventType];

/**
 * Event delta data payload.
 *
 * Contains the type-specific data for a streaming event.
 * Different fields are populated depending on the event type:
 *
 * | Event Type | Fields |
 * |------------|--------|
 * | `text_delta` | `text` |
 * | `reasoning_delta` | `text` |
 * | `object_delta` | `text` |
 * | `image_delta` | `data` |
 * | `audio_delta` | `data` |
 * | `video_delta` | `data` |
 * | `tool_call_delta` | `toolCallId`, `toolName`, `argumentsJson` |
 * | `tool_execution_start` | `toolCallId`, `toolName`, `timestamp` |
 * | `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError`, `timestamp` |
 * | `message_start` | (none) |
 * | `message_stop` | (none) |
 * | `content_block_start` | (none) |
 * | `content_block_stop` | (none) |
 */
export interface EventDelta {
  /** Incremental text content (text_delta, reasoning_delta, object_delta) */
  text?: string;

  /** Incremental binary data (image_delta, audio_delta, video_delta) */
  data?: Uint8Array;

  /** Tool call identifier (tool_call_delta, tool_execution_start/end) */
  toolCallId?: string;

  /** Tool name (tool_call_delta, tool_execution_start/end) */
  toolName?: string;

  /** Incremental JSON arguments string (tool_call_delta) */
  argumentsJson?: string;

  /** Tool execution result (tool_execution_end) */
  result?: unknown;

  /** Whether tool execution resulted in an error (tool_execution_end) */
  isError?: boolean;

  /** Timestamp in milliseconds (tool_execution_start/end) */
  timestamp?: number;
}

/**
 * A single streaming event from the LLM.
 *
 * Events are emitted in order as the model generates output,
 * allowing for real-time display of responses.
 *
 * @example
 * ```typescript
 * import { StreamEventType } from 'upp';
 *
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text ?? '');
 *   } else if (event.type === StreamEventType.ToolCallDelta) {
 *     console.log('Tool:', event.delta.toolName);
 *   }
 * }
 * ```
 */
export interface StreamEvent {
  /** Event type discriminator */
  type: StreamEventType;

  /** Index of the content block this event belongs to */
  index: number;

  /** Event-specific data payload */
  delta: EventDelta;
}

/**
 * Stream result - an async iterable that also provides the final turn.
 *
 * Allows consuming streaming events while also awaiting the complete
 * Turn result after streaming finishes. Implements `PromiseLike<Turn>`
 * for direct awaiting with automatic stream consumption.
 *
 * @typeParam TData - Type of the structured output data
 *
 * @example
 * ```typescript
 * import { StreamEventType } from 'upp';
 *
 * const stream = instance.stream('Tell me a story');
 *
 * // Option 1: Consume streaming events manually
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text ?? '');
 *   }
 * }
 * const turn = await stream.turn;
 *
 * // Option 2: Just await the turn (auto-drains the stream)
 * const turn = await instance.stream('Tell me a story');
 *
 * // Option 3: Fire-and-forget with callback
 * instance.stream('Tell me a story').then(turn => saveToDB(turn));
 * ```
 */
export interface StreamResult<TData = unknown>
  extends AsyncIterable<StreamEvent>, PromiseLike<Turn<TData>> {
  /**
   * Promise that resolves to the complete Turn after streaming finishes.
   * Rejects if the stream is aborted or terminated early.
   *
   * Accessing `turn` auto-drains the stream if it has not been iterated yet.
   */
  readonly turn: Promise<Turn<TData>>;

  /**
   * Aborts the stream, stopping further events and cancelling the request.
   * This will cause {@link StreamResult.turn} to reject.
   */
  abort(): void;
}

/**
 * Creates a StreamResult from an async generator and completion promise.
 *
 * @typeParam TData - Type of the structured output data
 * @param generator - Async generator that yields stream events
 * @param turnPromiseOrFactory - Promise or factory that resolves to the complete Turn
 * @param abortController - Controller for aborting the stream
 * @returns A StreamResult that can be iterated and awaited
 *
 * @example
 * ```typescript
 * const abortController = new AbortController();
 * const stream = createStreamResult(
 *   eventGenerator(),
 *   turnPromise,
 *   abortController
 * );
 *
 * // Can be awaited directly (auto-drains)
 * const turn = await stream;
 *
 * // Or iterated manually
 * for await (const event of stream) { ... }
 * const turn = await stream.turn;
 * ```
 */
export function createStreamResult<TData = unknown>(
  generator: AsyncGenerator<StreamEvent, void, unknown>,
  turnPromiseOrFactory: Promise<Turn<TData>> | (() => Promise<Turn<TData>>),
  abortController: AbortController
): StreamResult<TData> {
  let cachedTurn: Promise<Turn<TData>> | null = null;
  let drainStarted = false;
  let iteratorStarted = false;

  const getTurn = (): Promise<Turn<TData>> => {
    if (typeof turnPromiseOrFactory === 'function') {
      if (!cachedTurn) {
        cachedTurn = turnPromiseOrFactory();
      }
      return cachedTurn;
    }
    return turnPromiseOrFactory;
  };

  const drain = (): void => {
    if (drainStarted) return;
    drainStarted = true;
    void (async () => {
      try {
        let done = false;
        while (!done) {
          const result = await generator.next();
          done = result.done ?? false;
        }
      } catch {
        // Errors are surfaced via turn promise
      }
    })();
  };

  return {
    [Symbol.asyncIterator]() {
      iteratorStarted = true;
      return generator;
    },
    get turn() {
      if (!iteratorStarted) {
        drain();
      }
      return getTurn();
    },
    abort() {
      abortController.abort();
    },
    then<TResult1 = Turn<TData>, TResult2 = never>(
      onfulfilled?: ((value: Turn<TData>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      drain();
      return getTurn().then(onfulfilled, onrejected);
    },
  };
}

/**
 * Creates a text delta stream event.
 *
 * @param text - The incremental text content
 * @param index - Content block index (default: 0)
 * @returns A text_delta StreamEvent
 */
export function textDelta(text: string, index = 0): StreamEvent {
  return {
    type: StreamEventType.TextDelta,
    index,
    delta: { text },
  };
}

/**
 * Creates a tool call delta stream event.
 *
 * @param toolCallId - Unique identifier for the tool call
 * @param toolName - Name of the tool being called
 * @param argumentsJson - Incremental JSON arguments string
 * @param index - Content block index (default: 0)
 * @returns A tool_call_delta StreamEvent
 */
export function toolCallDelta(
  toolCallId: string,
  toolName: string,
  argumentsJson: string,
  index = 0
): StreamEvent {
  return {
    type: StreamEventType.ToolCallDelta,
    index,
    delta: { toolCallId, toolName, argumentsJson },
  };
}

/**
 * Creates an object delta stream event for structured output responses.
 *
 * @param text - The incremental text content
 * @param index - Content block index (default: 0)
 * @returns An object_delta StreamEvent
 */
export function objectDelta(text: string, index = 0): StreamEvent {
  return {
    type: StreamEventType.ObjectDelta,
    index,
    delta: { text },
  };
}

/**
 * Creates a message start stream event.
 *
 * @returns A message_start StreamEvent
 */
export function messageStart(): StreamEvent {
  return {
    type: StreamEventType.MessageStart,
    index: 0,
    delta: {},
  };
}

/**
 * Creates a message stop stream event.
 *
 * @returns A message_stop StreamEvent
 */
export function messageStop(): StreamEvent {
  return {
    type: StreamEventType.MessageStop,
    index: 0,
    delta: {},
  };
}

/**
 * Creates a content block start stream event.
 *
 * @param index - The content block index starting
 * @returns A content_block_start StreamEvent
 */
export function contentBlockStart(index: number): StreamEvent {
  return {
    type: StreamEventType.ContentBlockStart,
    index,
    delta: {},
  };
}

/**
 * Creates a content block stop stream event.
 *
 * @param index - The content block index stopping
 * @returns A content_block_stop StreamEvent
 */
export function contentBlockStop(index: number): StreamEvent {
  return {
    type: StreamEventType.ContentBlockStop,
    index,
    delta: {},
  };
}

/**
 * Creates a tool execution start stream event.
 *
 * @param toolCallId - Unique identifier for the tool call
 * @param toolName - Name of the tool being executed
 * @param timestamp - Start timestamp in milliseconds
 * @param index - Content block index (default: 0)
 * @returns A tool_execution_start StreamEvent
 */
export function toolExecutionStart(
  toolCallId: string,
  toolName: string,
  timestamp: number,
  index = 0
): StreamEvent {
  return {
    type: StreamEventType.ToolExecutionStart,
    index,
    delta: { toolCallId, toolName, timestamp },
  };
}

/**
 * Creates a tool execution end stream event.
 *
 * @param toolCallId - Unique identifier for the tool call
 * @param toolName - Name of the tool that was executed
 * @param result - The result from the tool execution
 * @param isError - Whether the execution resulted in an error
 * @param timestamp - End timestamp in milliseconds
 * @param index - Content block index (default: 0)
 * @returns A tool_execution_end StreamEvent
 */
export function toolExecutionEnd(
  toolCallId: string,
  toolName: string,
  result: unknown,
  isError: boolean,
  timestamp: number,
  index = 0
): StreamEvent {
  return {
    type: StreamEventType.ToolExecutionEnd,
    index,
    delta: { toolCallId, toolName, result, isError, timestamp },
  };
}
