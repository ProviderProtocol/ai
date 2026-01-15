import { test, expect, describe } from 'bun:test';
import {
  buildResponseFromState,
  createStreamState,
  transformRequest,
  transformResponse,
} from '../../../src/providers/responses/transform.ts';
import { UserMessage, AssistantMessage } from '../../../src/types/messages.ts';
import type { LLMRequest } from '../../../src/types/llm.ts';
import type { ResponsesParams, ResponsesResponse } from '../../../src/providers/responses/types.ts';

describe('responses transform', () => {
  describe('transformRequest', () => {
    test('transforms simple user message', () => {
      const request: LLMRequest<ResponsesParams> = {
        messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
        config: {},
      };

      const result = transformRequest(request, 'gpt-5.2');

      expect(result.model).toBe('gpt-5.2');
      expect(result.input).toBe('Hello!');
    });

    test('transforms messages with system prompt', () => {
      const request: LLMRequest<ResponsesParams> = {
        messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
        system: 'You are a helpful assistant.',
        config: {},
      };

      const result = transformRequest(request, 'gpt-5.2');

      expect(result.model).toBe('gpt-5.2');
      expect(Array.isArray(result.input)).toBe(true);
      if (Array.isArray(result.input)) {
        expect(result.input).toHaveLength(2);
        expect(result.input[0]).toEqual({
          type: 'message',
          role: 'system',
          content: 'You are a helpful assistant.',
        });
      }
    });

    test('transforms multi-turn conversation', () => {
      const request: LLMRequest<ResponsesParams> = {
        messages: [
          new UserMessage([{ type: 'text', text: 'Hi' }]),
          new AssistantMessage([{ type: 'text', text: 'Hello!' }]),
          new UserMessage([{ type: 'text', text: 'How are you?' }]),
        ],
        config: {},
      };

      const result = transformRequest(request, 'gpt-5.2');

      expect(Array.isArray(result.input)).toBe(true);
      if (Array.isArray(result.input)) {
        expect(result.input).toHaveLength(3);
      }
    });

    test('transforms with structured output', () => {
      const request: LLMRequest<ResponsesParams> = {
        messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
        structure: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        config: {},
      };

      const result = transformRequest(request, 'gpt-5.2');

      expect(result.text).toBeDefined();
      expect(result.text?.format?.type).toBe('json_schema');
    });

    test('transforms with tools', () => {
      const request: LLMRequest<ResponsesParams> = {
        messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
        tools: [
          {
            name: 'getWeather',
            description: 'Get weather for a city',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
            run: async () => 'sunny',
          },
        ],
        config: {},
      };

      const result = transformRequest(request, 'gpt-5.2');

      expect(result.tools).toBeDefined();
      expect(result.tools).toHaveLength(1);
      expect(result.tools?.[0]).toEqual({
        type: 'function',
        name: 'getWeather',
        description: 'Get weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      });
    });

    test('passes through params', () => {
      const request: LLMRequest<ResponsesParams> = {
        messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
        params: {
          max_output_tokens: 1000,
          temperature: 0.7,
          reasoning: { effort: 'medium' },
        },
        config: {},
      };

      const result = transformRequest(request, 'gpt-5.2');

      expect(result.max_output_tokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
      expect(result.reasoning).toEqual({ effort: 'medium' });
    });
  });

  describe('transformResponse', () => {
    test('transforms text response', () => {
      const data: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-5.2',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello!' }],
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformResponse(data);

      expect(result.message.content).toHaveLength(1);
      expect(result.message.content[0]?.type).toBe('text');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.stopReason).toBe('end_turn');
    });

    test('transforms function call response', () => {
      const data: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-5.2',
        status: 'completed',
        output: [
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'getWeather',
            arguments: '{"city":"Paris"}',
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformResponse(data);

      expect(result.message.toolCalls).toHaveLength(1);
      expect(result.message.toolCalls?.[0]).toEqual({
        toolCallId: 'call_1',
        toolName: 'getWeather',
        arguments: { city: 'Paris' },
      });
      expect(result.stopReason).toBe('tool_use');
    });

    test('handles failed status', () => {
      const data: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-5.2',
        status: 'failed',
        error: { code: 'invalid_request', message: 'Something went wrong' },
        output: [],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      };

      const result = transformResponse(data);
      expect(result.stopReason).toBe('error');
    });

    test('handles incomplete status with max_output_tokens', () => {
      const data: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-5.2',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Partial...' }],
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 100,
          total_tokens: 110,
        },
      };

      const result = transformResponse(data);
      expect(result.stopReason).toBe('max_tokens');
    });
  });

  describe('streaming state', () => {
    test('buildResponseFromState orders output by index', () => {
      const state = createStreamState();

      state.textByIndex.set(1, 'second');
      state.textByIndex.set(0, 'first');

      const response = buildResponseFromState(state);
      const content = response.message.content;

      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      if (content[0]?.type === 'text') {
        expect(content[0].text).toBe('first');
      }
      if (content[1]?.type === 'text') {
        expect(content[1].text).toBe('second');
      }
    });

    test('buildResponseFromState skips incomplete tool calls', () => {
      const state = createStreamState();

      state.toolCalls.set(0, {
        itemId: 'item_1',
        callId: 'call_1',
        name: 'getWeather',
        arguments: '{"city":"Paris"}',
      });
      state.toolCalls.set(1, {
        arguments: '{"city":"Tokyo"}',
      });

      const response = buildResponseFromState(state);

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls?.[0]?.toolCallId).toBe('call_1');
    });

    test('buildResponseFromState maps incomplete status to max_tokens', () => {
      const state = createStreamState();
      state.status = 'incomplete';
      state.incompleteReason = 'max_output_tokens';
      state.textByIndex.set(0, 'partial');

      const response = buildResponseFromState(state);
      expect(response.stopReason).toBe('max_tokens');
    });

    test('buildResponseFromState includes reasoning content', () => {
      const state = createStreamState();
      state.reasoningByIndex.set(0, 'Let me think...');
      state.textByIndex.set(0, 'The answer is 42.');

      const response = buildResponseFromState(state);
      const content = response.message.content;

      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('reasoning');
      if (content[0]?.type === 'reasoning') {
        expect(content[0].text).toBe('Let me think...');
      }
      expect(content[1]?.type).toBe('text');
    });

    test('buildResponseFromState handles refusal with content_filter stop reason', () => {
      const state = createStreamState();
      state.status = 'completed';
      state.hadRefusal = true;
      state.textByIndex.set(0, 'I cannot help with that.');

      const response = buildResponseFromState(state);
      expect(response.stopReason).toBe('content_filter');
    });
  });
});
