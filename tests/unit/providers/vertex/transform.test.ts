import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../../src/types/tool.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../../src/types/messages.ts';

describe('Vertex Gemini toolConfig Transform', () => {
  test('transformGeminiRequest passes toolConfig from params to request', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const toolConfig = {
      functionCallingConfig: {
        mode: 'ANY' as const,
        allowedFunctionNames: ['getWeather'],
      },
    };

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        config: { apiKey: 'test' },
        params: { toolConfig },
      },
      'gemini-3-flash-preview'
    );

    expect(request.toolConfig).toEqual(toolConfig);
  });

  test('transformGeminiRequest works without toolConfig', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.toolConfig).toBeUndefined();
  });

  test('transformGeminiRequest passes toolConfig with mode NONE', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const toolConfig = {
      functionCallingConfig: {
        mode: 'NONE' as const,
      },
    };

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        config: { apiKey: 'test' },
        params: { toolConfig },
      },
      'gemini-3-flash-preview'
    );

    expect(request.toolConfig).toEqual(toolConfig);
    expect(request.toolConfig?.functionCallingConfig?.mode).toBe('NONE');
  });

  test('transformGeminiRequest passes toolConfig with mode AUTO', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const toolConfig = {
      functionCallingConfig: {
        mode: 'AUTO' as const,
      },
    };

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        config: { apiKey: 'test' },
        params: { toolConfig },
      },
      'gemini-3-flash-preview'
    );

    expect(request.toolConfig?.functionCallingConfig?.mode).toBe('AUTO');
  });
});

describe('Vertex Gemini Message Transform', () => {
  test('transformGeminiRequest transforms user message', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello world' }])],
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.contents).toHaveLength(1);
    expect(request.contents[0]?.role).toBe('user');
    expect(request.contents[0]?.parts).toHaveLength(1);
    expect((request.contents[0]?.parts[0] as { text: string })?.text).toBe('Hello world');
  });

  test('transformGeminiRequest transforms assistant message', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Hello' }]),
          new AssistantMessage([{ type: 'text', text: 'Hi there!' }]),
        ],
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.contents).toHaveLength(2);
    expect(request.contents[1]?.role).toBe('model');
    expect((request.contents[1]?.parts[0] as { text: string })?.text).toBe('Hi there!');
  });

  test('transformGeminiRequest transforms system prompt', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        system: 'You are a helpful assistant.',
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.systemInstruction).toBeDefined();
    expect(request.systemInstruction?.parts).toHaveLength(1);
    expect((request.systemInstruction?.parts[0] as { text: string })?.text).toBe('You are a helpful assistant.');
  });

  test('transformGeminiRequest transforms image content', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [
          new UserMessage([
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              mimeType: 'image/png',
              source: { type: 'base64', data: 'dGVzdA==' },
            },
          ]),
        ],
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.contents[0]?.parts).toHaveLength(2);
    const imagePart = request.contents[0]?.parts[1] as { inlineData: { mimeType: string; data: string } };
    expect(imagePart?.inlineData?.mimeType).toBe('image/png');
    expect(imagePart?.inlineData?.data).toBe('dGVzdA==');
  });
});

describe('Vertex Gemini Tool Transform', () => {
  test('transformGeminiRequest transforms tools', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const tool: Tool = {
      name: 'getWeather',
      description: 'Get the weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'The city name' },
        },
        required: ['location'],
      },
      run: async () => 'result',
    };

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.functionDeclarations).toHaveLength(1);
    expect(request.tools?.[0]?.functionDeclarations[0]?.name).toBe('getWeather');
    expect(request.tools?.[0]?.functionDeclarations[0]?.description).toBe('Get the weather for a location');
  });

  test('transformGeminiRequest with tools and toolConfig', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const tool: Tool = {
      name: 'getWeather',
      description: 'Get the weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
        required: ['location'],
      },
      run: async () => 'result',
    };

    const toolConfig = {
      functionCallingConfig: {
        mode: 'ANY' as const,
        allowedFunctionNames: ['getWeather'],
      },
    };

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [tool],
        params: { toolConfig },
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.tools).toBeDefined();
    expect(request.toolConfig).toEqual(toolConfig);
  });
});

describe('Vertex Gemini Generation Config Transform', () => {
  test('transformGeminiRequest passes generation parameters', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        params: {
          maxOutputTokens: 1000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        },
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.generationConfig?.maxOutputTokens).toBe(1000);
    expect(request.generationConfig?.temperature).toBe(0.7);
    expect(request.generationConfig?.topP).toBe(0.9);
    expect(request.generationConfig?.topK).toBe(40);
  });

  test('transformGeminiRequest passes thinking config', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        params: {
          thinkingConfig: {
            thinkingBudget: 4096,
          },
        },
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.generationConfig?.thinkingConfig?.thinkingBudget).toBe(4096);
  });

  test('toolConfig is not included in generationConfig', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const toolConfig = {
      functionCallingConfig: {
        mode: 'ANY' as const,
      },
    };

    const request = transformGeminiRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        params: {
          maxOutputTokens: 100,
          toolConfig,
        },
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.toolConfig).toEqual(toolConfig);
    expect(request.generationConfig?.maxOutputTokens).toBe(100);
    expect((request.generationConfig as Record<string, unknown>)?.toolConfig).toBeUndefined();
  });
});

