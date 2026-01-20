import { test, expect, describe } from 'bun:test';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
  transformToolResults,
} from '../../../../src/providers/groq/transform.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../../src/types/messages.ts';
import { StreamEventType } from '../../../../src/types/stream.ts';
import type { GroqResponse, GroqStreamChunk, GroqLLMParams } from '../../../../src/providers/groq/types.ts';
import type { LLMRequest } from '../../../../src/types/llm.ts';
import type { Tool } from '../../../../src/types/tool.ts';

describe('Groq Transform - Request', () => {
  test('transforms basic request with user message', () => {
    const request: LLMRequest<GroqLLMParams> = {
      messages: [new UserMessage('Hello!')],
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b-versatile');

    expect(result.model).toBe('llama-3.3-70b-versatile');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello!' });
  });

  test('includes system message when system prompt provided', () => {
    const request: LLMRequest<GroqLLMParams> = {
      messages: [new UserMessage('Hello!')],
      system: 'You are a helpful assistant.',
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b-versatile');

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello!' });
  });

  test('passes through params', () => {
    const request: LLMRequest<GroqLLMParams> = {
      messages: [new UserMessage('Hello!')],
      params: {
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
      },
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b-versatile');

    expect(result.temperature).toBe(0.7);
    expect(result.max_tokens).toBe(100);
    expect(result.top_p).toBe(0.9);
  });

  test('transforms tools', () => {
    const calculator: Tool = {
      name: 'calculate',
      description: 'Calculate a math expression',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
        },
        required: ['expression'],
      },
      run: async () => '42',
    };

    const request: LLMRequest<GroqLLMParams> = {
      messages: [new UserMessage('What is 2+2?')],
      tools: [calculator],
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b-versatile');

    expect(result.tools).toHaveLength(1);
    expect(result.tools![0]).toEqual({
      type: 'function',
      function: {
        name: 'calculate',
        description: 'Calculate a math expression',
        parameters: {
          type: 'object',
          properties: { expression: { type: 'string' } },
          required: ['expression'],
        },
      },
    });
  });

  test('transforms structured output', () => {
    const request: LLMRequest<GroqLLMParams> = {
      messages: [new UserMessage('Get user info')],
      structure: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
        description: 'User information',
      },
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b-versatile');

    expect(result.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'json_response',
        description: 'User information',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
          description: 'User information',
          additionalProperties: false,
        },
        strict: true,
      },
    });
  });

  test('transforms assistant message with tool calls', () => {
    const assistantMsg = new AssistantMessage(
      [{ type: 'text', text: 'Let me calculate that.' }],
      [{
        toolCallId: 'call_123',
        toolName: 'calculate',
        arguments: { expression: '2+2' },
      }]
    );

    const request: LLMRequest<GroqLLMParams> = {
      messages: [new UserMessage('What is 2+2?'), assistantMsg],
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b-versatile');

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toEqual({
      role: 'assistant',
      content: 'Let me calculate that.',
      tool_calls: [{
        id: 'call_123',
        type: 'function',
        function: {
          name: 'calculate',
          arguments: '{"expression":"2+2"}',
        },
      }],
    });
  });

  test('transforms multipart user message with image', () => {
    const imageMessage = new UserMessage([
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image',
        mimeType: 'image/png',
        source: { type: 'base64', data: 'aGVsbG8=' },
      },
    ]);

    const request: LLMRequest<GroqLLMParams> = {
      messages: [imageMessage],
      config: {},
    };

    const result = transformRequest(request, 'llama-4-scout');

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
      ],
    });
  });
});

describe('Groq Transform - Tool Results', () => {
  test('transforms tool result message', () => {
    const toolResultMsg = new ToolResultMessage([{
      toolCallId: 'call_123',
      result: '4',
    }]);

    const result = transformToolResults(toolResultMsg);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'tool',
      tool_call_id: 'call_123',
      content: '4',
    });
  });

  test('transforms multiple tool results', () => {
    const toolResultMsg = new ToolResultMessage([
      { toolCallId: 'call_123', result: '4' },
      { toolCallId: 'call_456', result: { data: 'test' } },
    ]);

    const result = transformToolResults(toolResultMsg);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: 'tool',
      tool_call_id: 'call_123',
      content: '4',
    });
    expect(result[1]).toEqual({
      role: 'tool',
      tool_call_id: 'call_456',
      content: '{"data":"test"}',
    });
  });
});

