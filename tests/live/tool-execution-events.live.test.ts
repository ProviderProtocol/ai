import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import { google } from '../../src/google/index.ts';
import type { OpenAICompletionsParams } from '../../src/openai/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import type { StreamEvent } from '../../src/types/stream.ts';

/**
 * Live tests for tool execution streaming events
 * Tests tool_execution_start and tool_execution_end events across providers
 */

const calculator = {
  name: 'multiply',
  description: 'Multiply two numbers together',
  parameters: {
    type: 'object' as const,
    properties: {
      a: { type: 'number' as const, description: 'First number' },
      b: { type: 'number' as const, description: 'Second number' },
    },
    required: ['a', 'b'],
  },
  run: async (params: { a: number; b: number }) => {
    await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay to ensure timing
    return `The product is ${params.a * params.b}`;
  },
};

const slowTool = {
  name: 'slowOperation',
  description: 'A slow operation that takes some time',
  parameters: {
    type: 'object' as const,
    properties: {
      value: { type: 'string' as const },
    },
    required: ['value'],
  },
  run: async (params: { value: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return `Processed: ${params.value}`;
  },
};

const errorTool = {
  name: 'errorTool',
  description: 'A tool that always throws an error',
  parameters: {
    type: 'object' as const,
    properties: {
      input: { type: 'string' as const },
    },
    required: ['input'],
  },
  run: async () => {
    throw new Error('Intentional error for testing');
  },
};

describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Tool Execution Events', () => {
  test('emits tool_execution_start and tool_execution_end events', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [calculator],
    });

    const stream = gpt.stream('What is 7 times 8? Use the multiply tool.');

    const events: StreamEvent[] = [];
    const startEvents: StreamEvent[] = [];
    const endEvents: StreamEvent[] = [];

    for await (const event of stream) {
      events.push(event);
      if (event.type === 'tool_execution_start') {
        startEvents.push(event);
      }
      if (event.type === 'tool_execution_end') {
        endEvents.push(event);
      }
    }

    const turn = await stream.turn;

    // Should have tool execution events
    expect(startEvents.length).toBeGreaterThan(0);
    expect(endEvents.length).toBeGreaterThan(0);

    // Verify start event structure
    const startEvent = startEvents[0]!;
    expect(startEvent.delta.toolCallId).toBeDefined();
    expect(startEvent.delta.toolName).toBe('multiply');
    expect(startEvent.delta.timestamp).toBeDefined();
    expect(typeof startEvent.delta.timestamp).toBe('number');

    // Verify end event structure
    const endEvent = endEvents[0]!;
    expect(endEvent.delta.toolCallId).toBe(startEvent.delta.toolCallId);
    expect(endEvent.delta.toolName).toBe('multiply');
    expect(endEvent.delta.result).toContain('56');
    expect(endEvent.delta.isError).toBe(false);
    expect(endEvent.delta.timestamp).toBeDefined();

    // End timestamp should be >= start timestamp
    expect(endEvent.delta.timestamp).toBeGreaterThanOrEqual(startEvent.delta.timestamp!);

    // Final response should contain the answer
    expect(turn.response.text).toContain('56');
  }, 30000);

  test('emits events for parallel tool calls', async () => {
    const getWeather = {
      name: 'getWeather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object' as const,
        properties: { city: { type: 'string' as const } },
        required: ['city'],
      },
      run: async (params: { city: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return `${params.city}: 75°F`;
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 300 },
      tools: [getWeather],
    });

    const stream = gpt.stream(
      'What is the weather in Tokyo and Paris? Use the tool for both cities.'
    );

    const startEvents: StreamEvent[] = [];
    const endEvents: StreamEvent[] = [];

    for await (const event of stream) {
      if (event.type === 'tool_execution_start') {
        startEvents.push(event);
      }
      if (event.type === 'tool_execution_end') {
        endEvents.push(event);
      }
    }

    // Should have multiple tool execution events
    expect(startEvents.length).toBeGreaterThanOrEqual(2);
    expect(endEvents.length).toBeGreaterThanOrEqual(2);

    // Each start event should have a matching end event
    for (const start of startEvents) {
      const matchingEnd = endEvents.find(
        (e) => e.delta.toolCallId === start.delta.toolCallId
      );
      expect(matchingEnd).toBeDefined();
    }
  }, 30000);

  test('emits error in tool_execution_end for failing tool', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [errorTool],
    });

    const stream = gpt.stream(
      'Call the errorTool with input "test". Just use the tool directly.'
    );

    const endEvents: StreamEvent[] = [];

    for await (const event of stream) {
      if (event.type === 'tool_execution_end') {
        endEvents.push(event);
      }
    }

    await stream.turn;

    // Should have at least one error event
    expect(endEvents.length).toBeGreaterThan(0);
    const errorEvent = endEvents.find((e) => e.delta.isError === true);
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.delta.result).toContain('Intentional error');
  }, 30000);

  test('tool execution events have correct indices for multiple tools', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [calculator, slowTool],
    });

    const stream = gpt.stream(
      'First multiply 3 and 4, then run slowOperation with value "hello".'
    );

    const events: StreamEvent[] = [];

    for await (const event of stream) {
      if (
        event.type === 'tool_execution_start' ||
        event.type === 'tool_execution_end'
      ) {
        events.push(event);
      }
    }

    await stream.turn;

    // Should have events
    expect(events.length).toBeGreaterThan(0);

    // All events should have valid indices
    for (const event of events) {
      expect(typeof event.index).toBe('number');
      expect(event.index).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Tool Execution Events', () => {
  test('emits tool_execution_start and tool_execution_end events', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: { max_tokens: 200 },
      tools: [calculator],
    });

    const stream = claude.stream('What is 6 times 9? Use the multiply tool.');

    const startEvents: StreamEvent[] = [];
    const endEvents: StreamEvent[] = [];

    for await (const event of stream) {
      if (event.type === 'tool_execution_start') {
        startEvents.push(event);
      }
      if (event.type === 'tool_execution_end') {
        endEvents.push(event);
      }
    }

    const turn = await stream.turn;

    // Should have tool execution events
    expect(startEvents.length).toBeGreaterThan(0);
    expect(endEvents.length).toBeGreaterThan(0);

    // Verify structure
    expect(startEvents[0]!.delta.toolName).toBe('multiply');
    expect(endEvents[0]!.delta.result).toContain('54');
    expect(endEvents[0]!.delta.isError).toBe(false);

    expect(turn.response.text).toContain('54');
  }, 30000);
});

describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Tool Execution Events', () => {
  test('emits tool_execution_start and tool_execution_end events', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 200 },
      tools: [calculator],
    });

    const stream = gemini.stream('What is 5 times 11? Use the multiply tool.');

    const startEvents: StreamEvent[] = [];
    const endEvents: StreamEvent[] = [];

    for await (const event of stream) {
      if (event.type === 'tool_execution_start') {
        startEvents.push(event);
      }
      if (event.type === 'tool_execution_end') {
        endEvents.push(event);
      }
    }

    const turn = await stream.turn;

    // Should have tool execution events
    expect(startEvents.length).toBeGreaterThan(0);
    expect(endEvents.length).toBeGreaterThan(0);

    // Verify structure
    expect(startEvents[0]!.delta.toolName).toBe('multiply');
    expect(endEvents[0]!.delta.result).toContain('55');
    expect(endEvents[0]!.delta.isError).toBe(false);

    expect(turn.response.text).toContain('55');
  }, 30000);
});
