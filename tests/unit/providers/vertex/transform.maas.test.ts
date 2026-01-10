import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../../src/types/tool.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../../src/types/messages.ts';

describe('Vertex MaaS Message Transform', () => {
  test('transformMaaSRequest transforms user message', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const request = transformMaaSRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello world' }])],
        config: { apiKey: 'test' },
      },
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.role).toBe('user');
    expect(request.messages[0]?.content).toBe('Hello world');
    expect(request.model).toBe('deepseek-ai/deepseek-r1-0528-maas');
  });

  test('transformMaaSRequest transforms system prompt', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const request = transformMaaSRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        system: 'You are a helpful assistant.',
        config: { apiKey: 'test' },
      },
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]?.role).toBe('system');
    expect(request.messages[0]?.content).toBe('You are a helpful assistant.');
  });

  test('transformMaaSRequest transforms assistant message', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const request = transformMaaSRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Hello' }]),
          new AssistantMessage([{ type: 'text', text: 'Hi there!' }]),
        ],
        config: { apiKey: 'test' },
      },
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.messages).toHaveLength(2);
    expect(request.messages[1]?.role).toBe('assistant');
    expect(request.messages[1]?.content).toBe('Hi there!');
  });

  test('transformMaaSRequest transforms assistant message with tool calls', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const request = transformMaaSRequest(
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
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.messages[1]?.tool_calls).toHaveLength(1);
    expect(request.messages[1]?.tool_calls?.[0]?.function.name).toBe('getWeather');
  });

  test('transformMaaSRequest transforms tool result message', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const toolResultMessage = new ToolResultMessage([
      {
        toolCallId: 'call123',
        result: 'Sunny, 72°F',
        isError: false,
      },
    ]);

    const request = transformMaaSRequest(
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
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.messages).toHaveLength(3);
    expect(request.messages[2]?.role).toBe('tool');
    expect(request.messages[2]?.tool_call_id).toBe('call123');
  });
});

describe('Vertex MaaS Tool Transform', () => {
  test('transformMaaSRequest transforms tools', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
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

    const request = transformMaaSRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [tool],
        config: { apiKey: 'test' },
      },
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.function?.name).toBe('getWeather');
    expect(request.tool_choice).toBe('auto');
  });

  test('transformMaaSRequest transforms structured output', async () => {
    const { transformMaaSRequest } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const request = transformMaaSRequest(
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
      'deepseek-ai/deepseek-r1-0528-maas'
    );

    expect(request.response_format).toEqual({ type: 'json_object' });
  });
});

