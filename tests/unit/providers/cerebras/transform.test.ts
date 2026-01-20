import { test, expect, describe } from 'bun:test';
import {
  transformRequest,
  transformResponse,
  transformStreamEvent,
  createStreamState,
  buildResponseFromState,
  transformToolResults,
} from '../../../../src/providers/cerebras/transform.ts';
import { UserMessage, AssistantMessage, ToolResultMessage } from '../../../../src/types/messages.ts';
import { StreamEventType } from '../../../../src/types/stream.ts';
import type { CerebrasResponse, CerebrasStreamChunk, CerebrasLLMParams } from '../../../../src/providers/cerebras/types.ts';
import type { LLMRequest } from '../../../../src/types/llm.ts';
import type { Tool } from '../../../../src/types/tool.ts';

describe('Cerebras Transform - Request', () => {
  test('transforms basic request with user message', () => {
    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('Hello!')],
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b');

    expect(result.model).toBe('llama-3.3-70b');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello!' });
  });

  test('includes system message when system prompt provided', () => {
    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('Hello!')],
      system: 'You are a helpful assistant.',
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b');

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello!' });
  });

  test('passes through params', () => {
    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('Hello!')],
      params: {
        temperature: 0.7,
        max_completion_tokens: 100,
        top_p: 0.9,
      },
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b');

    expect(result.temperature).toBe(0.7);
    expect(result.max_completion_tokens).toBe(100);
    expect(result.top_p).toBe(0.9);
  });

  test('passes through reasoning params', () => {
    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('Solve this problem')],
      params: {
        reasoning_effort: 'high',
        reasoning_format: 'parsed',
      },
      config: {},
    };

    const result = transformRequest(request, 'gpt-oss-120b');

    expect(result.reasoning_effort).toBe('high');
    expect(result.reasoning_format).toBe('parsed');
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

    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('What is 2+2?')],
      tools: [calculator],
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b');

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
    const request: LLMRequest<CerebrasLLMParams> = {
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

    const result = transformRequest(request, 'llama-3.3-70b');

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

    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('What is 2+2?'), assistantMsg],
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b');

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

  test('passes through service tier params', () => {
    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('Hello!')],
      params: {
        service_tier: 'priority',
        queue_threshold: 5000,
      },
      config: {},
    };

    const result = transformRequest(request, 'llama-3.3-70b');

    expect(result.service_tier).toBe('priority');
    expect(result.queue_threshold).toBe(5000);
  });

  test('passes through prediction params', () => {
    const request: LLMRequest<CerebrasLLMParams> = {
      messages: [new UserMessage('Complete this code')],
      params: {
        prediction: {
          type: 'content',
          content: 'function hello() {',
        },
      },
      config: {},
    };

    const result = transformRequest(request, 'gpt-oss-120b');

    expect(result.prediction).toEqual({
      type: 'content',
      content: 'function hello() {',
    });
  });
});

describe('Cerebras Transform - Tool Results', () => {
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

describe('Cerebras Transform - Response', () => {
  test('transforms basic response', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'llama-3.3-70b',
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

    const result = transformResponse(cerebrasResponse);

    expect(result.message.text).toBe('Hello! How can I help you?');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(8);
    expect(result.usage.totalTokens).toBe(18);
    expect(result.stopReason).toBe('end_turn');
  });

  test('transforms response with tool calls', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'llama-3.3-70b',
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

    const result = transformResponse(cerebrasResponse);

    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls![0]).toEqual({
      toolCallId: 'call_abc123',
      toolName: 'calculate',
      arguments: { expression: '2+2' },
    });
    expect(result.stopReason).toBe('tool_use');
  });

  test('transforms response with structured data', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'llama-3.3-70b',
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

    const result = transformResponse(cerebrasResponse);

    expect(result.data).toEqual({ name: 'John', age: 30 });
  });

  test('transforms response with reasoning', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'gpt-oss-120b',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'The answer is 42.',
          reasoning: 'Let me think step by step...',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 50,
        total_tokens: 60,
      },
    };

    const result = transformResponse(cerebrasResponse);

    expect(result.message.text).toBe('The answer is 42.');
    expect(result.message.metadata?.cerebras?.reasoning).toBe('Let me think step by step...');
  });

  test('handles finish reason: length', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'llama-3.3-70b',
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

    const result = transformResponse(cerebrasResponse);
    expect(result.stopReason).toBe('max_tokens');
  });

  test('includes metadata', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'llama-3.3-70b',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      system_fingerprint: 'fp_abc123',
      time_info: {
        queue_time: 0.5,
        prompt_time: 1.2,
        completion_time: 0.8,
        total_time: 2.5,
      },
    };

    const result = transformResponse(cerebrasResponse);

    expect(result.message.metadata?.cerebras).toEqual({
      model: 'llama-3.3-70b',
      finish_reason: 'stop',
      system_fingerprint: 'fp_abc123',
      reasoning: undefined,
      time_info: {
        queue_time: 0.5,
        prompt_time: 1.2,
        completion_time: 0.8,
        total_time: 2.5,
      },
    });
  });

  test('includes cached tokens in usage', () => {
    const cerebrasResponse: CerebrasResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      model: 'llama-3.3-70b',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 10,
        total_tokens: 110,
        prompt_tokens_details: {
          cached_tokens: 50,
        },
      },
    };

    const result = transformResponse(cerebrasResponse);

    expect(result.usage.cacheReadTokens).toBe(50);
  });
});

