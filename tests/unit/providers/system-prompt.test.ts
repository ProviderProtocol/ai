import { describe, expect, test } from 'bun:test';
import { UPPError } from '../../../src/types/errors.ts';

describe('System prompt normalization', () => {
  test('OpenAI completions concatenates system array', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.completions.ts'
    );

    const request = transformRequest(
      {
        messages: [],
        system: [{ text: 'Line one' }, { text: 'Line two' }],
        config: {},
      },
      'gpt-4o'
    );

    const systemMessage = request.messages?.[0];
    expect(systemMessage?.role).toBe('system');
    if (systemMessage && typeof systemMessage.content === 'string') {
      expect(systemMessage.content).toBe('Line one\n\nLine two');
    }
  });

  test('OpenAI completions rejects invalid system array', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.completions.ts'
    );

    expect(() =>
      transformRequest(
        {
          messages: [],
          system: [{ bad: 'value' }],
          config: {},
        },
        'gpt-4o'
      )
    ).toThrow(UPPError);
  });

  test('Anthropic accepts system array with cache_control', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    const system = [
      { type: 'text', text: 'Be concise.', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ];

    const request = transformRequest(
      {
        messages: [],
        system,
        params: { max_tokens: 10 },
        config: {},
      },
      'claude-3-5-sonnet-latest'
    );

    expect(Array.isArray(request.system)).toBe(true);
    const systemBlocks = request.system as Array<{ text?: string }>;
    expect(systemBlocks[0]?.text).toBe('Be concise.');
  });

  test('Anthropic rejects invalid system blocks', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );

    expect(() =>
      transformRequest(
        {
          messages: [],
          system: [{ type: 'text', text: 123 }],
          params: { max_tokens: 10 },
          config: {},
        },
        'claude-3-5-sonnet-latest'
      )
    ).toThrow(UPPError);
  });

  test('OpenRouter completions accepts system array with cache_control', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openrouter/transform.completions.ts'
    );

    const request = transformRequest(
      {
        messages: [],
        system: [{ type: 'text', text: 'You are a tester.', cache_control: { type: 'ephemeral', ttl: '1h' } }],
        config: {},
      },
      'openai/gpt-4o'
    );

    const systemMessage = request.messages?.[0];
    expect(systemMessage?.role).toBe('system');
    if (
      systemMessage &&
      systemMessage.role === 'system' &&
      Array.isArray(systemMessage.content)
    ) {
      const first = systemMessage.content[0];
      if (first && typeof first === 'object' && 'text' in first) {
        const textValue = (first as { text?: string }).text;
        expect(textValue).toBe('You are a tester.');
      }
    }
  });

  test('OpenRouter completions rejects invalid cache_control', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openrouter/transform.completions.ts'
    );

    expect(() =>
      transformRequest(
        {
          messages: [],
          system: [{ type: 'text', text: 'Bad cache', cache_control: { type: 'invalid' } }],
          config: {},
        },
        'openai/gpt-4o'
      )
    ).toThrow(UPPError);
  });

  test('Google accepts system array of text parts', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const request = transformRequest(
      {
        messages: [],
        system: [{ text: 'Stay on topic.' }],
        config: {},
      },
      'gemini-1.5-pro'
    );

    const firstPart = request.systemInstruction?.parts?.[0];
    if (firstPart && typeof firstPart === 'object' && 'text' in firstPart) {
      const textValue = (firstPart as { text?: string }).text;
      expect(textValue).toBe('Stay on topic.');
    }
  });

  test('Google rejects system array without text parts', async () => {
    const { transformRequest } = await import(
      '../../../src/providers/google/transform.ts'
    );

    expect(() =>
      transformRequest(
        {
          messages: [],
          system: [{ notText: true }],
          config: {},
        },
        'gemini-1.5-pro'
      )
    ).toThrow(UPPError);
  });
});
