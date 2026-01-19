import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../src/types/tool.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../src/types/messages.ts';

const searchTool: Tool = {
  name: 'search',
  description: 'Search for information',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
  run: async () => ({ results: [] }),
};

describe('Ollama tool call ID generation', () => {
  test('generates toolCallId from name and index', async () => {
    const { transformResponse } = await import(
      '../../../src/providers/ollama/transform.ts'
    );

    const response = transformResponse({
      model: 'llama3.2',
      created_at: '2024-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { name: 'search', arguments: { query: 'first' } } },
          { function: { name: 'search', arguments: { query: 'second' } } },
        ],
      },
      done: true,
      done_reason: 'stop',
      total_duration: 1000,
      load_duration: 100,
      prompt_eval_count: 10,
      prompt_eval_duration: 50,
      eval_count: 20,
      eval_duration: 200,
    });

    const toolCalls = response.message.toolCalls ?? [];
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]?.toolCallId).toBe('search_0');
    expect(toolCalls[1]?.toolCallId).toBe('search_1');
  });

  test('uses API-provided index when available', async () => {
    const { transformResponse } = await import(
      '../../../src/providers/ollama/transform.ts'
    );

    const response = transformResponse({
      model: 'llama3.2',
      created_at: '2024-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { index: 5, name: 'search', arguments: { query: 'test' } } },
        ],
      },
      done: true,
      done_reason: 'stop',
      total_duration: 1000,
      load_duration: 100,
      prompt_eval_count: 10,
      prompt_eval_duration: 50,
      eval_count: 20,
      eval_duration: 200,
    });

    const toolCalls = response.message.toolCalls ?? [];
    expect(toolCalls[0]?.toolCallId).toBe('search_5');
  });
});

describe('Ollama tool result transformation', () => {
  test('extracts tool name from toolCallId for tool results', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/ollama/transform.ts'
    );

    const toolResult = new ToolResultMessage([
      { toolCallId: 'search_0', result: { found: true } },
      { toolCallId: 'calculate_1', result: { value: 42 } },
    ]);

    const request = transformRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Search and calculate' }]),
          new AssistantMessage([], [
            { toolCallId: 'search_0', toolName: 'search', arguments: { query: 'test' } },
            { toolCallId: 'calculate_1', toolName: 'calculate', arguments: { x: 1 } },
          ]),
          toolResult,
        ],
        tools: [searchTool],
        config: {},
      },
      'llama3.2'
    );

    const toolMessages = request.messages.filter(m => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0]?.tool_name).toBe('search');
    expect(toolMessages[1]?.tool_name).toBe('calculate');
  });

  test('handles toolCallId without underscore index', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/ollama/transform.ts'
    );

    const toolResult = new ToolResultMessage([
      { toolCallId: 'search', result: { found: true } },
    ]);

    const request = transformRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Search' }]),
          toolResult,
        ],
        tools: [searchTool],
        config: {},
      },
      'llama3.2'
    );

    const toolMessages = request.messages.filter(m => m.role === 'tool');
    expect(toolMessages[0]?.tool_name).toBe('search');
  });
});

describe('Ollama streaming tool call ID consistency', () => {
  test('streaming buildResponseFromState generates consistent toolCallId format', async () => {
    const { createStreamState, buildResponseFromState } = await import(
      '../../../src/providers/ollama/transform.ts'
    );

    const state = createStreamState();
    state.model = 'llama3.2';
    state.doneReason = 'stop';
    state.toolCalls = [
      { name: 'search', args: { query: 'first' } },
      { name: 'search', args: { query: 'second' } },
    ];

    const response = buildResponseFromState(state);
    const toolCalls = response.message.toolCalls ?? [];

    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]?.toolCallId).toBe('search_0');
    expect(toolCalls[1]?.toolCallId).toBe('search_1');
  });
});

describe('Ollama tools capability', () => {
  test('ollama provider reports tools as enabled', async () => {
    const { llm } = await import('../../../src/index.ts');
    const { ollama } = await import('../../../src/ollama/index.ts');
    const model = llm({ model: ollama('llama3.2') });
    expect(model.capabilities.tools).toBe(true);
  });
});
