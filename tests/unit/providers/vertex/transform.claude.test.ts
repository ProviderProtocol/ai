import { test, expect, describe } from 'bun:test';
import type { Tool } from '../../../../src/types/tool.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../../src/types/messages.ts';

describe('Vertex Claude Message Transform', () => {
  test('transformClaudeRequest transforms user message', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const request = transformClaudeRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello world' }])],
        config: { apiKey: 'test' },
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.role).toBe('user');
    expect(request.messages[0]?.content).toHaveLength(1);
    expect((request.messages[0]?.content[0] as { type: string; text: string })?.text).toBe('Hello world');
    expect(request.anthropic_version).toBe('vertex-2023-10-16');
    expect(request.max_tokens).toBe(1024);
  });

  test('transformClaudeRequest uses default max_tokens', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const request = transformClaudeRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        config: { apiKey: 'test' },
      },
      'claude-sonnet-4-5'
    );

    expect(request.max_tokens).toBe(4096);
  });

  test('transformClaudeRequest transforms assistant message', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const request = transformClaudeRequest(
      {
        messages: [
          new UserMessage([{ type: 'text', text: 'Hello' }]),
          new AssistantMessage([{ type: 'text', text: 'Hi there!' }]),
        ],
        config: { apiKey: 'test' },
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.messages).toHaveLength(2);
    expect(request.messages[1]?.role).toBe('assistant');
  });

  test('transformClaudeRequest transforms system prompt', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const request = transformClaudeRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        system: 'You are a helpful assistant.',
        config: { apiKey: 'test' },
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.system).toBe('You are a helpful assistant.');
  });

  test('transformClaudeRequest transforms image content', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const request = transformClaudeRequest(
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
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.messages[0]?.content).toHaveLength(2);
    const imagePart = request.messages[0]?.content[1] as {
      type: string;
      source: { type: string; media_type: string; data: string };
    };
    expect(imagePart?.type).toBe('image');
    expect(imagePart?.source?.media_type).toBe('image/png');
    expect(imagePart?.source?.data).toBe('dGVzdA==');
  });

  test('transformClaudeRequest transforms tool result message', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const toolResultMessage = new ToolResultMessage([
      {
        toolCallId: 'call123',
        result: 'Sunny, 72°F',
        isError: false,
      },
    ]);

    const request = transformClaudeRequest(
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
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.messages).toHaveLength(3);
    const toolResult = request.messages[2];
    expect(toolResult?.role).toBe('user');
    const content = toolResult?.content[0] as { type: string; tool_use_id: string; content: string };
    expect(content?.type).toBe('tool_result');
    expect(content?.tool_use_id).toBe('call123');
  });
});

describe('Vertex Claude Tool Transform', () => {
  test('transformClaudeRequest transforms tools', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
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

    const request = transformClaudeRequest(
      {
        messages: [new UserMessage([{ type: 'text', text: 'Hello' }])],
        tools: [tool],
        config: { apiKey: 'test' },
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.name).toBe('getWeather');
    expect(request.tools?.[0]?.description).toBe('Get the weather for a location');
    expect(request.tool_choice).toEqual({ type: 'auto' });
  });

  test('transformClaudeRequest transforms structured output', async () => {
    const { transformClaudeRequest } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const request = transformClaudeRequest(
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
        params: { max_tokens: 1024 },
      },
      'claude-sonnet-4-5'
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.name).toBe('json_response');
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'json_response' });
  });
});

