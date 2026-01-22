import { test, expect, describe, beforeEach } from 'bun:test';
import {
  pubsubMiddleware,
  getStreamId,
  getAdapter,
  memoryAdapter,
} from '../../../../src/middleware/pubsub/index.ts';
import { createMiddlewareContext, createStreamContext } from '../../../../src/middleware/runner.ts';
import { textDelta } from '../../../../src/types/stream.ts';
import type { MiddlewareContext } from '../../../../src/types/middleware.ts';
import type { PubSubAdapter } from '../../../../src/middleware/pubsub/types.ts';

const createRequest = (): MiddlewareContext['request'] => ({
  messages: [],
  config: {},
});

describe('pubsubMiddleware', () => {
  let adapter: PubSubAdapter;

  beforeEach(() => {
    adapter = memoryAdapter();
  });

  describe('onStart', () => {
    test('stores stream ID in state when provided', () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'test-123' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);

      expect(getStreamId(ctx.state)).toBe('test-123');
    });

    test('stores adapter in state', () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'test-123' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);

      const storedAdapter = getAdapter(ctx.state);
      expect(storedAdapter).toBe(adapter);
    });

    test('does not set stream ID when not provided', () => {
      const mw = pubsubMiddleware({ adapter });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);

      expect(getStreamId(ctx.state)).toBeUndefined();
    });
  });

  describe('onRequest', () => {
    test('creates stream in adapter when streamId provided and does not exist', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'new-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);

      // Stream should exist in adapter
      const stream = await adapter.getStream('new-stream');
      expect(stream).not.toBeNull();
      expect(stream?.modelId).toBe('claude-3');
      expect(stream?.provider).toBe('anthropic');
    });

    test('does not create duplicate stream if already exists', async () => {
      // First, create an existing stream
      await adapter.create('existing-stream', { modelId: 'old-model', provider: 'old-provider' });

      const mw = pubsubMiddleware({ adapter, streamId: 'existing-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);

      // Stream should still have original data
      const stream = await adapter.getStream('existing-stream');
      expect(stream?.modelId).toBe('old-model');
      expect(stream?.provider).toBe('old-provider');
    });

    test('skips stream creation for non-streaming requests', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'non-streaming' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);

      const stream = await adapter.getStream('non-streaming');
      expect(stream).toBeNull();
    });

    test('does nothing when streamId is not provided', async () => {
      const mw = pubsubMiddleware({ adapter });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      const result = await mw.onRequest!(ctx);

      expect(result).toBeUndefined();
    });
  });

  describe('onStreamEvent', () => {
    test('appends events to adapter', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'buffer-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      const event = textDelta('Hello');
      mw.onStreamEvent!(event, streamCtx);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = await adapter.getEvents('buffer-stream');
      expect(events).toHaveLength(1);
      expect(events![0]).toEqual(event);
    });

    test('publishes events to subscribers', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'publish-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      const receivedEvents: unknown[] = [];
      adapter.subscribe('publish-stream', (e) => receivedEvents.push(e), () => {});

      const event = textDelta('Hello');
      mw.onStreamEvent!(event, streamCtx);

      // Wait for async append->publish chain to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual(event);
    });

    test('passes through events unchanged', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'passthrough-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      const event = textDelta('Hello');
      const result = mw.onStreamEvent!(event, streamCtx);

      expect(result).toEqual(event);
    });

    test('does nothing when no streamId in state', async () => {
      const mw = pubsubMiddleware({ adapter });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      const event = textDelta('Hello');
      const result = mw.onStreamEvent!(event, streamCtx);

      // Event should pass through
      expect(result).toEqual(event);
    });
  });

  describe('onStreamEnd', () => {
    test('notifies subscribers and removes stream from adapter', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'complete-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      let completionNotified = false;
      adapter.subscribe('complete-stream', () => {}, () => {
        completionNotified = true;
      });

      await mw.onStreamEnd!(streamCtx);

      await Promise.resolve();

      expect(completionNotified).toBe(true);
      const exists = await adapter.exists('complete-stream');
      expect(exists).toBe(false);
    });

    test('waits for pending appends before completion', async () => {
      let resolveAppend: () => void;
      let appendResolvedAt: number | null = null;
      let markCompletedAt: number | null = null;

      const appendPromise = new Promise<void>((resolve) => {
        resolveAppend = () => {
          appendResolvedAt = Date.now();
          resolve();
        };
      });

      const base = memoryAdapter();
      const delayedAdapter: PubSubAdapter = {
        ...base,
        append: async (streamId, event) => {
          await appendPromise;
          await base.append(streamId, event);
        },
        markCompleted: async (streamId) => {
          markCompletedAt = Date.now();
          await base.markCompleted(streamId);
        },
      };

      const mw = pubsubMiddleware({ adapter: delayedAdapter, streamId: 'pending-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      mw.onStreamEvent!(textDelta('Hello'), streamCtx);

      const endPromise = mw.onStreamEnd!(streamCtx);
      expect(markCompletedAt).toBeNull();

      resolveAppend!();
      await endPromise;

      expect(markCompletedAt).not.toBeNull();
      expect(appendResolvedAt).not.toBeNull();
      expect(markCompletedAt ?? 0).toBeGreaterThanOrEqual(appendResolvedAt ?? 0);
    });

    test('does nothing when no streamId', async () => {
      const mw = pubsubMiddleware({ adapter });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      const streamCtx = createStreamContext(ctx.state);

      // Should not throw
      await mw.onStreamEnd!(streamCtx);
    });
  });

  describe('onError', () => {
    test('notifies subscribers and removes stream on error', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'error-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);

      let completionNotified = false;
      adapter.subscribe('error-stream', () => {}, () => {
        completionNotified = true;
      });

      await mw.onError!(new Error('test error'), ctx);

      await Promise.resolve();

      expect(completionNotified).toBe(true);
      const exists = await adapter.exists('error-stream');
      expect(exists).toBe(false);
    });

    test('does nothing when no streamId', async () => {
      const mw = pubsubMiddleware({ adapter });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);

      // Should not throw
      await mw.onError!(new Error('test error'), ctx);
    });
  });

  describe('onAbort', () => {
    test('notifies subscribers and removes stream on abort', async () => {
      const mw = pubsubMiddleware({ adapter, streamId: 'abort-stream' });
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, createRequest());

      mw.onStart!(ctx);
      await mw.onRequest!(ctx);

      let completionNotified = false;
      adapter.subscribe('abort-stream', () => {}, () => {
        completionNotified = true;
      });

      await mw.onAbort!(new Error('abort'), ctx);

      await Promise.resolve();

      expect(completionNotified).toBe(true);
      const exists = await adapter.exists('abort-stream');
      expect(exists).toBe(false);
    });
  });

  describe('middleware properties', () => {
    test('has correct name', () => {
      const mw = pubsubMiddleware({ adapter });
      expect(mw.name).toBe('pubsub');
    });
  });
});

describe('getStreamId', () => {
  test('returns undefined for empty state', () => {
    const state = new Map<string, unknown>();
    expect(getStreamId(state)).toBeUndefined();
  });

  test('returns stream ID when set', () => {
    const state = new Map<string, unknown>();
    state.set('pubsub:streamId', 'test-123');
    expect(getStreamId(state)).toBe('test-123');
  });
});

describe('getAdapter', () => {
  test('returns undefined for empty state', () => {
    const state = new Map<string, unknown>();
    expect(getAdapter(state)).toBeUndefined();
  });

  test('returns adapter when set', () => {
    const adapter = memoryAdapter();
    const state = new Map<string, unknown>();
    state.set('pubsub:adapter', adapter);
    expect(getAdapter(state)).toBe(adapter);
  });
});
