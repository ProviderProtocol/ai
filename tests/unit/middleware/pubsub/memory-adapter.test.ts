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

    test('returns true for existing stream', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      const exists = await adapter.exists('stream-1');
      expect(exists).toBe(true);
    });

    test('returns false after stream is removed', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });
      await adapter.remove('stream-1');

      const exists = await adapter.exists('stream-1');
      expect(exists).toBe(false);
    });
  });

  describe('create', () => {
    test('creates a stream entry', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      const stream = await adapter.getStream('stream-1');
      expect(stream).not.toBeNull();
      expect(stream?.streamId).toBe('stream-1');
      expect(stream?.modelId).toBe('claude-3');
      expect(stream?.provider).toBe('anthropic');
      expect(stream?.completed).toBe(false);
      expect(stream?.events).toHaveLength(0);
    });

    test('sets timestamps', async () => {
      const before = Date.now();
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });
      const after = Date.now();

      const stream = await adapter.getStream('stream-1');
      expect(stream?.createdAt).toBeGreaterThanOrEqual(before);
      expect(stream?.createdAt).toBeLessThanOrEqual(after);
      expect(stream?.updatedAt).toBe(stream?.createdAt);
    });
  });

  describe('append', () => {
    test('appends events to stream', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      await adapter.append('stream-1', textDelta('Hello'));
      await adapter.append('stream-1', textDelta(' world'));

      const events = await adapter.getEvents('stream-1');
      expect(events).not.toBeNull();
      expect(events).toHaveLength(2);
      expect(events?.[0]?.delta.text).toBe('Hello');
      expect(events?.[1]?.delta.text).toBe(' world');
    });

    test('updates timestamp on append', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });
      const before = (await adapter.getStream('stream-1'))?.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 5));
      await adapter.append('stream-1', textDelta('Hello'));

      const after = (await adapter.getStream('stream-1'))?.updatedAt;
      expect(after).toBeGreaterThan(before!);
    });

    test('ignores append to non-existent stream', async () => {
      await adapter.append('non-existent', textDelta('Hello'));

      const events = await adapter.getEvents('non-existent');
      expect(events).toBeNull();
    });
  });

  describe('markCompleted', () => {
    test('marks stream as completed', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      await adapter.markCompleted('stream-1');

      const completed = await adapter.isCompleted('stream-1');
      expect(completed).toBe(true);
    });

    test('ignores non-existent stream', async () => {
      await adapter.markCompleted('non-existent');

      const completed = await adapter.isCompleted('non-existent');
      expect(completed).toBe(false);
    });
  });

  describe('isCompleted', () => {
    test('returns false for incomplete stream', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      const completed = await adapter.isCompleted('stream-1');
      expect(completed).toBe(false);
    });

    test('returns false for non-existent stream', async () => {
      const completed = await adapter.isCompleted('non-existent');
      expect(completed).toBe(false);
    });
  });

  describe('getEvents', () => {
    test('returns null for non-existent stream', async () => {
      const events = await adapter.getEvents('non-existent');
      expect(events).toBeNull();
    });

    test('returns copy of events array', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });
      await adapter.append('stream-1', textDelta('Hello'));

      const events1 = await adapter.getEvents('stream-1');
      const events2 = await adapter.getEvents('stream-1');

      expect(events1).toEqual(events2);
      expect(events1).not.toBe(events2);
    });
  });

  describe('getStream', () => {
    test('returns null for non-existent stream', async () => {
      const stream = await adapter.getStream('non-existent');
      expect(stream).toBeNull();
    });
  });

  describe('subscribe/publish', () => {
    test('delivers events to subscribers', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      const received: unknown[] = [];
      adapter.subscribe('stream-1', (event) => received.push(event), () => {});

      const event = textDelta('Hello');
      adapter.publish('stream-1', event);

      await Promise.resolve();

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);
    });

    test('delivers to multiple subscribers', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

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
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      const received: unknown[] = [];
      const unsubscribe = adapter.subscribe('stream-1', (event) => received.push(event), () => {});

      adapter.publish('stream-1', textDelta('Hello'));
      unsubscribe();
      adapter.publish('stream-1', textDelta('World'));

      await Promise.resolve();

      expect(received).toHaveLength(1);
    });

    test('subscribe to non-existent stream returns no-op unsubscribe', async () => {
      const unsubscribe = adapter.subscribe('non-existent', () => {}, () => {});
      expect(() => unsubscribe()).not.toThrow();
    });

    test('publish to non-existent stream is no-op', async () => {
      expect(() => adapter.publish('non-existent', textDelta('Hello'))).not.toThrow();
    });

    test('subscriber errors do not affect other subscribers', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      const received: unknown[] = [];
      adapter.subscribe('stream-1', () => {
        throw new Error('Subscriber error');
      }, () => {});
      adapter.subscribe('stream-1', (event) => received.push(event), () => {});

      adapter.publish('stream-1', textDelta('Hello'));

      await Promise.resolve();

      expect(received).toHaveLength(1);
    });

    test('calls completion callback when stream is marked completed', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      let completed = false;
      adapter.subscribe('stream-1', () => {}, () => {
        completed = true;
      });

      await adapter.markCompleted('stream-1');

      await Promise.resolve();

      expect(completed).toBe(true);
    });

    test('completion callback errors do not affect other subscribers', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      let completed = false;
      adapter.subscribe('stream-1', () => {}, () => {
        throw new Error('Completion error');
      });
      adapter.subscribe('stream-1', () => {}, () => {
        completed = true;
      });

      await adapter.markCompleted('stream-1');

      await Promise.resolve();

      expect(completed).toBe(true);
    });
  });

  describe('remove', () => {
    test('removes stream', async () => {
      await adapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });

      await adapter.remove('stream-1');

      const stream = await adapter.getStream('stream-1');
      expect(stream).toBeNull();
    });

    test('removing non-existent stream is no-op', async () => {
      await expect(adapter.remove('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    test('evicts oldest stream when maxStreams reached', async () => {
      const smallAdapter = memoryAdapter({ maxStreams: 3 });

      await smallAdapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await smallAdapter.create('stream-2', { modelId: 'claude-3', provider: 'anthropic' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await smallAdapter.create('stream-3', { modelId: 'claude-3', provider: 'anthropic' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await smallAdapter.create('stream-4', { modelId: 'claude-3', provider: 'anthropic' });

      const stream1 = await smallAdapter.getStream('stream-1');
      const stream4 = await smallAdapter.getStream('stream-4');

      expect(stream1).toBeNull();
      expect(stream4).not.toBeNull();
    });

    test('evicts based on updatedAt, not createdAt', async () => {
      const smallAdapter = memoryAdapter({ maxStreams: 3 });

      await smallAdapter.create('stream-1', { modelId: 'claude-3', provider: 'anthropic' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await smallAdapter.create('stream-2', { modelId: 'claude-3', provider: 'anthropic' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await smallAdapter.create('stream-3', { modelId: 'claude-3', provider: 'anthropic' });

      await smallAdapter.append('stream-1', textDelta('Update'));

      await new Promise((resolve) => setTimeout(resolve, 5));
      await smallAdapter.create('stream-4', { modelId: 'claude-3', provider: 'anthropic' });

      const stream1 = await smallAdapter.getStream('stream-1');
      const stream2 = await smallAdapter.getStream('stream-2');
      const stream4 = await smallAdapter.getStream('stream-4');

      expect(stream1).not.toBeNull();
      expect(stream2).toBeNull();
      expect(stream4).not.toBeNull();
    });
  });

});
