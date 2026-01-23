import { test, expect, describe, beforeEach } from 'bun:test';
import { memoryAdapter } from '../../../../src/middleware/pubsub/memory-adapter.ts';
import { textDelta } from '../../../../src/types/stream.ts';
import type { PubSubAdapter } from '../../../../src/middleware/pubsub/types.ts';

describe('memoryAdapter', () => {
  let adapter: PubSubAdapter;

  beforeEach(() => {
    adapter = memoryAdapter();
  });

  describe('exists', () => {
    test('returns false for non-existent stream', async () => {
      const exists = await adapter.exists('non-existent');
      expect(exists).toBe(false);
    });

    test('returns true after stream created via append', async () => {
      await adapter.append('stream-1', textDelta('Hello'));

      const exists = await adapter.exists('stream-1');
      expect(exists).toBe(true);
    });

    test('returns true after stream created via subscribe', async () => {
      adapter.subscribe('stream-1', () => {}, () => {});

      const exists = await adapter.exists('stream-1');
      expect(exists).toBe(true);
    });

    test('returns false after stream is removed', async () => {
      await adapter.append('stream-1', textDelta('Hello'));
      await adapter.remove('stream-1');

      const exists = await adapter.exists('stream-1');
      expect(exists).toBe(false);
    });
  });

  describe('append', () => {
    test('appends events to stream (lazy creation)', async () => {
      await adapter.append('stream-1', textDelta('Hello'));
      await adapter.append('stream-1', textDelta(' world'));

      const events = await adapter.getEvents('stream-1');
      expect(events).toHaveLength(2);
      expect(events[0]?.delta.text).toBe('Hello');
      expect(events[1]?.delta.text).toBe(' world');
    });

    test('creates stream lazily on first append', async () => {
      const existsBefore = await adapter.exists('new-stream');
      expect(existsBefore).toBe(false);

      await adapter.append('new-stream', textDelta('Hello'));

      const existsAfter = await adapter.exists('new-stream');
      expect(existsAfter).toBe(true);
    });
  });

  describe('getEvents', () => {
    test('returns empty array for non-existent stream', async () => {
      const events = await adapter.getEvents('non-existent');
      expect(events).toEqual([]);
    });

    test('returns copy of events array', async () => {
      await adapter.append('stream-1', textDelta('Hello'));

      const events1 = await adapter.getEvents('stream-1');
      const events2 = await adapter.getEvents('stream-1');

      expect(events1).toEqual(events2);
      expect(events1).not.toBe(events2);
    });
  });

  describe('subscribe/publish', () => {
    test('delivers events to subscribers', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      const received: unknown[] = [];
      adapter.subscribe('stream-1', (event) => received.push(event), () => {});

      const event = textDelta('Hello');
      adapter.publish('stream-1', event);

      await Promise.resolve();

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);
    });

    test('delivers to multiple subscribers', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      const received1: unknown[] = [];
      const received2: unknown[] = [];
      adapter.subscribe('stream-1', (event) => received1.push(event), () => {});
      adapter.subscribe('stream-1', (event) => received2.push(event), () => {});

      adapter.publish('stream-1', textDelta('Hello'));

      await Promise.resolve();

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    test('unsubscribe stops delivery', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      const received: unknown[] = [];
      const unsubscribe = adapter.subscribe('stream-1', (event) => received.push(event), () => {});

      adapter.publish('stream-1', textDelta('Hello'));
      unsubscribe();
      adapter.publish('stream-1', textDelta('World'));

      await Promise.resolve();

      expect(received).toHaveLength(1);
    });

    test('subscribe to non-existent stream lazily creates it', async () => {
      const received: unknown[] = [];
      const unsubscribe = adapter.subscribe('non-existent', (e) => received.push(e), () => {});

      const exists = await adapter.exists('non-existent');
      expect(exists).toBe(true);

      adapter.publish('non-existent', textDelta('Hello'));
      await Promise.resolve();
      expect(received).toHaveLength(1);

      expect(() => unsubscribe()).not.toThrow();
    });

    test('publish to non-existent stream is no-op', async () => {
      expect(() => adapter.publish('non-existent', textDelta('Hello'))).not.toThrow();
    });

    test('subscriber errors do not affect other subscribers', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      const received: unknown[] = [];
      adapter.subscribe('stream-1', () => {
        throw new Error('Subscriber error');
      }, () => {});
      adapter.subscribe('stream-1', (event) => received.push(event), () => {});

      adapter.publish('stream-1', textDelta('Hello'));

      await Promise.resolve();

      expect(received).toHaveLength(1);
    });

    test('calls completion callback when stream is removed', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      let completed = false;
      adapter.subscribe('stream-1', () => {}, () => {
        completed = true;
      });

      await adapter.remove('stream-1');

      await Promise.resolve();

      expect(completed).toBe(true);
    });

    test('completion callback errors do not affect other subscribers', async () => {
      await adapter.append('stream-1', textDelta('Setup'));

      let completed = false;
      adapter.subscribe('stream-1', () => {}, () => {
        throw new Error('Completion error');
      });
      adapter.subscribe('stream-1', () => {}, () => {
        completed = true;
      });

      await adapter.remove('stream-1');

      await Promise.resolve();

      expect(completed).toBe(true);
    });
  });

  describe('remove', () => {
    test('removes stream', async () => {
      await adapter.append('stream-1', textDelta('Hello'));

      await adapter.remove('stream-1');

      const exists = await adapter.exists('stream-1');
      expect(exists).toBe(false);
    });

    test('notifies subscribers on removal', async () => {
      await adapter.append('stream-1', textDelta('Hello'));

      let completed = false;
      adapter.subscribe('stream-1', () => {}, () => {
        completed = true;
      });

      await adapter.remove('stream-1');
      await Promise.resolve();

      expect(completed).toBe(true);
    });

    test('removing non-existent stream is no-op', async () => {
      await expect(adapter.remove('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('maxStreams limit', () => {
    test('throws when maxStreams exceeded', async () => {
      const smallAdapter = memoryAdapter({ maxStreams: 3 });

      await smallAdapter.append('stream-1', textDelta('1'));
      await smallAdapter.append('stream-2', textDelta('2'));
      await smallAdapter.append('stream-3', textDelta('3'));

      await expect(smallAdapter.append('stream-4', textDelta('4')))
        .rejects.toThrow('Maximum concurrent streams (3) exceeded');
    });

    test('allows new streams after removal', async () => {
      const smallAdapter = memoryAdapter({ maxStreams: 3 });

      await smallAdapter.append('stream-1', textDelta('1'));
      await smallAdapter.append('stream-2', textDelta('2'));
      await smallAdapter.append('stream-3', textDelta('3'));

      await smallAdapter.remove('stream-1');

      await expect(smallAdapter.append('stream-4', textDelta('4')))
        .resolves.toBeUndefined();
    });

    test('appending to existing stream does not count against limit', async () => {
      const smallAdapter = memoryAdapter({ maxStreams: 3 });

      await smallAdapter.append('stream-1', textDelta('1'));
      await smallAdapter.append('stream-2', textDelta('2'));
      await smallAdapter.append('stream-3', textDelta('3'));

      await expect(smallAdapter.append('stream-1', textDelta('more')))
        .resolves.toBeUndefined();
    });
  });
});