describe('Vertex Gemini Response Transform', () => {
  test('transformGeminiResponse transforms text response', async () => {
    const { transformGeminiResponse } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const response = transformGeminiResponse({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Hello there!' }],
        },
        finishReason: 'STOP',
        index: 0,
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });

    expect(response.message.content).toHaveLength(1);
    expect((response.message.content[0] as { type: string; text: string }).text).toBe('Hello there!');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
    expect(response.usage.totalTokens).toBe(15);
    expect(response.stopReason).toBe('end_turn');
  });

  test('transformGeminiResponse transforms function call response', async () => {
    const { transformGeminiResponse } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const response = transformGeminiResponse({
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            functionCall: {
              name: 'getWeather',
              args: { location: 'Tokyo' },
            },
          }],
        },
        finishReason: 'TOOL_USE',
        index: 0,
      }],
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 10,
        totalTokenCount: 30,
      },
    });

    expect(response.message.toolCalls).toHaveLength(1);
    expect(response.message.toolCalls?.[0]?.toolName).toBe('getWeather');
    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ location: 'Tokyo' });
    expect(response.stopReason).toBe('tool_use');
  });

  test('transformGeminiResponse handles MAX_TOKENS finish reason', async () => {
    const { transformGeminiResponse } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const response = transformGeminiResponse({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Truncated...' }],
        },
        finishReason: 'MAX_TOKENS',
        index: 0,
      }],
    });

    expect(response.stopReason).toBe('max_tokens');
  });

  test('transformGeminiResponse handles SAFETY finish reason', async () => {
    const { transformGeminiResponse } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const response = transformGeminiResponse({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: '' }],
        },
        finishReason: 'SAFETY',
        index: 0,
      }],
    });

    expect(response.stopReason).toBe('content_filter');
  });

  test('transformGeminiResponse throws on no candidates', async () => {
    const { transformGeminiResponse } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    expect(() => transformGeminiResponse({ candidates: [] })).toThrow('No candidates');
  });
});

describe('Vertex Gemini Stream Transform', () => {
  test('createGeminiStreamState creates initial state', async () => {
    const { createGeminiStreamState } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const state = createGeminiStreamState();

    expect(state.content).toBe('');
    expect(state.toolCalls).toHaveLength(0);
    expect(state.finishReason).toBeNull();
    expect(state.isFirstChunk).toBe(true);
  });

  test('transformGeminiStreamChunk handles text delta', async () => {
    const { createGeminiStreamState, transformGeminiStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const state = createGeminiStreamState();
    const events = transformGeminiStreamChunk({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Hello' }],
        },
        finishReason: null,
        index: 0,
      }],
    }, state);

    expect(events.some(e => e.type === 'message_start')).toBe(true);
    expect(events.some(e => e.type === 'text_delta')).toBe(true);
    expect(state.content).toBe('Hello');
    expect(state.isFirstChunk).toBe(false);
  });

  test('transformGeminiStreamChunk handles function call', async () => {
    const { createGeminiStreamState, transformGeminiStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const state = createGeminiStreamState();
    state.isFirstChunk = false;

    const events = transformGeminiStreamChunk({
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            functionCall: {
              name: 'getWeather',
              args: { location: 'NYC' },
            },
          }],
        },
        finishReason: null,
        index: 0,
      }],
    }, state);

    expect(events.some(e => e.type === 'tool_call_delta')).toBe(true);
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0]?.name).toBe('getWeather');
  });

  test('buildGeminiResponseFromState builds final response', async () => {
    const { createGeminiStreamState, buildGeminiResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const state = createGeminiStreamState();
    state.content = 'Complete response';
    state.inputTokens = 10;
    state.outputTokens = 20;
    state.totalTokens = 30;
    state.finishReason = 'STOP';

    const response = buildGeminiResponseFromState(state);

    expect((response.message.content[0] as { type: string; text: string })?.text).toBe('Complete response');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(20);
    expect(response.stopReason).toBe('end_turn');
  });
});

describe('Vertex Gemini Tool Result Transform', () => {
  test('transformGeminiRequest transforms tool result message', async () => {
    const { transformGeminiRequest } = await import(
      '../../../../src/providers/vertex/transform.gemini.ts'
    );

    const toolResultMessage = new ToolResultMessage([
      {
        toolCallId: 'getWeather:call123',
        result: 'Sunny, 72°F',
        isError: false,
      },
    ]);

    const request = transformGeminiRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'What is the weather?' }]),
          new AssistantMessage(
            [],
            [{ toolCallId: 'getWeather:call123', toolName: 'getWeather', arguments: { location: 'NYC' } }]
          ),
          toolResultMessage,
        ],
        config: { apiKey: 'test' },
      },
      'gemini-3-flash-preview'
    );

    expect(request.contents).toHaveLength(3);
    const toolResultContent = request.contents[2];
    expect(toolResultContent?.role).toBe('user');
    expect(toolResultContent?.parts).toHaveLength(1);
    const part = toolResultContent?.parts[0] as { functionResponse: { name: string; response: { result: string } } };
    expect(part?.functionResponse?.name).toBe('getWeather');
    expect(part?.functionResponse?.response?.result).toBe('Sunny, 72°F');
  });
});
