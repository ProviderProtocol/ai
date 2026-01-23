import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { memoryAdapter } from '../../../../../src/middleware/pubsub/memory-adapter.ts';
import { formatSSE, runSubscriberStream } from '../../../../../src/middleware/pubsub/server/shared.ts';
import { createSubscriberStream } from '../../../../../src/middleware/pubsub/server/webapi.ts';
import { streamSubscriber as expressStreamSubscriber } from '../../../../../src/middleware/pubsub/server/express.ts';
import { streamSubscriber as h3StreamSubscriber } from '../../../../../src/middleware/pubsub/server/h3.ts';
import { streamSubscriber as fastifyStreamSubscriber } from '../../../../../src/middleware/pubsub/server/fastify.ts';
import { textDelta, messageStart, messageStop } from '../../../../../src/types/stream.ts';
import type { PubSubAdapter } from '../../../../../src/middleware/pubsub/types.ts';
import type { StreamWriter } from '../../../../../src/middleware/pubsub/server/shared.ts';

describe('shared utilities', () => {
  describe('formatSSE', () => {
    test('formats text delta event', () => {
      const event = textDelta('Hello');
      const formatted = formatSSE(event);

      expect(formatted).toMatch(/^data: /);
      expect(formatted).toMatch(/\n\n$/);
      const parsed = JSON.parse(formatted.slice(6, -2));
      expect(parsed.delta.text).toBe('Hello');
    });

    test('formats message start event', () => {
      const event = messageStart();
      const formatted = formatSSE(event);

      const parsed = JSON.parse(formatted.slice(6, -2));
      expect(parsed.type).toBe('message_start');
    });

    test('formats message stop event', () => {
      const event = messageStop();
      const formatted = formatSSE(event);

      const parsed = JSON.parse(formatted.slice(6, -2));
      expect(parsed.type).toBe('message_stop');
    });
  });

  describe('runSubscriberStream', () => {
    let adapter: PubSubAdapter;
    let writer: StreamWriter;
    let written: string[];
    let ended: boolean;

    beforeEach(() => {
      adapter = memoryAdapter();
      written = [];
      ended = false;
      writer = {
        write: (data: string) => { written.push(data); },
        end: () => { ended = true; },
      };
    });

    test('replays buffered events and completes', async () => {
      await adapter.append('stream-1', textDelta('Hello'));
      await adapter.append('stream-1', textDelta(' world'));

      const streamPromise = runSubscriberStream('stream-1', adapter, writer);

      // Wait for subscriber to connect and replay
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Remove triggers completion
      await adapter.remove('stream-1');

      await streamPromise;

      expect(written).toHaveLength(3);
      expect(written[0]).toContain('Hello');
      expect(written[1]).toContain(' world');
      expect(written[2]).toBe('data: [DONE]\n\n');
      expect(ended).toBe(true);
    });

    test('sends DONE when stream completes', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      const streamPromise = runSubscriberStream('stream-1', adapter, writer);

      await new Promise((resolve) => setTimeout(resolve, 50));
      await adapter.remove('stream-1');

      await streamPromise;

      expect(written[written.length - 1]).toBe('data: [DONE]\n\n');
      expect(ended).toBe(true);
    });

    test('handles non-existent stream with lazy creation', async () => {
      // Stream is lazily created on subscribe, completes immediately
      // when marked completed externally
      const streamPromise = runSubscriberStream('non-existent', adapter, writer);

      await new Promise((resolve) => setTimeout(resolve, 50));
      await adapter.remove('non-existent');

      await streamPromise;

      expect(written).toContain('data: [DONE]\n\n');
      expect(ended).toBe(true);
    });

    test('subscribes to live events', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      const streamPromise = runSubscriberStream('stream-1', adapter, writer);

      await new Promise((resolve) => setTimeout(resolve, 50));
      await adapter.append('stream-1', textDelta('Live event'));
      adapter.publish('stream-1', textDelta('Live event'));

      await new Promise((resolve) => setTimeout(resolve, 150));
      await adapter.remove('stream-1');

      await streamPromise;

      expect(written.some((w) => w.includes('Live event'))).toBe(true);
      expect(written[written.length - 1]).toBe('data: [DONE]\n\n');
      expect(ended).toBe(true);
    });

    test('deduplicates events published during replay', async () => {
      const base = memoryAdapter();
      adapter = {
        ...base,
        getEvents: async (streamId) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return base.getEvents(streamId);
        },
      };

      await adapter.append('stream-1', textDelta('Event 1'));
      await adapter.append('stream-1', textDelta('Event 2'));

      const streamPromise = runSubscriberStream('stream-1', adapter, writer);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const event3 = textDelta('Event 3');
      await adapter.append('stream-1', event3);
      adapter.publish('stream-1', event3);

      await new Promise((resolve) => setTimeout(resolve, 150));
      await adapter.remove('stream-1');

      await streamPromise;

      const event1Count = written.filter((w) => w.includes('Event 1')).length;
      const event2Count = written.filter((w) => w.includes('Event 2')).length;
      const event3Count = written.filter((w) => w.includes('Event 3')).length;

      expect(event1Count).toBe(1);
      expect(event2Count).toBe(1);
      expect(event3Count).toBe(1);
      expect(ended).toBe(true);
    });

    test('does not drop queued events when replay is stale', async () => {
      const base = memoryAdapter();
      adapter = {
        ...base,
        getEvents: async (streamId) => {
          const snapshot = await base.getEvents(streamId);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return snapshot;
        },
      };

      await adapter.append('stream-1', textDelta('Event 1'));
      await adapter.append('stream-1', textDelta('Event 2'));

      const streamPromise = runSubscriberStream('stream-1', adapter, writer);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const event3 = textDelta('Event 3');
      await adapter.append('stream-1', event3);
      adapter.publish('stream-1', event3);

      await new Promise((resolve) => setTimeout(resolve, 150));
      await adapter.remove('stream-1');

      await streamPromise;

      const event1Count = written.filter((w) => w.includes('Event 1')).length;
      const event2Count = written.filter((w) => w.includes('Event 2')).length;
      const event3Count = written.filter((w) => w.includes('Event 3')).length;

      expect(event1Count).toBe(1);
      expect(event2Count).toBe(1);
      expect(event3Count).toBe(1);
      expect(ended).toBe(true);
    });

    test('respects abort signal on early abort', async () => {
      await adapter.append('stream-1', textDelta('Hello'));

      const abortController = new AbortController();
      abortController.abort();

      await runSubscriberStream('stream-1', adapter, writer, {
        signal: abortController.signal,
      });

      expect(written).toHaveLength(0);
      expect(ended).toBe(true);
    });

    test('respects abort signal during stream', async () => {
      await adapter.append('stream-1', textDelta('Hello'));

      const abortController = new AbortController();

      const streamPromise = runSubscriberStream('stream-1', adapter, writer, {
        signal: abortController.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      abortController.abort();

      await streamPromise;

      expect(ended).toBe(true);
      expect(written[written.length - 1]).not.toBe('data: [DONE]\n\n');
    });
  });
});