describe('Cerebras Transform - Stream Events', () => {
  test('transforms initial chunk with message start', () => {
    const state = createStreamState();
    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
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

    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
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

  test('transforms reasoning delta', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'gpt-oss-120b',
      choices: [{
        index: 0,
        delta: { reasoning: 'Let me think...' },
        finish_reason: null,
      }],
    };

    const events = transformStreamEvent(chunk, state);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: StreamEventType.ReasoningDelta,
      index: 0,
      delta: { text: 'Let me think...' },
    });
    expect(state.reasoning).toBe('Let me think...');
  });

  test('accumulates text across chunks', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk1: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    };

    const chunk2: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
      choices: [{ index: 0, delta: { content: ' world!' }, finish_reason: null }],
    };

    transformStreamEvent(chunk1, state);
    transformStreamEvent(chunk2, state);

    expect(state.text).toBe('Hello world!');
  });

  test('transforms tool call delta', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
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

    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
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

    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
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

  test('extracts time info from chunk', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';

    const chunk: CerebrasStreamChunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      model: 'llama-3.3-70b',
      choices: [{ index: 0, delta: {}, finish_reason: null }],
      time_info: {
        queue_time: 0.5,
        prompt_time: 1.0,
        completion_time: 2.0,
        total_time: 3.5,
      },
    };

    transformStreamEvent(chunk, state);

    expect(state.timeInfo).toEqual({
      queue_time: 0.5,
      prompt_time: 1.0,
      completion_time: 2.0,
      total_time: 3.5,
    });
  });
});

describe('Cerebras Transform - Build Response From State', () => {
  test('builds response from accumulated state', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b';
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
    state.model = 'llama-3.3-70b';
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

  test('builds response with reasoning', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'gpt-oss-120b';
    state.text = 'The answer is 42.';
    state.reasoning = 'Let me think step by step...';
    state.finishReason = 'stop';
    state.inputTokens = 10;
    state.outputTokens = 50;

    const response = buildResponseFromState(state);

    expect(response.message.text).toBe('The answer is 42.');
    expect(response.message.metadata?.cerebras?.reasoning).toBe('Let me think step by step...');
  });

  test('parses JSON for structured output', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b';
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
    state.model = 'llama-3.3-70b';
    state.text = 'Truncated...';
    state.finishReason = 'length';
    state.inputTokens = 10;
    state.outputTokens = 100;

    const response = buildResponseFromState(state);

    expect(response.stopReason).toBe('max_tokens');
  });

  test('includes time info in metadata', () => {
    const state = createStreamState();
    state.id = 'chatcmpl-123';
    state.model = 'llama-3.3-70b';
    state.text = 'Hello!';
    state.finishReason = 'stop';
    state.inputTokens = 10;
    state.outputTokens = 5;
    state.timeInfo = {
      queue_time: 0.5,
      prompt_time: 1.0,
      completion_time: 2.0,
      total_time: 3.5,
    };

    const response = buildResponseFromState(state);

    expect(response.message.metadata?.cerebras?.time_info).toEqual({
      queue_time: 0.5,
      prompt_time: 1.0,
      completion_time: 2.0,
      total_time: 3.5,
    });
  });
});
