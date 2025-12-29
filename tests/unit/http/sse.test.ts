import { test, expect, describe } from 'bun:test';
import { parseSSEStream } from '../../../src/http/sse.ts';

/**
 * Helper to create a ReadableStream from text
 */
function textToStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/**
 * Helper to create a chunked stream
 */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('parseSSEStream', () => {
  test('parses single event', async () => {
    const stream = textToStream('data: {"message": "hello"}\n\n');
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ message: 'hello' });
  });

  test('parses multiple events', async () => {
    const stream = textToStream(
      'data: {"id": 1}\n\ndata: {"id": 2}\n\ndata: {"id": 3}\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect((events[0] as any).id).toBe(1);
    expect((events[1] as any).id).toBe(2);
    expect((events[2] as any).id).toBe(3);
  });

  test('handles [DONE] terminator', async () => {
    const stream = textToStream(
      'data: {"chunk": 1}\n\ndata: {"chunk": 2}\n\ndata: [DONE]\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
  });

  test('handles event types', async () => {
    const stream = textToStream(
      'event: message_start\ndata: {"type": "start"}\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect((events[0] as any)._eventType).toBe('message_start');
    expect((events[0] as any).type).toBe('start');
  });

  test('ignores comment lines', async () => {
    const stream = textToStream(
      ': this is a comment\ndata: {"message": "test"}\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect((events[0] as any).message).toBe('test');
  });

  test('handles chunked data', async () => {
    const stream = chunkedStream([
      'data: {"part',
      '": "one"}\n\n',
      'data: {"part": "two"}\n\n',
    ]);
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect((events[0] as any).part).toBe('one');
    expect((events[1] as any).part).toBe('two');
  });

  test('skips malformed JSON', async () => {
    const stream = textToStream(
      'data: not valid json\n\ndata: {"valid": true}\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect((events[0] as any).valid).toBe(true);
  });
});