describe('webapi adapter', () => {
  let adapter: PubSubAdapter;

  beforeEach(() => {
    adapter = memoryAdapter();
  });

  test('creates ReadableStream', () => {
    const stream = createSubscriberStream('stream-1', adapter);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  test('streams events and completes', async () => {
    await adapter.append('stream-1', textDelta('Hello'));

    const stream = createSubscriberStream('stream-1', adapter);
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    // Start reading in background
    const readPromise = (async () => {
      const chunks: string[] = [];
      let result = await reader.read();
      while (!result.done) {
        chunks.push(decoder.decode(result.value));
        result = await reader.read();
      }
      return chunks.join('');
    })();

    // Wait for subscriber to connect
    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    const combined = await readPromise;
    expect(combined).toContain('Hello');
    expect(combined).toContain('[DONE]');
  });

  test('cancel aborts the stream', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const stream = createSubscriberStream('stream-1', adapter);
    const reader = stream.getReader();

    await new Promise((resolve) => setTimeout(resolve, 50));
    await reader.cancel();

    expect(true).toBe(true);
  });
});

describe('express adapter', () => {
  let adapter: PubSubAdapter;

  function createMockResponse(): {
    res: {
      setHeader: ReturnType<typeof mock>;
      write: ReturnType<typeof mock>;
      end: ReturnType<typeof mock>;
      on: ReturnType<typeof mock>;
    };
    closeHandler: (() => void) | null;
  } {
    let closeHandler: (() => void) | null = null;
    return {
      res: {
        setHeader: mock(() => {}),
        write: mock(() => true),
        end: mock(() => {}),
        on: mock((event: string, handler: () => void) => {
          if (event === 'close') closeHandler = handler;
        }),
      },
      get closeHandler() { return closeHandler; },
    };
  }

  beforeEach(() => {
    adapter = memoryAdapter();
  });

  test('sets SSE headers', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const { res } = createMockResponse();
    const streamPromise = expressStreamSubscriber('stream-1', adapter, res);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
  });

  test('writes events and ends response', async () => {
    await adapter.append('stream-1', textDelta('Hello'));

    const { res } = createMockResponse();
    const streamPromise = expressStreamSubscriber('stream-1', adapter, res);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(res.write).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  test('registers close handler', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const { res } = createMockResponse();
    const streamPromise = expressStreamSubscriber('stream-1', adapter, res);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});

describe('h3 adapter', () => {
  let adapter: PubSubAdapter;

  function createMockEvent(): {
    event: {
      node: {
        res: {
          setHeader: ReturnType<typeof mock>;
          write: ReturnType<typeof mock>;
          end: ReturnType<typeof mock>;
          on: ReturnType<typeof mock>;
        };
      };
    };
    closeHandler: (() => void) | null;
  } {
    let closeHandler: (() => void) | null = null;
    return {
      event: {
        node: {
          res: {
            setHeader: mock(() => {}),
            write: mock(() => true),
            end: mock(() => {}),
            on: mock((eventName: string, handler: () => void) => {
              if (eventName === 'close') closeHandler = handler;
            }),
          },
        },
      },
      get closeHandler() { return closeHandler; },
    };
  }

  beforeEach(() => {
    adapter = memoryAdapter();
  });

  test('sets SSE headers', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const { event } = createMockEvent();
    const streamPromise = h3StreamSubscriber('stream-1', adapter, event);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(event.node.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
  });

  test('writes events and ends response', async () => {
    await adapter.append('stream-1', textDelta('Hello'));

    const { event } = createMockEvent();
    const streamPromise = h3StreamSubscriber('stream-1', adapter, event);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(event.node.res.write).toHaveBeenCalled();
    expect(event.node.res.end).toHaveBeenCalled();
  });

  test('registers close handler', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const { event } = createMockEvent();
    const streamPromise = h3StreamSubscriber('stream-1', adapter, event);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(event.node.res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});

describe('fastify adapter', () => {
  let adapter: PubSubAdapter;

  function createMockReply(): {
    reply: {
      raw: {
        setHeader: ReturnType<typeof mock>;
        write: ReturnType<typeof mock>;
        end: ReturnType<typeof mock>;
        on: ReturnType<typeof mock>;
      };
    };
    closeHandler: (() => void) | null;
  } {
    let closeHandler: (() => void) | null = null;
    return {
      reply: {
        raw: {
          setHeader: mock(() => {}),
          write: mock(() => true),
          end: mock(() => {}),
          on: mock((event: string, handler: () => void) => {
            if (event === 'close') closeHandler = handler;
          }),
        },
      },
      get closeHandler() { return closeHandler; },
    };
  }

  beforeEach(() => {
    adapter = memoryAdapter();
  });

  test('sets SSE headers', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const { reply } = createMockReply();
    const streamPromise = fastifyStreamSubscriber('stream-1', adapter, reply);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(reply.raw.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(reply.raw.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(reply.raw.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
  });

  test('writes events and ends response', async () => {
    await adapter.append('stream-1', textDelta('Hello'));

    const { reply } = createMockReply();
    const streamPromise = fastifyStreamSubscriber('stream-1', adapter, reply);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(reply.raw.write).toHaveBeenCalled();
    expect(reply.raw.end).toHaveBeenCalled();
  });

  test('registers close handler', async () => {
    await adapter.append('stream-1', textDelta('Setup'));

    const { reply } = createMockReply();
    const streamPromise = fastifyStreamSubscriber('stream-1', adapter, reply);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await adapter.remove('stream-1');

    await streamPromise;

    expect(reply.raw.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});