describe('Groq Transform - Response', () => {
  test('transforms basic response', () => {
    const groqResponse: GroqResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello! How can I help you?',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
    };

    const result = transformResponse(groqResponse);

    expect(result.message.text).toBe('Hello! How can I help you?');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(8);
    expect(result.usage.totalTokens).toBe(18);
    expect(result.stopReason).toBe('end_turn');
  });

  test('transforms response with tool calls', () => {
    const groqResponse: GroqResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'calculate',
              arguments: '{"expression":"2+2"}',
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    };

    const result = transformResponse(groqResponse);

    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls![0]).toEqual({
      toolCallId: 'call_abc123',
      toolName: 'calculate',
      arguments: { expression: '2+2' },
    });
    expect(result.stopReason).toBe('tool_use');
  });

  test('transforms response with structured data', () => {
    const groqResponse: GroqResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: '{"name":"John","age":30}',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
    };

    const result = transformResponse(groqResponse);

    expect(result.data).toEqual({ name: 'John', age: 30 });
  });

  test('handles finish reason: length', () => {
    const groqResponse: GroqResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Truncated response...',
        },
        finish_reason: 'length',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 100,
        total_tokens: 110,
      },
    };

    const result = transformResponse(groqResponse);
    expect(result.stopReason).toBe('max_tokens');
  });

  test('includes metadata', () => {
    const groqResponse: GroqResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      system_fingerprint: 'fp_abc123',
    };

    const result = transformResponse(groqResponse);

    expect(result.message.metadata?.groq).toEqual({
      model: 'llama-3.3-70b-versatile',
      finish_reason: 'stop',
      system_fingerprint: 'fp_abc123',
    });
  });
});

describe('Groq Transform - Stream Events', () => {
  test('transforms initial chunk with message start', () => {
    const state = createStreamState();
    const chunk: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null,
      }],
    };

    const events = transformStreamEvent(chunk, state);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(StreamEventType.MessageStart);
    expect(state.id).toBe('chatcmpl-123');
  });

  test('transforms text delta', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null,
      }],
    };

    const events = transformStreamEvent(chunk, state);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: StreamEventType.TextDelta,
      index: 0,
      delta: { text: 'Hello' },
    });
    expect(state.text).toBe('Hello');
  });

  test('accumulates text across chunks', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk1: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    };

    const chunk2: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, delta: { content: ' world!' }, finish_reason: null }],
    };

    transformStreamEvent(chunk1, state);
    transformStreamEvent(chunk2, state);

    expect(state.text).toBe('Hello world!');
  });

  test('transforms tool call delta', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_abc',
            type: 'function',
            function: { name: 'calculate', arguments: '{"exp' },
          }],
        },
        finish_reason: null,
      }],
    };

    const events = transformStreamEvent(chunk, state);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(StreamEventType.ToolCallDelta);
    expect(state.toolCalls.get(0)).toEqual({
      id: 'call_abc',
      name: 'calculate',
      arguments: '{"exp',
    });
  });

  test('transforms finish reason to message stop', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    };

    const events = transformStreamEvent(chunk, state);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe(StreamEventType.MessageStop);
    expect(state.finishReason).toBe('stop');
  });

  test('extracts usage from chunk', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, delta: {}, finish_reason: null }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };

    transformStreamEvent(chunk, state);

    expect(state.inputTokens).toBe(10);
    expect(state.outputTokens).toBe(20);
  });

  test('extracts usage from x_groq', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: GroqStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'llama-3.3-70b-versatile',
      choices: [{ index: 0, delta: {}, finish_reason: null }],
      x_groq: {
        usage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
      },
    };

    transformStreamEvent(chunk, state);

    expect(state.inputTokens).toBe(15);
    expect(state.outputTokens).toBe(25);
  });
});

describe('Groq Transform - Build Response From State', () => {
  test('builds response from accumulated state', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b-versatile';
    state.text = 'Hello, world!';
    state.finishReason = 'stop';
    state.inputTokens = 10;
    state.outputTokens = 5;

    const response = buildResponseFromState(state);

    expect(response.message.text).toBe('Hello, world!');
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
    expect(response.usage.totalTokens).toBe(15);
    expect(response.stopReason).toBe('end_turn');
  });

  test('builds response with tool calls', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b-versatile';
    state.text = '';
    state.toolCalls.set(0, {
      id: 'call_abc',
      name: 'calculate',
      arguments: '{"expression":"2+2"}',
    });
    state.finishReason = 'tool_calls';
    state.inputTokens = 10;
    state.outputTokens = 15;

    const response = buildResponseFromState(state);

    expect(response.message.toolCalls).toHaveLength(1);
    expect(response.message.toolCalls![0]).toEqual({
      toolCallId: 'call_abc',
      toolName: 'calculate',
      arguments: { expression: '2+2' },
    });
    expect(response.stopReason).toBe('tool_use');
  });

  test('parses JSON for structured output', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b-versatile';
    state.text = '{"name":"Alice","age":25}';
    state.finishReason = 'stop';
    state.inputTokens = 10;
    state.outputTokens = 10;

    const response = buildResponseFromState(state);

    expect(response.data).toEqual({ name: 'Alice', age: 25 });
  });

  test('handles max_tokens finish reason', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b-versatile';
    state.text = 'Truncated...';
    state.finishReason = 'length';
    state.inputTokens = 10;
    state.outputTokens = 100;

    const response = buildResponseFromState(state);

    expect(response.stopReason).toBe('max_tokens');
  });
});
