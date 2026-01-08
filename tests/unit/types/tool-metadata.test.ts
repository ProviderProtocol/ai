import { test, expect, describe } from 'bun:test';
import type { Tool, ToolMetadata } from '../../../src/types/tool.ts';

describe('ToolMetadata', () => {
  test('Tool accepts metadata field', () => {
    const tool: Tool = {
      name: 'testTool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        required: ['input'],
      },
      metadata: {
        anthropic: { cache_control: { type: 'ephemeral' } },
      },
      run: async () => 'result',
    };

    expect(tool.metadata).toBeDefined();
    expect(tool.metadata?.anthropic).toEqual({ cache_control: { type: 'ephemeral' } });
  });

  test('Tool works without metadata', () => {
    const tool: Tool = {
      name: 'noMetadataTool',
      description: 'Tool without metadata',
      parameters: {
        type: 'object',
        properties: {},
      },
      run: async () => 'result',
    };

    expect(tool.metadata).toBeUndefined();
  });

  test('Tool metadata supports multiple providers', () => {
    const metadata: ToolMetadata = {
      anthropic: { cache_control: { type: 'ephemeral' } },
      openai: { strict: true },
      google: { custom_field: 'value' },
    };

    const tool: Tool = {
      name: 'multiProviderTool',
      description: 'Tool with multi-provider metadata',
      parameters: {
        type: 'object',
        properties: {},
      },
      metadata,
      run: async () => 'result',
    };

    expect(tool.metadata?.anthropic).toEqual({ cache_control: { type: 'ephemeral' } });
    expect(tool.metadata?.openai).toEqual({ strict: true });
    expect(tool.metadata?.google).toEqual({ custom_field: 'value' });
  });

  test('Tool metadata allows unknown provider namespaces', () => {
    const tool: Tool = {
      name: 'futureProviderTool',
      description: 'Tool with future provider metadata',
      parameters: {
        type: 'object',
        properties: {},
      },
      metadata: {
        futureProvider: { some_option: 'value' },
      },
      run: async () => 'result',
    };

    expect(tool.metadata?.futureProvider).toEqual({ some_option: 'value' });
  });
});

describe('Anthropic Tool Metadata Transform', () => {
  test('transformTool extracts cache_control from metadata', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    const tool: Tool = {
      name: 'cachedTool',
      description: 'A tool with cache control',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
      metadata: {
        anthropic: { cache_control: { type: 'ephemeral' } },
      },
      run: async () => 'result',
    };

    const request = transformRequest(
      {
        messages: [],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'claude-3-5-sonnet-latest'
    );

    expect(request.tools).toHaveLength(1);
    const tool0 = request.tools?.[0] as { cache_control?: { type: string } };
    expect(tool0?.cache_control).toEqual({ type: 'ephemeral' });
  });

  test('transformTool works without metadata', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    const tool: Tool = {
      name: 'normalTool',
      description: 'A normal tool',
      parameters: {
        type: 'object',
        properties: {},
      },
      run: async () => 'result',
    };

    const request = transformRequest(
      {
        messages: [],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'claude-3-5-sonnet-latest'
    );

    expect(request.tools).toHaveLength(1);
    const tool0 = request.tools?.[0] as { cache_control?: { type: string } };
    expect(tool0?.cache_control).toBeUndefined();
  });
});

describe('OpenAI Tool Metadata Transform', () => {
  test('transformTool extracts strict from metadata (completions)', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.completions.ts'
    );

    const tool: Tool = {
      name: 'strictTool',
      description: 'A tool with strict mode',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
      metadata: {
        openai: { strict: true },
      },
      run: async () => 'result',
    };

    const request = transformRequest(
      {
        messages: [],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'gpt-4o'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.function?.strict).toBe(true);
  });

  test('transformTool extracts strict from metadata (responses)', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.responses.ts'
    );

    const tool: Tool = {
      name: 'strictTool',
      description: 'A tool with strict mode',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
      metadata: {
        openai: { strict: true },
      },
      run: async () => 'result',
    };

    const request = transformRequest(
      {
        messages: [],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'gpt-4o'
    );

    expect(request.tools).toBeDefined();
    const functionTool = request.tools?.find(
      (t) => t.type === 'function' && t.name === 'strictTool'
    ) as { type: 'function'; name: string; strict?: boolean } | undefined;
    expect(functionTool?.strict).toBe(true);
  });

  test('transformTool works without metadata', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.completions.ts'
    );

    const tool: Tool = {
      name: 'normalTool',
      description: 'A normal tool',
      parameters: {
        type: 'object',
        properties: {},
      },
      run: async () => 'result',
    };

    const request = transformRequest(
      {
        messages: [],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'gpt-4o'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.function?.strict).toBeUndefined();
  });
});

describe('Google cachedContent Transform', () => {
  test('transformRequest passes cachedContent to request', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const request = transformRequest(
      {
        messages: [],
        config: { apiKey: 'test' },
        params: { cachedContent: 'cachedContents/abc123' },
      },
      'gemini-1.5-flash'
    );

    expect(request.cachedContent).toBe('cachedContents/abc123');
  });

  test('transformRequest works without cachedContent', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const request = transformRequest(
      {
        messages: [],
        config: { apiKey: 'test' },
      },
      'gemini-1.5-flash'
    );

    expect(request.cachedContent).toBeUndefined();
  });
});
