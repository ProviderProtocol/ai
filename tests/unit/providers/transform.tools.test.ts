import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../src/types/tool.ts';

const functionTool: Tool = {
  name: 'echo',
  description: 'Echo input',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
    required: ['message'],
  },
  run: async () => 'ok',
};

describe('OpenAI Responses tool merging', () => {
  test('merges params.tools with request.tools', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.responses.ts'
    );
    const { tools } = await import('../../../src/providers/openai/types.ts');

    const request = transformRequest(
      {
        messages: [],
        tools: [functionTool],
        params: { tools: [tools.webSearch()] },
        config: { apiKey: 'test' },
      },
      'gpt-4o'
    );

    const toolTypes = request.tools?.map((tool) => tool.type) ?? [];
    expect(toolTypes).toContain('function');
    expect(toolTypes).toContain('web_search');
  });
});

describe('xAI Responses tool merging', () => {
  test('merges params.tools with request.tools', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/xai/transform.responses.ts'
    );
    const { tools } = await import('../../../src/providers/xai/types.ts');

    const request = transformRequest(
      {
        messages: [],
        tools: [functionTool],
        params: { tools: [tools.webSearch()] },
        config: { apiKey: 'test' },
      },
      'grok-4'
    );

    const toolTypes = request.tools?.map((tool) => tool.type) ?? [];
    expect(toolTypes).toContain('function');
    expect(toolTypes).toContain('web_search');
  });
});

describe('Anthropic tool merging', () => {
  test('merges params.tools with request.tools', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const request = transformRequest(
      {
        messages: [],
        tools: [functionTool],
        params: { tools: [tools.webSearch()] },
        config: { apiKey: 'test' },
      },
      'claude-sonnet-4-20250514'
    );

    const requestTools = request.tools ?? [];
    const hasFunctionTool = requestTools.some((tool) => 'input_schema' in tool);
    const hasBuiltInTool = requestTools.some(
      (tool) => 'type' in tool && typeof tool.type === 'string' && tool.type.startsWith('web_search')
    );

    expect(hasFunctionTool).toBe(true);
    expect(hasBuiltInTool).toBe(true);
  });
});

describe('Google tool merging', () => {
  test('merges params.tools with request.tools', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/google/transform.ts'
    );
    const { tools } = await import('../../../src/providers/google/types.ts');

    const request = transformRequest(
      {
        messages: [],
        tools: [functionTool],
        params: { tools: [tools.googleSearch()] },
        config: { apiKey: 'test' },
      },
      'gemini-1.5-flash'
    );

    const requestTools = request.tools ?? [];
    const hasFunctionDeclarations = requestTools.some(
      (tool) => 'functionDeclarations' in tool
    );
    const hasBuiltInTool = requestTools.some(
      (tool) => 'googleSearch' in tool
    );

    expect(hasFunctionDeclarations).toBe(true);
    expect(hasBuiltInTool).toBe(true);
  });
});
