import { test, expect, describe } from 'bun:test';
import { parsedObjectMiddleware, type ParsedStreamEvent } from '../../../src/middleware/parsed-object.ts';
import { createStreamContext } from '../../../src/middleware/runner.ts';
import { objectDelta, toolCallDelta, textDelta } from '../../../src/types/stream.ts';

describe('parsedObjectMiddleware', () => {
  describe('ObjectDelta parsing', () => {
    test('parses incremental JSON from ObjectDelta events', () => {
      const mw = parsedObjectMiddleware();
      const ctx = createStreamContext(new Map());

      // First chunk: partial object
      const event1 = objectDelta('{"name":"Jo');
      const result1 = mw.onStreamEvent!(event1, ctx);

      expect(result1).not.toBeNull();
      if (!Array.isArray(result1) && result1 !== null) {
        expect((result1 as ParsedStreamEvent).delta.parsed).toEqual({ name: 'Jo' });
      }

      // Second chunk: complete object
      const event2 = objectDelta('hn","age":30}');
      const result2 = mw.onStreamEvent!(event2, ctx);

      expect(result2).not.toBeNull();
      if (!Array.isArray(result2) && result2 !== null) {
        expect((result2 as ParsedStreamEvent).delta.parsed).toEqual({ name: 'John', age: 30 });
      }
    });

    test('accumulates text across events for same index', () => {
      const mw = parsedObjectMiddleware();
      const ctx = createStreamContext(new Map());

      mw.onStreamEvent!(objectDelta('{"items":', 0), ctx);
      mw.onStreamEvent!(objectDelta('[1,', 0), ctx);
      const result = mw.onStreamEvent!(objectDelta('2,3]}', 0), ctx);

      expect(result).not.toBeNull();
      if (!Array.isArray(result) && result !== null) {
        expect((result as ParsedStreamEvent).delta.parsed).toEqual({ items: [1, 2, 3] });
      }
    });

    test('handles different indices separately', () => {
      const mw = parsedObjectMiddleware();
      const ctx = createStreamContext(new Map());

      mw.onStreamEvent!(objectDelta('{"a":1', 0), ctx);
      mw.onStreamEvent!(objectDelta('{"b":2', 1), ctx);

      const result0 = mw.onStreamEvent!(objectDelta('}', 0), ctx);
      const result1 = mw.onStreamEvent!(objectDelta('}', 1), ctx);

      if (!Array.isArray(result0) && result0 !== null) {
        expect((result0 as ParsedStreamEvent).delta.parsed).toEqual({ a: 1 });
      }
      if (!Array.isArray(result1) && result1 !== null) {
        expect((result1 as ParsedStreamEvent).delta.parsed).toEqual({ b: 2 });
      }
    });

    test('can be disabled with parseObjects: false', () => {
      const mw = parsedObjectMiddleware({ parseObjects: false });
      const ctx = createStreamContext(new Map());

      const event = objectDelta('{"name":"John"}');
      const result = mw.onStreamEvent!(event, ctx);

      // Should pass through unchanged
      expect(result).toEqual(event);
    });
  });

  describe('ToolCallDelta parsing', () => {
    test('parses incremental JSON from ToolCallDelta events', () => {
      const mw = parsedObjectMiddleware();
      const ctx = createStreamContext(new Map());

      // First chunk
      const event1 = toolCallDelta('call_1', 'getWeather', '{"city":"To');
      const result1 = mw.onStreamEvent!(event1, ctx);

      expect(result1).not.toBeNull();
      if (!Array.isArray(result1) && result1 !== null) {
        expect((result1 as ParsedStreamEvent).delta.parsed).toEqual({ city: 'To' });
      }

      // Second chunk
      const event2 = toolCallDelta('call_1', 'getWeather', 'kyo"}');
      const result2 = mw.onStreamEvent!(event2, ctx);

      expect(result2).not.toBeNull();
      if (!Array.isArray(result2) && result2 !== null) {
        expect((result2 as ParsedStreamEvent).delta.parsed).toEqual({ city: 'Tokyo' });
      }
    });

    test('can be disabled with parseToolCalls: false', () => {
      const mw = parsedObjectMiddleware({ parseToolCalls: false });
      const ctx = createStreamContext(new Map());

      const event = toolCallDelta('call_1', 'getWeather', '{"city":"Tokyo"}');
      const result = mw.onStreamEvent!(event, ctx);

      // Should pass through unchanged
      expect(result).toEqual(event);
    });
  });

  describe('passthrough behavior', () => {
    test('passes through non-object events unchanged', () => {
      const mw = parsedObjectMiddleware();
      const ctx = createStreamContext(new Map());

      const textEvent = textDelta('Hello world');
      const result = mw.onStreamEvent!(textEvent, ctx);

      expect(result).toEqual(textEvent);
    });
  });

  describe('middleware properties', () => {
    test('has correct name', () => {
      const mw = parsedObjectMiddleware();
      expect(mw.name).toBe('parsed-object');
    });
  });

  describe('cleanup', () => {
    test('cleans up accumulated state on stream end', () => {
      const mw = parsedObjectMiddleware();
      const ctx = createStreamContext(new Map());

      // Accumulate some data
      mw.onStreamEvent!(objectDelta('{"name":"John"}'), ctx);
      mw.onStreamEvent!(toolCallDelta('call_1', 'test', '{"a":1}'), ctx);

      // Verify state was created
      expect(ctx.state.size).toBeGreaterThan(0);

      // Call onStreamEnd
      mw.onStreamEnd!(ctx);

      // Verify state was cleaned up
      expect(ctx.state.size).toBe(0);
    });
  });
});
