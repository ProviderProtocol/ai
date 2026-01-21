/**
 * @fileoverview Parsed object middleware for incremental JSON parsing.
 *
 * This middleware parses partial JSON from ObjectDelta and ToolCallDelta
 * stream events, providing incremental structured data during streaming.
 *
 * @module middleware/parsed-object
 */

import type { Middleware, StreamContext } from '../types/middleware.ts';
import type { EventDelta, StreamEvent } from '../types/stream.ts';
import { StreamEventType } from '../types/stream.ts';
import { parsePartialJson } from '../utils/partial-json.ts';

/**
 * Event delta with parsed JSON data.
 * Extended by parsedObjectMiddleware when parsing is enabled.
 */
export interface ParsedEventDelta extends EventDelta {
  /** Incrementally parsed JSON value */
  parsed?: unknown;
}

/**
 * Stream event with parsed JSON data.
 * Returned by parsedObjectMiddleware for ObjectDelta and ToolCallDelta events.
 */
export interface ParsedStreamEvent extends Omit<StreamEvent, 'delta'> {
  delta: ParsedEventDelta;
}

/**
 * Options for parsed object middleware.
 */
export interface ParsedObjectOptions {
  /**
   * Parse ObjectDelta events (structured output responses).
   * @default true
   */
  parseObjects?: boolean;

  /**
   * Parse ToolCallDelta events (tool call arguments).
   * @default true
   */
  parseToolCalls?: boolean;
}

/**
 * Creates a middleware that parses partial JSON from stream events.
 *
 * This middleware accumulates text from ObjectDelta events and tool
 * argument JSON from ToolCallDelta events, then parses them incrementally
 * using partial JSON parsing. The parsed result is added to the event's
 * `parsed` field.
 *
 * @param options - Configuration options
 * @returns A middleware that adds parsed JSON to stream events
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { parsedObjectMiddleware } from '@providerprotocol/ai/middleware/parsed-object';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 *
 * const model = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   structure: mySchema,
 *   middleware: [parsedObjectMiddleware()],
 * });
 *
 * for await (const event of model.stream('Extract data from this text')) {
 *   if (event.type === 'object_delta') {
 *     // event.delta.parsed contains incrementally parsed object
 *     console.log(event.delta.parsed);
 *   }
 * }
 * ```
 */
/** State key for accumulated object text */
const ACCUMULATED_TEXT_KEY = 'parsedObject:text';
/** State key for accumulated tool arguments */
const ACCUMULATED_ARGS_KEY = 'parsedObject:args';

/**
 * Gets or creates the accumulated text map from state.
 */
function getAccumulatedText(state: Map<string, unknown>): Map<number, string> {
  let map = state.get(ACCUMULATED_TEXT_KEY) as Map<number, string> | undefined;
  if (!map) {
    map = new Map();
    state.set(ACCUMULATED_TEXT_KEY, map);
  }
  return map;
}

/**
 * Gets or creates the accumulated args map from state.
 */
function getAccumulatedArgs(state: Map<string, unknown>): Map<number, string> {
  let map = state.get(ACCUMULATED_ARGS_KEY) as Map<number, string> | undefined;
  if (!map) {
    map = new Map();
    state.set(ACCUMULATED_ARGS_KEY, map);
  }
  return map;
}

export function parsedObjectMiddleware(options: ParsedObjectOptions = {}): Middleware {
  const { parseObjects = true, parseToolCalls = true } = options;

  return {
    name: 'parsed-object',

    onStreamEvent(event: StreamEvent, ctx: StreamContext): StreamEvent | StreamEvent[] | null {
      if (parseObjects && event.type === StreamEventType.ObjectDelta) {
        const accumulatedText = getAccumulatedText(ctx.state);
        const current = accumulatedText.get(event.index) ?? '';
        const newText = current + (event.delta.text ?? '');
        accumulatedText.set(event.index, newText);

        const parseResult = parsePartialJson(newText);

        const parsedEvent: ParsedStreamEvent = {
          ...event,
          delta: {
            ...event.delta,
            parsed: parseResult.value,
          },
        };
        return parsedEvent as StreamEvent;
      }

      if (parseToolCalls && event.type === StreamEventType.ToolCallDelta) {
        const accumulatedArgs = getAccumulatedArgs(ctx.state);
        const current = accumulatedArgs.get(event.index) ?? '';
        const newJson = current + (event.delta.argumentsJson ?? '');
        accumulatedArgs.set(event.index, newJson);

        const parseResult = parsePartialJson(newJson);

        const parsedEvent: ParsedStreamEvent = {
          ...event,
          delta: {
            ...event.delta,
            parsed: parseResult.value,
          },
        };
        return parsedEvent as StreamEvent;
      }

      return event;
    },

    onStreamEnd(ctx: StreamContext): void {
      // Clean up accumulated state to prevent memory buildup in long sessions
      ctx.state.delete(ACCUMULATED_TEXT_KEY);
      ctx.state.delete(ACCUMULATED_ARGS_KEY);
    },
  };
}
