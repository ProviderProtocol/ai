import { test, expect, describe, mock } from 'bun:test';
import { loggingMiddleware, type LogLevel } from '../../../src/middleware/logging.ts';
import { createMiddlewareContext, createStreamContext } from '../../../src/middleware/runner.ts';
import { textDelta } from '../../../src/types/stream.ts';
import type { MiddlewareContext } from '../../../src/types/middleware.ts';
import type { Tool } from '../../../src/types/tool.ts';

describe('loggingMiddleware', () => {
  describe('onStart', () => {
    test('logs start message', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push(`${level}:${msg}`),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onStart!(ctx);

      expect(logs.some((l) => l.includes('Starting llm request'))).toBe(true);
    });

    test('includes streaming label for streaming requests', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push(msg),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', true, {} as MiddlewareContext['request']);
      mw.onStart!(ctx);

      expect(logs.some((l) => l.includes('(streaming)'))).toBe(true);
    });
  });

  describe('onEnd', () => {
    test('logs completion with duration', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push(msg),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      ctx.endTime = ctx.startTime + 500;
      mw.onEnd!(ctx);

      expect(logs.some((l) => l.includes('Completed in 500ms'))).toBe(true);
    });
  });

  describe('onError', () => {
    test('logs error message', () => {
      const logs: Array<{ level: LogLevel; msg: string }> = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push({ level, msg }),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onError!(new Error('test error'), ctx);

      expect(logs.some((l) => l.level === 'error' && l.msg.includes('test error'))).toBe(true);
    });
  });

  describe('log levels', () => {
    test('filters logs below minimum level', () => {
      const logs: Array<{ level: LogLevel; msg: string }> = [];
      const mw = loggingMiddleware({
        level: 'warn',
        logger: (level, msg) => logs.push({ level, msg }),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onStart!(ctx); // info level
      mw.onError!(new Error('test'), ctx); // error level

      // Should only have error log
      expect(logs.filter((l) => l.level === 'info')).toHaveLength(0);
      expect(logs.filter((l) => l.level === 'error')).toHaveLength(1);
    });

    test('debug level shows model ID', () => {
      const logs: Array<{ level: LogLevel; msg: string }> = [];
      const mw = loggingMiddleware({
        level: 'debug',
        logger: (level, msg) => logs.push({ level, msg }),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3-opus', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onStart!(ctx);

      expect(logs.some((l) => l.level === 'debug' && l.msg.includes('claude-3-opus'))).toBe(true);
    });
  });

  describe('stream events', () => {
    test('does not log stream events by default', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push(msg),
      });

      const ctx = createStreamContext(new Map());
      const event = textDelta('hello');
      mw.onStreamEvent!(event, ctx);

      expect(logs).toHaveLength(0);
    });

    test('logs stream events when enabled', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        level: 'debug',
        logStreamEvents: true,
        logger: (level, msg) => logs.push(msg),
      });

      const ctx = createStreamContext(new Map());
      const event = textDelta('hello');
      mw.onStreamEvent!(event, ctx);

      expect(logs.some((l) => l.includes('Stream event'))).toBe(true);
    });
  });

  describe('tool logging', () => {
    test('logs tool calls by default', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push(msg),
      });

      const tool: Tool = { name: 'getWeather', description: 'test', parameters: { type: 'object', properties: {} }, run: () => {} };
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onToolCall!(tool, { city: 'Tokyo' }, ctx);

      expect(logs.some((l) => l.includes('Tool call: getWeather'))).toBe(true);
    });

    test('can disable tool logging', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logToolCalls: false,
        logger: (level, msg) => logs.push(msg),
      });

      const tool: Tool = { name: 'getWeather', description: 'test', parameters: { type: 'object', properties: {} }, run: () => {} };
      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onToolCall!(tool, { city: 'Tokyo' }, ctx);

      expect(logs).toHaveLength(0);
    });
  });

  describe('prefix', () => {
    test('uses custom prefix', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        prefix: '[CUSTOM]',
        logger: (level, msg) => logs.push(msg),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onStart!(ctx);

      expect(logs[0]).toStartWith('[CUSTOM]');
    });

    test('uses default prefix [PP]', () => {
      const logs: string[] = [];
      const mw = loggingMiddleware({
        logger: (level, msg) => logs.push(msg),
      });

      const ctx = createMiddlewareContext('llm', 'claude-3', 'anthropic', false, {} as MiddlewareContext['request']);
      mw.onStart!(ctx);

      expect(logs[0]).toStartWith('[PP]');
    });
  });

  describe('middleware properties', () => {
    test('has correct name', () => {
      const mw = loggingMiddleware();
      expect(mw.name).toBe('logging');
    });

    test('passes through stream events', () => {
      const mw = loggingMiddleware();
      const ctx = createStreamContext(new Map());
      const event = textDelta('hello');
      const result = mw.onStreamEvent!(event, ctx);

      expect(result).toEqual(event);
    });
  });
});
