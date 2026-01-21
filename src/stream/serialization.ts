/**
 * @fileoverview Stream event serialization utilities.
 *
 * Converts stream events to and from JSON-safe representations,
 * including base64 encoding for binary delta data.
 *
 * @module stream/serialization
 * @internal
 */

import type { StreamEvent, EventDelta } from '../types/stream.ts';

/**
 * Serialize a StreamEvent for JSON transport.
 * Converts Uint8Array data to base64 string.
 */
export function serializeStreamEvent(event: StreamEvent): StreamEvent {
  const delta = event.delta;

  if (delta.data instanceof Uint8Array) {
    const { data, ...rest } = delta;
    const bytes = Array.from(data);
    const base64 = btoa(bytes.map((b) => String.fromCharCode(b)).join(''));
    return {
      type: event.type,
      index: event.index,
      delta: { ...rest, data: base64 as unknown as Uint8Array },
    };
  }

  return event;
}

/**
 * Deserialize a StreamEvent from JSON transport.
 * Converts base64 string data back to Uint8Array.
 */
export function deserializeStreamEvent(event: StreamEvent): StreamEvent {
  const delta = event.delta as EventDelta & { data?: string | Uint8Array };
  if (typeof delta.data === 'string') {
    const binaryString = atob(delta.data);
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    return {
      type: event.type,
      index: event.index,
      delta: { ...delta, data: bytes },
    };
  }

  return event;
}
