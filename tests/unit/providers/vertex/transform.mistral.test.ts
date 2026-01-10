import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../../src/types/tool.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../../src/types/messages.ts';

describe('Vertex Mistral Message Transform', () => {
  test('transformMistralRequest transforms user message', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const request = transformMistralRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello world' }])],
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.role).toBe('user');
    expect(request.messages[0]?.content).toBe('Hello world');
    expect(request.model).toBe('mistral-medium-3');
  });

  test('transformMistralRequest transforms system prompt', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const request = transformMistralRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        system: 'You are a helpful assistant.',
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]?.role).toBe('system');
    expect(request.messages[0]?.content).toBe('You are a helpful assistant.');
  });

  test('transformMistralRequest transforms assistant message', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const request = transformMistralRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Hello' }]),
          new AssistantMessage([{ type: 'text', text: 'Hi there!' }]),
        ],
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.messages).toHaveLength(2);
    expect(request.messages[1]?.role).toBe('assistant');
    expect(request.messages[1]?.content).toBe('Hi there!');
  });

  test('transformMistralRequest transforms assistant message with tool calls', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const request = transformMistralRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Get weather' }]),
          new AssistantMessage(
            [],
            [{ toolCallId: 'call_123', toolName: 'getWeather', arguments: { location: 'NYC' } }]
          ),
        ],
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.messages[1]?.tool_calls).toHaveLength(1);
    expect(request.messages[1]?.tool_calls?.[0]?.function.name).toBe('getWeather');
  });

  test('transformMistralRequest transforms tool result message', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const toolResultMessage = new ToolResultMessage([
      {
        toolCallId: 'call123',
        result: 'Sunny, 72°F',
        isError: false,
      },
    ]);

    const request = transformMistralRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'What is the weather?' }]),
          new AssistantMessage(
            [],
            [{ toolCallId: 'call123', toolName: 'getWeather', arguments: { location: 'NYC' } }]
          ),
          toolResultMessage,
        ],
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.messages).toHaveLength(3);
    expect(request.messages[2]?.role).toBe('tool');
    expect(request.messages[2]?.tool_call_id).toBe('call123');
  });

  test('transformMistralRequest transforms image content', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const request = transformMistralRequest(
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
      'mistral-medium-3'
    );

    const content = request.messages[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as unknown[]).length).toBe(2);
  });
});

describe('Vertex Mistral Tool Transform', () => {
  test('transformMistralRequest transforms tools', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
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

    const request = transformMistralRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.function?.name).toBe('getWeather');
    expect(request.tool_choice).toBe('auto');
  });

  test('transformMistralRequest transforms structured output', async () => {
    const { transformMistralRequest } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const request = transformMistralRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        structure: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
        config: { apiKey: 'test' },
      },
      'mistral-medium-3'
    );

    expect(request.response_format).toEqual({ type: 'json_object' });
  });
});

describe('Vertex Mistral Response Transform', () => {
  test('transformMistralResponse transforms text response', async () => {
    const { transformMistralResponse } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const response = transformMistralResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello there!',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    expect(response.message.content).toHaveLength(1);
    expect((response.message.content[0] as { type: string; text: string }).text).toBe('Hello there!');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
    expect(response.stopReason).toBe('end_turn');
  });

  test('transformMistralResponse transforms tool call response', async () => {
    const { transformMistralResponse } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const response = transformMistralResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"location":"Tokyo"}',
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
    });

    expect(response.message.toolCalls).toHaveLength(1);
    expect(response.message.toolCalls?.[0]?.toolName).toBe('getWeather');
    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ location: 'Tokyo' });
    expect(response.stopReason).toBe('tool_use');
  });

  test('transformMistralResponse handles max_tokens finish reason', async () => {
    const { transformMistralResponse } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const response = transformMistralResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Truncated...',
        },
        finish_reason: 'length',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 100,
        total_tokens: 110,
      },
    });

    expect(response.stopReason).toBe('max_tokens');
  });

  test('transformMistralResponse handles invalid JSON in tool arguments', async () => {
    const { transformMistralResponse } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const response = transformMistralResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'test',
              arguments: 'invalid json',
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ _raw: 'invalid json' });
  });

  test('transformMistralResponse throws on no choices', async () => {
    const { transformMistralResponse } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    expect(() => transformMistralResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'mistral-medium-3',
      choices: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    })).toThrow('No choices');
  });
});

describe('Vertex Mistral Stream Transform', () => {
  test('createMistralStreamState creates initial state', async () => {
    const { createMistralStreamState } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();

    expect(state.id).toBe('');
    expect(state.model).toBe('');
    expect(state.content).toBe('');
    expect(state.toolCalls.size).toBe(0);
    expect(state.finishReason).toBeNull();
  });

  test('transformMistralStreamChunk handles text delta', async () => {
    const { createMistralStreamState, transformMistralStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();
    const event = transformMistralStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null,
      }],
    }, state);

    expect(event?.type).toBe('text_delta');
    expect(state.content).toBe('Hello');
    expect(state.id).toBe('chat_123');
    expect(state.model).toBe('mistral-medium-3');
  });

  test('transformMistralStreamChunk handles tool call delta', async () => {
    const { createMistralStreamState, transformMistralStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();
    const event = transformMistralStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_123',
            function: {
              name: 'getWeather',
              arguments: '{"loc',
            },
          }],
        },
        finish_reason: null,
      }],
    }, state);

    expect(event?.type).toBe('tool_call_delta');
    expect(state.toolCalls.size).toBe(1);
  });

  test('transformMistralStreamChunk handles finish reason', async () => {
    const { createMistralStreamState, transformMistralStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();
    transformMistralStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    }, state);

    expect(state.finishReason).toBe('stop');
  });

  test('transformMistralStreamChunk handles usage', async () => {
    const { createMistralStreamState, transformMistralStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();
    transformMistralStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'mistral-medium-3',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: null,
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    }, state);

    expect(state.inputTokens).toBe(10);
    expect(state.outputTokens).toBe(20);
  });

  test('buildMistralResponseFromState builds final response', async () => {
    const { createMistralStreamState, buildMistralResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();
    state.id = 'chat_123';
    state.model = 'mistral-medium-3';
    state.content = 'Complete response';
    state.inputTokens = 10;
    state.outputTokens = 20;
    state.finishReason = 'stop';

    const response = buildMistralResponseFromState(state);

    expect((response.message.content[0] as { type: string; text: string })?.text).toBe('Complete response');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(20);
    expect(response.stopReason).toBe('end_turn');
  });

  test('buildMistralResponseFromState handles invalid JSON in tool arguments', async () => {
    const { createMistralStreamState, buildMistralResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.mistral.ts'
    );

    const state = createMistralStreamState();
    state.id = 'chat_123';
    state.model = 'mistral-medium-3';
    state.toolCalls.set(0, { id: 'call_123', name: 'test', arguments: 'invalid json' });
    state.finishReason = 'tool_calls';

    const response = buildMistralResponseFromState(state);

    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ _raw: 'invalid json' });
  });
});
