import { test, expect, describe, mock } from 'bun:test';
import {
  runHook,
  runErrorHook,
  runToolHook,
  runTurnHook,
  runStreamEndHook,
  createStreamTransformer,
  createMiddlewareContext,
  createStreamContext,
} from '../../../src/middleware/runner.ts';
import type { Middleware, MiddlewareContext, StreamContext } from '../../../src/types/middleware.ts';
import { StreamEventType, textDelta, objectDelta } from '../../../src/types/stream.ts';
import type { Tool } from '../../../src/types/tool.ts';
import { UserMessage, AssistantMessage } from '../../../src/types/messages.ts';
import { createTurn, emptyUsage } from '../../../src/types/turn.ts';

describe('runHook', () => {
  test('runs hooks in forward order by default', async () => {
    const order: string[] = [];
    const middlewares: Middleware[] = [
      { name: 'first', onStart: () => { order.push('first'); } },
      { name: 'second', onStart: () => { order.push('second'); } },
      { name: 'third', onStart: () => { order.push('third'); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runHook(middlewares, 'onStart', ctx);

    expect(order).toEqual(['first', 'second', 'third']);
  });

  test('runs hooks in reverse order when reverse=true', async () => {
    const order: string[] = [];
    const middlewares: Middleware[] = [
      { name: 'first', onEnd: () => { order.push('first'); } },
      { name: 'second', onEnd: () => { order.push('second'); } },
      { name: 'third', onEnd: () => { order.push('third'); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runHook(middlewares, 'onEnd', ctx, true);

    expect(order).toEqual(['third', 'second', 'first']);
  });

  test('skips middleware without the hook', async () => {
    const order: string[] = [];
    const middlewares: Middleware[] = [
      { name: 'first', onStart: () => { order.push('first'); } },
      { name: 'second' }, // No onStart
      { name: 'third', onStart: () => { order.push('third'); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runHook(middlewares, 'onStart', ctx);

    expect(order).toEqual(['first', 'third']);
  });

  test('handles async hooks', async () => {
    const order: string[] = [];
    const middlewares: Middleware[] = [
      {
        name: 'async-first',
        async onRequest() {
          await new Promise((r) => setTimeout(r, 10));
          order.push('first');
        },
      },
      {
        name: 'async-second',
        async onRequest() {
          order.push('second');
        },
      },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runHook(middlewares, 'onRequest', ctx);

    expect(order).toEqual(['first', 'second']);
  });
});

describe('runErrorHook', () => {
  test('runs onError for all middleware with the hook', async () => {
    const errors: string[] = [];
    const middlewares: Middleware[] = [
      { name: 'first', onError: (err) => { errors.push(`first:${err.message}`); } },
      { name: 'second' }, // No onError
      { name: 'third', onError: (err) => { errors.push(`third:${err.message}`); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runErrorHook(middlewares, new Error('test error'), ctx);

    expect(errors).toEqual(['first:test error', 'third:test error']);
  });

  test('continues even if error hook throws', async () => {
    const errors: string[] = [];
    const middlewares: Middleware[] = [
      {
        name: 'throwing',
        onError: () => { throw new Error('hook error'); },
      },
      { name: 'second', onError: () => { errors.push('second'); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runErrorHook(middlewares, new Error('test'), ctx);

    expect(errors).toEqual(['second']);
  });
});

describe('runToolHook', () => {
  test('runs onToolCall for all middleware', async () => {
    const calls: string[] = [];
    const tool: Tool = { name: 'testTool', description: 'test', parameters: { type: 'object', properties: {} }, run: () => {} };

    const middlewares: Middleware[] = [
      { name: 'first', onToolCall: (t, p) => { calls.push(`first:${t.name}`); } },
      { name: 'second', onToolCall: (t, p) => { calls.push(`second:${t.name}`); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runToolHook(middlewares, 'onToolCall', tool, { foo: 'bar' }, ctx);

    expect(calls).toEqual(['first:testTool', 'second:testTool']);
  });

  test('runs onToolResult for all middleware', async () => {
    const results: string[] = [];
    const tool: Tool = { name: 'testTool', description: 'test', parameters: { type: 'object', properties: {} }, run: () => {} };

    const middlewares: Middleware[] = [
      { name: 'first', onToolResult: (t, r) => { results.push(`first:${r}`); } },
      { name: 'second', onToolResult: (t, r) => { results.push(`second:${r}`); } },
    ];

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runToolHook(middlewares, 'onToolResult', tool, 'result-data', ctx);

    expect(results).toEqual(['first:result-data', 'second:result-data']);
  });
});

describe('runTurnHook', () => {
  test('runs onTurn in reverse order', async () => {
    const calls: string[] = [];
    const middlewares: Middleware[] = [
      { name: 'first', onTurn: () => { calls.push('first'); } },
      { name: 'second', onTurn: () => { calls.push('second'); } },
    ];

    const messages = [new UserMessage('Hello'), new AssistantMessage('Hi')];
    const turn = createTurn(messages, [], emptyUsage(), 1);

    const ctx = createMiddlewareContext('llm', 'test-model', 'test', false, {} as MiddlewareContext['request']);
    await runTurnHook(middlewares, turn, ctx);

    expect(calls).toEqual(['second', 'first']);
  });
});

describe('createStreamTransformer', () => {
  test('returns passthrough when no middleware have onStreamEvent', () => {
    const middlewares: Middleware[] = [
      { name: 'no-stream' },
    ];

    const ctx = createStreamContext(new Map());
    const transformer = createStreamTransformer(middlewares, ctx);

    const event = textDelta('hello');
    expect(transformer(event)).toEqual(event);
  });

  test('transforms events through middleware chain', () => {
    const middlewares: Middleware[] = [
      {
        name: 'uppercase',
        onStreamEvent(event) {
          if (event.type === StreamEventType.TextDelta && event.delta.text) {
            return { ...event, delta: { ...event.delta, text: event.delta.text.toUpperCase() } };
          }
          return event;
        },
      },
    ];

    const ctx = createStreamContext(new Map());
    const transformer = createStreamTransformer(middlewares, ctx);

    const event = textDelta('hello');
    const result = transformer(event);
    expect(result).not.toBeNull();
    if (!Array.isArray(result) && result !== null) {
      expect(result.delta.text).toBe('HELLO');
    }
  });

  test('filters events by returning null', () => {
    const middlewares: Middleware[] = [
      {
        name: 'filter',
        onStreamEvent(event) {
          if (event.type === StreamEventType.TextDelta) {
            return null;
          }
          return event;
        },
      },
    ];

    const ctx = createStreamContext(new Map());
    const transformer = createStreamTransformer(middlewares, ctx);

    expect(transformer(textDelta('hello'))).toBeNull();
    expect(transformer(objectDelta('{}'))).not.toBeNull();
  });

  test('expands events by returning array', () => {
    const middlewares: Middleware[] = [
      {
        name: 'expander',
        onStreamEvent(event) {
          if (event.type === StreamEventType.TextDelta) {
            return [event, { ...event, delta: { text: '!' } }];
          }
          return event;
        },
      },
    ];

    const ctx = createStreamContext(new Map());
    const transformer = createStreamTransformer(middlewares, ctx);

    const result = transformer(textDelta('hello'));
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(2);
    }
  });

  test('chains multiple middleware transformations', () => {
    const middlewares: Middleware[] = [
      {
        name: 'add-prefix',
        onStreamEvent(event) {
          if (event.type === StreamEventType.TextDelta) {
            return { ...event, delta: { ...event.delta, text: '[' + event.delta.text } };
          }
          return event;
        },
      },
      {
        name: 'add-suffix',
        onStreamEvent(event) {
          if (event.type === StreamEventType.TextDelta) {
            return { ...event, delta: { ...event.delta, text: event.delta.text + ']' } };
          }
          return event;
        },
      },
    ];

    const ctx = createStreamContext(new Map());
    const transformer = createStreamTransformer(middlewares, ctx);

    const result = transformer(textDelta('hello'));
    expect(result).not.toBeNull();
    if (!Array.isArray(result) && result !== null) {
      expect(result.delta.text).toBe('[hello]');
    }
  });
});

describe('runStreamEndHook', () => {
  test('runs onStreamEnd for all middleware', async () => {
    const calls: string[] = [];
    const middlewares: Middleware[] = [
      { name: 'first', onStreamEnd: () => { calls.push('first'); } },
      { name: 'second', onStreamEnd: () => { calls.push('second'); } },
    ];

    const ctx = createStreamContext(new Map());
    await runStreamEndHook(middlewares, ctx);

    expect(calls).toEqual(['first', 'second']);
  });
});

describe('createMiddlewareContext', () => {
  test('creates context with all required fields', () => {
    const request = { messages: [], config: {} };
    const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, request as MiddlewareContext['request']);

    expect(ctx.modality).toBe('llm');
    expect(ctx.modelId).toBe('claude-3');
    expect(ctx.provider).toBe('anthropic');
    expect(ctx.streaming).toBe(true);
    expect(ctx.request).toBe(request);
    expect(ctx.response).toBeUndefined();
    expect(ctx.state).toBeInstanceOf(Map);
    expect(typeof ctx.startTime).toBe('number');
    expect(ctx.endTime).toBeUndefined();
  });
});

describe('createStreamContext', () => {
  test('creates stream context with shared state', () => {
    const state = new Map<string, unknown>();
    state.set('foo', 'bar');

    const ctx = createStreamContext(state);

    expect(ctx.state).toBe(state);
    expect(ctx.state.get('foo')).toBe('bar');
  });
});
