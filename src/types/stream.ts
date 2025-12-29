import type { Turn } from './turn.ts';

/**
 * Stream event types
 */
export type StreamEventType =
  | 'text_delta'
  | 'reasoning_delta'
  | 'image_delta'
  | 'audio_delta'
  | 'video_delta'
  | 'tool_call_delta'
  | 'message_start'
  | 'message_stop'
  | 'content_block_start'
  | 'content_block_stop';

/**
 * Event delta data (type-specific)
 */
export interface EventDelta {
  text?: string;
  data?: Uint8Array;
  toolCallId?: string;
  toolName?: string;
  argumentsJson?: string;
}

/**
 * A streaming event
 */
export interface StreamEvent {
  /** Event type */
  type: StreamEventType;

  /** Index of the content block this event belongs to */
  index: number;

  /** Event data (type-specific) */
  delta: EventDelta;
}

/**
 * Stream result - async iterable that also provides final turn
 */
export interface StreamResult<TData = unknown>
  extends AsyncIterable<StreamEvent> {
  /**
   * Get the complete Turn after streaming finishes.
   * Resolves when the stream completes.
   */
  readonly turn: Promise<Turn<TData>>;

  /** Abort the stream */
  abort(): void;
}

/**
 * Create a stream result from an async generator and completion promise
 */
export function createStreamResult<TData = unknown>(
  generator: AsyncGenerator<StreamEvent, void, unknown>,
  turnPromise: Promise<Turn<TData>>,
  abortController: AbortController
): StreamResult<TData> {
  return {
    [Symbol.asyncIterator]() {
      return generator;
    },
    turn: turnPromise,
    abort() {
      abortController.abort();
    },
  };
}

/**
 * Create a text delta event
 */
export function textDelta(text: string, index = 0): StreamEvent {
  return {
    type: 'text_delta',
    index,
    delta: { text },
  };
}

/**
 * Create a tool call delta event
 */
export function toolCallDelta(
  toolCallId: string,
  toolName: string,
  argumentsJson: string,
  index = 0
): StreamEvent {
  return {
    type: 'tool_call_delta',
    index,
    delta: { toolCallId, toolName, argumentsJson },
  };
}

/**
 * Create a message start event
 */
export function messageStart(): StreamEvent {
  return {
    type: 'message_start',
    index: 0,
    delta: {},
  };
}

/**
 * Create a message stop event
 */
export function messageStop(): StreamEvent {
  return {
    type: 'message_stop',
    index: 0,
    delta: {},
  };
}

/**
 * Create a content block start event
 */
export function contentBlockStart(index: number): StreamEvent {
  return {
    type: 'content_block_start',
    index,
    delta: {},
  };
}

/**
 * Create a content block stop event
 */
export function contentBlockStop(index: number): StreamEvent {
  return {
    type: 'content_block_stop',
    index,
    delta: {},
  };
}
