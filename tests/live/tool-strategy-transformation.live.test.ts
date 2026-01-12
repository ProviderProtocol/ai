import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import type { OpenAICompletionsParams } from '../../src/openai/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import type { ToolUseStrategy, Tool } from '../../src/types/tool.ts';

/**
 * Live tests for ToolUseStrategy input/output transformation
 * Tests that onBeforeCall can transform params and onAfterCall can transform results
 */

interface EchoParams {
  message: string;
  prefix?: string;
}

const echoTool: Tool<EchoParams, string> = {
  name: 'echo',
  description: 'Echoes back the message with an optional prefix',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The message to echo' },
      prefix: { type: 'string', description: 'Optional prefix to add' },
    },
    required: ['message'],
  },
  run: (params) => {
    const prefix = params.prefix ? `${params.prefix}: ` : '';
    return `${prefix}${params.message}`;
  },
};

describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Tool Strategy Transformation', () => {
  test('onBeforeCall can transform input parameters', async () => {
    const receivedParams: unknown[] = [];

    const strategy: ToolUseStrategy = {
      onBeforeCall: (_tool, params) => {
        receivedParams.push(params);
        return {
          proceed: true,
          params: {
            ...(params as EchoParams),
            prefix: 'INJECTED',
          },
        };
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await gpt.generate('Use the echo tool with message "hello world". Do not add any prefix yourself.');

    // Tool should have been called
    expect(turn.toolExecutions.length).toBeGreaterThan(0);

    // The result should contain the injected prefix
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toContain('INJECTED');
    expect(execution.result).toContain('hello');
  }, 30000);

  test('onAfterCall can transform output result', async () => {
    const strategy: ToolUseStrategy = {
      onAfterCall: (_tool, _params, result) => {
        return {
          result: `[TRANSFORMED] ${result}`,
        };
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await gpt.generate('Use the echo tool with message "test message".');

    // Tool should have been called
    expect(turn.toolExecutions.length).toBeGreaterThan(0);

    // The recorded result should be transformed
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toContain('[TRANSFORMED]');
    expect(execution.result).toContain('test message');
  }, 30000);

  test('combined input and output transformation', async () => {
    const executionLog: { phase: string; data: unknown }[] = [];

    const strategy: ToolUseStrategy = {
      onBeforeCall: (_tool, params) => {
        executionLog.push({ phase: 'before', data: params });
        return {
          proceed: true,
          params: {
            ...(params as EchoParams),
            prefix: 'INPUT_TRANSFORMED',
          },
        };
      },
      onAfterCall: (_tool, params, result) => {
        executionLog.push({ phase: 'after', data: { params, result } });
        return {
          result: `OUTPUT_TRANSFORMED: ${result}`,
        };
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await gpt.generate('Use the echo tool with message "combined test".');

    // Both hooks should have been called
    expect(executionLog.filter((e) => e.phase === 'before').length).toBeGreaterThan(0);
    expect(executionLog.filter((e) => e.phase === 'after').length).toBeGreaterThan(0);

    // Result should show both transformations
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toContain('OUTPUT_TRANSFORMED');
    expect(execution.result).toContain('INPUT_TRANSFORMED');
  }, 30000);

  test('returning true from onBeforeCall preserves original params', async () => {
    const receivedParams: unknown[] = [];

    const strategy: ToolUseStrategy = {
      onBeforeCall: (_tool, params) => {
        receivedParams.push(params);
        return true; // Original boolean return
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await gpt.generate('Use the echo tool with message "unchanged".');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);

    // Result should not have any prefix since we didn't transform
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toBe('unchanged');
  }, 30000);

  test('returning void from onAfterCall preserves original result', async () => {
    let afterCallInvoked = false;

    const strategy: ToolUseStrategy = {
      onAfterCall: () => {
        afterCallInvoked = true;
        // Return void (no transformation)
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await gpt.generate('Use the echo tool with message "original".');

    expect(afterCallInvoked).toBe(true);
    expect(turn.toolExecutions.length).toBeGreaterThan(0);

    // Result should be unchanged
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toBe('original');
  }, 30000);

  test('onBeforeCall proceed:false skips tool execution', async () => {
    let beforeCallCount = 0;

    const strategy: ToolUseStrategy = {
      onBeforeCall: () => {
        beforeCallCount++;
        return { proceed: false };
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await gpt.generate('Use the echo tool with message "test blocked".');

    // onBeforeCall should have been invoked
    expect(beforeCallCount).toBeGreaterThan(0);

    // When skipped, tool doesn't execute so no execution is recorded
    // The model receives "Tool execution skipped" as the result
    // and the assistant response should reflect this
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 30000);
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Tool Strategy Transformation', () => {
  test('onBeforeCall can transform input parameters', async () => {
    const strategy: ToolUseStrategy = {
      onBeforeCall: (_tool, params) => ({
        proceed: true,
        params: {
          ...(params as EchoParams),
          prefix: 'CLAUDE_INJECTED',
        },
      }),
    };

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: { max_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await claude.generate('Use the echo tool with message "anthropic test".');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toContain('CLAUDE_INJECTED');
  }, 30000);

  test('onAfterCall can transform output result', async () => {
    const strategy: ToolUseStrategy = {
      onAfterCall: (_tool, _params, result) => ({
        result: `[CLAUDE_TRANSFORMED] ${result}`,
      }),
    };

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: { max_tokens: 200 },
      tools: [echoTool],
      toolStrategy: strategy,
    });

    const turn = await claude.generate('Use the echo tool with message "transform this".');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    const execution = turn.toolExecutions[0]!;
    expect(execution.result).toContain('[CLAUDE_TRANSFORMED]');
  }, 30000);
});