describe('Vertex Claude Response Transform', () => {
  test('transformClaudeResponse transforms text response', async () => {
    const { transformClaudeResponse } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const response = transformClaudeResponse({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'Hello there!' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
      },
    });

    expect(response.message.content).toHaveLength(1);
    expect((response.message.content[0] as { type: string; text: string }).text).toBe('Hello there!');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
    expect(response.usage.totalTokens).toBe(15);
    expect(response.stopReason).toBe('end_turn');
  });

  test('transformClaudeResponse transforms tool use response', async () => {
    const { transformClaudeResponse } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const response = transformClaudeResponse({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [
        { type: 'tool_use', id: 'call_123', name: 'getWeather', input: { location: 'Tokyo' } },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 20,
        output_tokens: 10,
      },
    });

    expect(response.message.toolCalls).toHaveLength(1);
    expect(response.message.toolCalls?.[0]?.toolName).toBe('getWeather');
    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ location: 'Tokyo' });
    expect(response.stopReason).toBe('tool_use');
  });

  test('transformClaudeResponse handles cache tokens', async () => {
    const { transformClaudeResponse } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const response = transformClaudeResponse({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'Hello' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 20,
      },
    });

    expect(response.usage.cacheReadTokens).toBe(80);
    expect(response.usage.cacheWriteTokens).toBe(20);
  });

  test('transformClaudeResponse extracts structured data from json_response tool', async () => {
    const { transformClaudeResponse } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const response = transformClaudeResponse({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [
        { type: 'tool_use', id: 'call_123', name: 'json_response', input: { name: 'Test' } },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
      },
    });

    expect(response.data).toEqual({ name: 'Test' });
  });
});

describe('Vertex Claude Stream Transform', () => {
  test('createClaudeStreamState creates initial state', async () => {
    const { createClaudeStreamState } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();

    expect(state.messageId).toBe('');
    expect(state.model).toBe('');
    expect(state.content).toHaveLength(0);
    expect(state.stopReason).toBeNull();
    expect(state.inputTokens).toBe(0);
    expect(state.outputTokens).toBe(0);
  });

  test('transformClaudeStreamEvent handles message_start', async () => {
    const { createClaudeStreamState, transformClaudeStreamEvent } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();
    const event = transformClaudeStreamEvent(
      {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
        },
      },
      state
    );

    expect(event?.type).toBe('message_start');
    expect(state.messageId).toBe('msg_123');
    expect(state.model).toBe('claude-sonnet-4-5');
    expect(state.inputTokens).toBe(10);
  });

  test('transformClaudeStreamEvent handles text delta', async () => {
    const { createClaudeStreamState, transformClaudeStreamEvent } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();
    state.content[0] = { type: 'text', text: '' };

    const event = transformClaudeStreamEvent(
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
      state
    );

    expect(event?.type).toBe('text_delta');
    expect(state.content[0]?.text).toBe('Hello');
  });

  test('transformClaudeStreamEvent handles input_json_delta', async () => {
    const { createClaudeStreamState, transformClaudeStreamEvent } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();
    state.content[0] = { type: 'tool_use', id: 'call_123', name: 'test', input: '' };

    const event = transformClaudeStreamEvent(
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"key":"value"}' },
      },
      state
    );

    expect(event?.type).toBe('tool_call_delta');
    expect(state.content[0]?.input).toBe('{"key":"value"}');
  });

  test('transformClaudeStreamEvent handles thinking delta', async () => {
    const { createClaudeStreamState, transformClaudeStreamEvent } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();
    const event = transformClaudeStreamEvent(
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me think...' },
      },
      state
    );

    expect(event?.type).toBe('reasoning_delta');
  });

  test('buildClaudeResponseFromState builds final response', async () => {
    const { createClaudeStreamState, buildClaudeResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();
    state.messageId = 'msg_123';
    state.model = 'claude-sonnet-4-5';
    state.content = [{ type: 'text', text: 'Complete response' }];
    state.inputTokens = 10;
    state.outputTokens = 20;
    state.stopReason = 'end_turn';

    const response = buildClaudeResponseFromState(state);

    expect((response.message.content[0] as { type: string; text: string })?.text).toBe('Complete response');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(20);
    expect(response.stopReason).toBe('end_turn');
  });

  test('buildClaudeResponseFromState handles invalid JSON in tool input', async () => {
    const { createClaudeStreamState, buildClaudeResponseFromState } = await import(
      '../../../../src/providers/vertex/transform.claude.ts'
    );

    const state = createClaudeStreamState();
    state.messageId = 'msg_123';
    state.model = 'claude-sonnet-4-5';
    state.content = [{ type: 'tool_use', id: 'call_123', name: 'test', input: 'invalid json' }];
    state.stopReason = 'tool_use';

    const response = buildClaudeResponseFromState(state);

    expect(response.message.toolCalls?.[0]?.arguments).toEqual({ _raw: 'invalid json' });
  });
});
