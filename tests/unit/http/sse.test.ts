import { test, expect, describe } from 'bun:test';
import { parseSSEStream } from '../../../src/http/sse.ts';
import { StreamEventType } from '../../../src/types/stream.ts';

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

  test('parses data lines without a space', async () => {
    const stream = textToStream('data:{"message":"hello"}\n\n');
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
    const first = events[0] as { id?: number };
    const second = events[1] as { id?: number };
    const third = events[2] as { id?: number };
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(third.id).toBe(3);
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
      `event: ${StreamEventType.MessageStart}\ndata: {"type": "start"}\n\n`
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    const event = events[0] as { _eventType?: string; type?: string };
    expect(event._eventType).toBe(StreamEventType.MessageStart);
    expect(event.type).toBe('start');
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
    const event = events[0] as { message?: string };
    expect(event.message).toBe('test');
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
    const first = events[0] as { part?: string };
    const second = events[1] as { part?: string };
    expect(first.part).toBe('one');
    expect(second.part).toBe('two');
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
    const event = events[0] as { valid?: boolean };
    expect(event.valid).toBe(true);
  });

  test('parses multi-line data fields', async () => {
    const stream = textToStream(
      'data: {"message":\n' +
      'data: "hello"}\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    const event = events[0] as { message?: string };
    expect(event.message).toBe('hello');
  });

  test('handles CRLF line endings', async () => {
    const stream = textToStream('data: {"message": "hello"}\r\n\r\n');
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    const event = events[0] as { message?: string };
    expect(event.message).toBe('hello');
  });

  test('does not carry event type across events', async () => {
    const stream = textToStream(
      `event: ${StreamEventType.MessageStart}\ndata: {"type": "start"}\n\n` +
      'data: {"type": "next"}\n\n'
    );
    const events: unknown[] = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    const first = events[0] as { _eventType?: string };
    const second = events[1] as { _eventType?: string };
    expect(first._eventType).toBe(StreamEventType.MessageStart);
    expect(second._eventType).toBeUndefined();
  });

  test('propagates stream errors', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"message":"hi"}\n\n'));
        controller.error(new Error('stream aborted'));
      },
    });

    const consume = async () => {
      for await (const _event of parseSSEStream(stream)) {
        // consume until error
      }
    };

    await expect(consume()).rejects.toThrow('stream aborted');
  });
});