describe('Vertex MaaS Response Transform', () => {
  test('transformMaaSResponse transforms text response', async () => {
    const { transformMaaSResponse } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const response = transformMaaSResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'deepseek-ai/deepseek-r1-0528-maas',
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

  test('transformMaaSResponse transforms tool call response', async () => {
    const { transformMaaSResponse } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const response = transformMaaSResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'deepseek-ai/deepseek-r1-0528-maas',
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

  test('transformMaaSResponse handles reasoning_content', async () => {
    const { transformMaaSResponse } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const response = transformMaaSResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'deepseek-ai/deepseek-r1-0528-maas',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'The answer is 42.',
          reasoning_content: 'Let me think step by step...',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });

    const metadata = response.message.metadata as { vertex?: { reasoning_content?: string } };
    expect(metadata?.vertex?.reasoning_content).toBe('Let me think step by step...');
  });

  test('transformMaaSResponse handles max_tokens finish reason', async () => {
    const { transformMaaSResponse } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const response = transformMaaSResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'deepseek-ai/deepseek-r1-0528-maas',
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

  test('transformMaaSResponse handles invalid JSON in tool arguments', async () => {
    const { transformMaaSResponse } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const response = transformMaaSResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'deepseek-ai/deepseek-r1-0528-maas',
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

  test('transformMaaSResponse throws on no choices', async () => {
    const { transformMaaSResponse } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    expect(() => transformMaaSResponse({
      id: 'chat_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'deepseek-ai/deepseek-r1-0528-maas',
      choices: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    })).toThrow('No choices');
  });
});

describe('Vertex MaaS Stream Transform', () => {
  test('createMaaSStreamState creates initial state', async () => {
    const { createMaaSStreamState } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();

    expect(state.id).toBe('');
    expect(state.model).toBe('');
    expect(state.content).toBe('');
    expect(state.reasoningContent).toBe('');
    expect(state.toolCalls.size).toBe(0);
    expect(state.finishReason).toBeNull();
  });

  test('transformMaaSStreamChunk handles text delta', async () => {
    const { createMaaSStreamState, transformMaaSStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    const event = transformMaaSStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'deepseek-ai/deepseek-r1-0528-maas',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null,
      }],
    }, state);

    expect(event?.type).toBe('text_delta');
    expect(state.content).toBe('Hello');
    expect(state.id).toBe('chat_123');
    expect(state.model).toBe('deepseek-ai/deepseek-r1-0528-maas');
  });

  test('transformMaaSStreamChunk handles reasoning delta', async () => {
    const { createMaaSStreamState, transformMaaSStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    const event = transformMaaSStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'deepseek-ai/deepseek-r1-0528-maas',
      choices: [{
        index: 0,
        delta: { reasoning_content: 'Let me think...' },
        finish_reason: null,
      }],
    }, state);

    expect(event?.type).toBe('reasoning_delta');
    expect(state.reasoningContent).toBe('Let me think...');
  });

  test('transformMaaSStreamChunk handles tool call delta', async () => {
    const { createMaaSStreamState, transformMaaSStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    const event = transformMaaSStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'deepseek-ai/deepseek-r1-0528-maas',
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

  test('transformMaaSStreamChunk handles finish reason', async () => {
    const { createMaaSStreamState, transformMaaSStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    transformMaaSStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'deepseek-ai/deepseek-r1-0528-maas',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    }, state);

    expect(state.finishReason).toBe('stop');
  });

  test('transformMaaSStreamChunk handles usage', async () => {
    const { createMaaSStreamState, transformMaaSStreamChunk } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    transformMaaSStreamChunk({
      id: 'chat_123',
      object: 'chat.completion.chunk',
      model: 'deepseek-ai/deepseek-r1-0528-maas',
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

  test('buildMaaSResponseFromState builds final response', async () => {
    const { createMaaSStreamState, buildMaaSResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    state.id = 'chat_123';
    state.model = 'deepseek-ai/deepseek-r1-0528-maas';
    state.content = 'Complete response';
    state.inputTokens = 10;
    state.outputTokens = 20;
    state.finishReason = 'stop';

    const response = buildMaaSResponseFromState(state);

    expect((response.message.content[0] as { type: string; text: string })?.text).toBe('Complete response');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(20);
    expect(response.stopReason).toBe('end_turn');
  });

  test('buildMaaSResponseFromState includes reasoning_content in metadata', async () => {
    const { createMaaSStreamState, buildMaaSResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    state.id = 'chat_123';
    state.model = 'deepseek-ai/deepseek-r1-0528-maas';
    state.content = 'The answer is 42.';
    state.reasoningContent = 'Let me think step by step...';
    state.finishReason = 'stop';

    const response = buildMaaSResponseFromState(state);

    const metadata = response.message.metadata as { vertex?: { reasoning_content?: string } };
    expect(metadata?.vertex?.reasoning_content).toBe('Let me think step by step...');
  });

  test('buildMaaSResponseFromState handles invalid JSON in tool arguments', async () => {
    const { createMaaSStreamState, buildMaaSResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.maas.ts'
    );

    const state = createMaaSStreamState();
    state.id = 'chat_123';
    state.model = 'deepseek-ai/deepseek-r1-0528-maas';
    state.toolCalls.set(0, { id: 'call_123', name: 'test', arguments: 'invalid json' });
    state.finishReason = 'tool_calls';

    const response = buildMaaSResponseFromState(state);

    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ _raw: 'invalid json' });
  });
});
