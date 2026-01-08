import { test, expect, describe } from 'bun:test';
import type {
  ToolUseStrategy,
  BeforeCallResult,
  AfterCallResult,
  Tool,
} from '../../../src/types/tool.ts';

describe('ToolUseStrategy Types', () => {
  describe('BeforeCallResult', () => {
    test('accepts proceed with no params transformation', () => {
      const result: BeforeCallResult = { proceed: true };
      expect(result.proceed).toBe(true);
      expect(result.params).toBeUndefined();
    });

    test('accepts proceed with params transformation', () => {
      const result: BeforeCallResult = {
        proceed: true,
        params: { modified: true, value: 42 },
      };
      expect(result.proceed).toBe(true);
      expect(result.params).toEqual({ modified: true, value: 42 });
    });

    test('accepts proceed false to skip execution', () => {
      const result: BeforeCallResult = { proceed: false };
      expect(result.proceed).toBe(false);
    });
  });

  describe('AfterCallResult', () => {
    test('accepts result transformation', () => {
      const result: AfterCallResult = { result: { transformed: true } };
      expect(result.result).toEqual({ transformed: true });
    });

    test('accepts primitive result', () => {
      const result: AfterCallResult = { result: 'transformed string' };
      expect(result.result).toBe('transformed string');
    });

    test('accepts null result', () => {
      const result: AfterCallResult = { result: null };
      expect(result.result).toBeNull();
    });
  });

  describe('ToolUseStrategy', () => {
    const mockTool: Tool = {
      name: 'testTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      run: () => 'result',
    };

    test('onBeforeCall can return boolean true', () => {
      const strategy: ToolUseStrategy = {
        onBeforeCall: () => true,
      };
      expect(strategy.onBeforeCall?.(mockTool, {})).toBe(true);
    });

    test('onBeforeCall can return boolean false', () => {
      const strategy: ToolUseStrategy = {
        onBeforeCall: () => false,
      };
      expect(strategy.onBeforeCall?.(mockTool, {})).toBe(false);
    });

    test('onBeforeCall can return BeforeCallResult', () => {
      const strategy: ToolUseStrategy = {
        onBeforeCall: (_tool, params) => ({
          proceed: true,
          params: { ...params as object, injected: 'value' },
        }),
      };
      const result = strategy.onBeforeCall?.(mockTool, { original: true });
      expect(result).toEqual({
        proceed: true,
        params: { original: true, injected: 'value' },
      });
    });

    test('onBeforeCall can return Promise<boolean>', async () => {
      const strategy: ToolUseStrategy = {
        onBeforeCall: async () => true,
      };
      const result = await strategy.onBeforeCall?.(mockTool, {});
      expect(result).toBe(true);
    });

    test('onBeforeCall can return Promise<BeforeCallResult>', async () => {
      const strategy: ToolUseStrategy = {
        onBeforeCall: async (_tool, params) => ({
          proceed: true,
          params: { ...params as object, async: true },
        }),
      };
      const result = await strategy.onBeforeCall?.(mockTool, { sync: false });
      expect(result).toEqual({
        proceed: true,
        params: { sync: false, async: true },
      });
    });

    test('onAfterCall can return void', () => {
      let called = false;
      const strategy: ToolUseStrategy = {
        onAfterCall: () => {
          called = true;
        },
      };
      const result = strategy.onAfterCall?.(mockTool, {}, 'original');
      expect(result).toBeUndefined();
      expect(called).toBe(true);
    });

    test('onAfterCall can return AfterCallResult', () => {
      const strategy: ToolUseStrategy = {
        onAfterCall: (_tool, _params, result) => ({
          result: { original: result, transformed: true },
        }),
      };
      const result = strategy.onAfterCall?.(mockTool, {}, 'original');
      expect(result).toEqual({
        result: { original: 'original', transformed: true },
      });
    });

    test('onAfterCall can return Promise<void>', async () => {
      let called = false;
      const strategy: ToolUseStrategy = {
        onAfterCall: async () => {
          called = true;
        },
      };
      const result = await strategy.onAfterCall?.(mockTool, {}, 'original');
      expect(result).toBeUndefined();
      expect(called).toBe(true);
    });

    test('onAfterCall can return Promise<AfterCallResult>', async () => {
      const strategy: ToolUseStrategy = {
        onAfterCall: async (_tool, _params, result) => ({
          result: `transformed: ${result}`,
        }),
      };
      const result = await strategy.onAfterCall?.(mockTool, {}, 'original');
      expect(result).toEqual({ result: 'transformed: original' });
    });

    test('full strategy with all hooks', () => {
      const calls: string[] = [];

      const strategy: ToolUseStrategy = {
        maxIterations: 5,
        onToolCall: () => {
          calls.push('onToolCall');
        },
        onBeforeCall: (_tool, params) => {
          calls.push('onBeforeCall');
          return { proceed: true, params: { ...params as object, before: true } };
        },
        onAfterCall: (_tool, _params, result) => {
          calls.push('onAfterCall');
          return { result: { original: result, after: true } };
        },
        onError: () => {
          calls.push('onError');
        },
        onMaxIterations: () => {
          calls.push('onMaxIterations');
        },
      };

      expect(strategy.maxIterations).toBe(5);

      strategy.onToolCall?.(mockTool, {});
      const beforeResult = strategy.onBeforeCall?.(mockTool, { input: 1 });
      const afterResult = strategy.onAfterCall?.(mockTool, {}, 'result');
      strategy.onError?.(mockTool, {}, new Error('test'));
      strategy.onMaxIterations?.(5);

      expect(calls).toEqual([
        'onToolCall',
        'onBeforeCall',
        'onAfterCall',
        'onError',
        'onMaxIterations',
      ]);

      expect(beforeResult).toEqual({
        proceed: true,
        params: { input: 1, before: true },
      });

      expect(afterResult).toEqual({
        result: { original: 'result', after: true },
      });
    });
  });
});
