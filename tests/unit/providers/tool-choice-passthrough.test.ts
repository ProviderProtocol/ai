import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../src/types/tool.ts';
import { UserMessage } from '../../../src/types/messages.ts';

const functionTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string' },
    },
    required: ['city'],
  },
  run: async () => ({ temp: 72 }),
};

describe('Anthropic tool_choice passthrough', () => {
  test('defaults to auto when tool_choice not provided', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    const request = transformRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [functionTool],
        config: { apiKey: 'test' },
      },
      'claude-sonnet-4-20250514'
    );

    expect(request.tool_choice).toEqual({ type: 'auto' });
  });

  test('preserves tool_choice when set in params', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    const request = transformRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [functionTool],
        params: { tool_choice: { type: 'any' } },
        config: { apiKey: 'test' },
      },
      'claude-sonnet-4-20250514'
    );

    expect(request.tool_choice).toEqual({ type: 'any' });
  });

  test('preserves tool_choice with specific tool', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    const request = transformRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [functionTool],
        params: { tool_choice: { type: 'tool', name: 'get_weather' } },
        config: { apiKey: 'test' },
      },
      'claude-sonnet-4-20250514'
    );

    expect(request.tool_choice).toEqual({ type: 'tool', name: 'get_weather' });
  });
});

describe('xAI Messages tool_choice passthrough', () => {
  test('defaults to auto when tool_choice not provided', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/xai/transform.messages.ts'
    );

    const request = transformRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [functionTool],
        config: { apiKey: 'test' },
      },
      'grok-3'
    );

    expect(request.tool_choice).toEqual({ type: 'auto' });
  });

  test('preserves tool_choice when set in params', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/xai/transform.messages.ts'
    );

    const request = transformRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [functionTool],
        params: { tool_choice: { type: 'any' } },
        config: { apiKey: 'test' },
      },
      'grok-3'
    );

    expect(request.tool_choice).toEqual({ type: 'any' });
  });

  test('preserves tool_choice with specific tool', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/xai/transform.messages.ts'
    );

    const request = transformRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [functionTool],
        params: { tool_choice: { type: 'tool', name: 'get_weather' } },
        config: { apiKey: 'test' },
      },
      'grok-3'
    );

    expect(request.tool_choice).toEqual({ type: 'tool', name: 'get_weather' });
  });
});
