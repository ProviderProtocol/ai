/**
 * Unit tests for reasoning/thinking content handling across providers.
 *
 * Tests the ReasoningBlock content type and transform functions for:
 * - Google Gemini thinking content (thought parts)
 * - OpenAI Responses API reasoning output
 */
import { test, expect, describe } from 'bun:test';
import {
  buildResponseFromState as buildGoogleResponse,
  createStreamState as createGoogleStreamState,
  transformStreamChunk as transformGoogleStreamChunk,
  transformResponse as transformGoogleResponse,
} from '../../../src/providers/google/transform.ts';
import {
  transformRequest as transformAnthropicRequest,
  transformResponse as transformAnthropicResponse,
} from '../../../src/providers/anthropic/transform.ts';
import {
  buildResponseFromState as buildOpenAIResponse,
  createStreamState as createOpenAIStreamState,
  transformStreamEvent as transformOpenAIStreamEvent,
  transformResponse as transformOpenAIResponse,
} from '../../../src/providers/openai/transform.responses.ts';
import { transformRequest as transformXAIResponsesRequest } from '../../../src/providers/xai/transform.responses.ts';
import { AssistantMessage } from '../../../src/types/messages.ts';
import { StreamEventType } from '../../../src/types/stream.ts';
import type { AnthropicResponse } from '../../../src/providers/anthropic/types.ts';
import type { GoogleResponse, GoogleStreamChunk } from '../../../src/providers/google/types.ts';
import type { OpenAIResponsesResponse, OpenAIResponsesStreamEvent } from '../../../src/providers/openai/types.ts';
import type { XAIResponsesInputItem } from '../../../src/providers/xai/types.ts';

describe('ReasoningBlock Content Type', () => {
  describe('Google Gemini Thinking', () => {
    test('transformResponse handles thought parts as reasoning blocks', () => {
      const googleResponse: GoogleResponse = {
        candidates: [{
          content: {
            role: 'model',
            parts: [
              { text: 'Let me think about this...', thought: true },
              { text: 'The answer is 42.' },
            ],
          },
          finishReason: 'STOP',
          index: 0,
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      const response = transformGoogleResponse(googleResponse);

      expect(response.message.content).toHaveLength(2);
      expect(response.message.content[0]?.type).toBe('reasoning');
      if (response.message.content[0]?.type === 'reasoning') {
        expect(response.message.content[0].text).toBe('Let me think about this...');
      }
      expect(response.message.content[1]?.type).toBe('text');
      if (response.message.content[1]?.type === 'text') {
        expect(response.message.content[1].text).toBe('The answer is 42.');
      }
    });

    test('transformResponse handles non-thought text parts normally', () => {
      const googleResponse: GoogleResponse = {
        candidates: [{
          content: {
            role: 'model',
            parts: [
              { text: 'Regular response text.' },
            ],
          },
          finishReason: 'STOP',
          index: 0,
        }],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 10,
          totalTokenCount: 15,
        },
      };

      const response = transformGoogleResponse(googleResponse);

      expect(response.message.content).toHaveLength(1);
      expect(response.message.content[0]?.type).toBe('text');
    });

    test('createStreamState initializes reasoning field', () => {
      const state = createGoogleStreamState();

      expect(state.reasoning).toBe('');
      expect(state.content).toBe('');
    });

    test('transformStreamChunk emits ReasoningDelta for thought parts', () => {
      const state = createGoogleStreamState();
      state.isFirstChunk = false;

      const chunk: GoogleStreamChunk = {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: 'Thinking...', thought: true }],
          },
          finishReason: null,
          index: 0,
        }],
      };

      const events = transformGoogleStreamChunk(chunk, state);

      expect(state.reasoning).toBe('Thinking...');
      expect(state.content).toBe('');

      const reasoningEvent = events.find(e => e.type === StreamEventType.ReasoningDelta);
      expect(reasoningEvent).toBeDefined();
      expect(reasoningEvent?.delta.text).toBe('Thinking...');
    });

    test('transformStreamChunk emits TextDelta for non-thought parts', () => {
      const state = createGoogleStreamState();
      state.isFirstChunk = false;

      const chunk: GoogleStreamChunk = {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: 'Response text.' }],
          },
          finishReason: null,
          index: 0,
        }],
      };

      const events = transformGoogleStreamChunk(chunk, state);

      expect(state.content).toBe('Response text.');
      expect(state.reasoning).toBe('');

      const textEvent = events.find(e => e.type === StreamEventType.TextDelta);
      expect(textEvent).toBeDefined();
      expect(textEvent?.delta.text).toBe('Response text.');
    });

    test('buildResponseFromState includes reasoning blocks before text', () => {
      const state = createGoogleStreamState();
      state.reasoning = 'Step 1: Analyze the problem.\nStep 2: Find the solution.';
      state.content = 'The final answer is 42.';
      state.finishReason = 'STOP';

      const response = buildGoogleResponse(state);

      expect(response.message.content).toHaveLength(2);
      expect(response.message.content[0]?.type).toBe('reasoning');
      expect(response.message.content[1]?.type).toBe('text');

      if (response.message.content[0]?.type === 'reasoning') {
        expect(response.message.content[0].text).toContain('Step 1');
      }
    });

    test('buildResponseFromState handles empty reasoning', () => {
      const state = createGoogleStreamState();
      state.content = 'Just text, no reasoning.';
      state.finishReason = 'STOP';

      const response = buildGoogleResponse(state);

      expect(response.message.content).toHaveLength(1);
      expect(response.message.content[0]?.type).toBe('text');
    });

    test('buildResponseFromState preserves thoughtSignature from streaming text parts', () => {
      const state = createGoogleStreamState();
      state.isFirstChunk = false;

      const chunk: GoogleStreamChunk = {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: 'Thinking...', thought: true, thoughtSignature: 'sig-123' }],
          },
          finishReason: null,
          index: 0,
        }],
      };

      transformGoogleStreamChunk(chunk, state);

      const response = buildGoogleResponse(state);
      const googleMeta = response.message.metadata?.google as { thoughtSignature?: string } | undefined;

      expect(googleMeta?.thoughtSignature).toBe('sig-123');
    });
  });

  describe('OpenAI Responses API Reasoning', () => {
    test('transformResponse handles reasoning output items', () => {
      const openaiResponse: OpenAIResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created_at: 1234567890,
        model: 'o3-mini',
        status: 'completed',
        output: [
          {
            type: 'reasoning',
            id: 'rs_123',
            summary: [
              { type: 'summary_text', text: 'First, I analyzed the problem.' },
              { type: 'summary_text', text: 'Then, I computed the result.' },
            ],
            status: 'completed',
          },
          {
            type: 'message',
            id: 'msg_123',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'The answer is 42.' }],
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 100,
          total_tokens: 150,
          output_tokens_details: {
            reasoning_tokens: 80,
          },
        },
      };

      const response = transformOpenAIResponse(openaiResponse);

      expect(response.message.content).toHaveLength(2);
      expect(response.message.content[0]?.type).toBe('reasoning');
      if (response.message.content[0]?.type === 'reasoning') {
        expect(response.message.content[0].text).toContain('First, I analyzed');
        expect(response.message.content[0].text).toContain('Then, I computed');
      }
      expect(response.message.content[1]?.type).toBe('text');
    });

    test('transformResponse handles response without reasoning', () => {
      const openaiResponse: OpenAIResponsesResponse = {
        id: 'resp_456',
        object: 'response',
        created_at: 1234567890,
        model: 'gpt-4o',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_456',
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

      const response = transformOpenAIResponse(openaiResponse);

      expect(response.message.content).toHaveLength(1);
      expect(response.message.content[0]?.type).toBe('text');
    });

    test('createStreamState initializes reasoningByIndex', () => {
      const state = createOpenAIStreamState();

      expect(state.reasoningByIndex).toBeInstanceOf(Map);
      expect(state.reasoningByIndex.size).toBe(0);
    });

    test('transformStreamEvent handles reasoning_summary_text.delta', () => {
      const state = createOpenAIStreamState();

      const event: OpenAIResponsesStreamEvent = {
        type: 'response.reasoning_summary_text.delta',
        item_id: 'rs_123',
        output_index: 0,
        summary_index: 0,
        delta: 'Analyzing the problem...',
      };

      const events = transformOpenAIStreamEvent(event, state);

      expect(state.reasoningByIndex.get(0)).toBe('Analyzing the problem...');

      const reasoningEvent = events.find(e => e.type === StreamEventType.ReasoningDelta);
      expect(reasoningEvent).toBeDefined();
      expect(reasoningEvent?.delta.text).toBe('Analyzing the problem...');
      expect(reasoningEvent?.index).toBe(0);
    });

    test('transformStreamEvent accumulates reasoning deltas', () => {
      const state = createOpenAIStreamState();

      const event1: OpenAIResponsesStreamEvent = {
        type: 'response.reasoning_summary_text.delta',
        item_id: 'rs_123',
        output_index: 0,
        summary_index: 0,
        delta: 'First, ',
      };

      const event2: OpenAIResponsesStreamEvent = {
        type: 'response.reasoning_summary_text.delta',
        item_id: 'rs_123',
        output_index: 0,
        summary_index: 0,
        delta: 'I think about it.',
      };

      transformOpenAIStreamEvent(event1, state);
      transformOpenAIStreamEvent(event2, state);

      expect(state.reasoningByIndex.get(0)).toBe('First, I think about it.');
    });

    test('transformStreamEvent handles reasoning_summary_text.done', () => {
      const state = createOpenAIStreamState();
      state.reasoningByIndex.set(0, 'Partial reasoning...');

      const event: OpenAIResponsesStreamEvent = {
        type: 'response.reasoning_summary_text.done',
        item_id: 'rs_123',
        output_index: 0,
        summary_index: 0,
        text: 'Complete reasoning summary.',
      };

      transformOpenAIStreamEvent(event, state);

      expect(state.reasoningByIndex.get(0)).toBe('Complete reasoning summary.');
    });

    test('buildResponseFromState includes reasoning before text', () => {
      const state = createOpenAIStreamState();
      state.reasoningByIndex.set(0, 'I analyzed the problem carefully.');
      state.textByIndex.set(1, 'The answer is 42.');
      state.status = 'completed';

      const response = buildOpenAIResponse(state);

      expect(response.message.content).toHaveLength(2);
      expect(response.message.content[0]?.type).toBe('reasoning');
      expect(response.message.content[1]?.type).toBe('text');
    });

    test('buildResponseFromState orders reasoning by index', () => {
      const state = createOpenAIStreamState();
      state.reasoningByIndex.set(2, 'Second thought');
      state.reasoningByIndex.set(0, 'First thought');
      state.status = 'completed';

      const response = buildOpenAIResponse(state);

      expect(response.message.content).toHaveLength(2);
      if (response.message.content[0]?.type === 'reasoning') {
        expect(response.message.content[0].text).toBe('First thought');
      }
      if (response.message.content[1]?.type === 'reasoning') {
        expect(response.message.content[1].text).toBe('Second thought');
      }
    });
  });

  describe('Anthropic Thinking Signatures', () => {
    test('transformResponse stores signatures and transformRequest forwards them per block', () => {
      const anthropicResponse: AnthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'First thought', signature: 'sig-1' },
          { type: 'text', text: 'Final answer.' },
          { type: 'thinking', thinking: 'Second thought', signature: 'sig-2' },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 5,
          output_tokens: 10,
        },
      };

      const uppResponse = transformAnthropicResponse(anthropicResponse);
      const anthropicMeta = uppResponse.message.metadata?.anthropic as
        | { thinkingSignatures?: Array<string | null> }
        | undefined;

      expect(anthropicMeta?.thinkingSignatures).toEqual(['sig-1', 'sig-2']);

      const request = transformAnthropicRequest(
        {
          messages: [uppResponse.message],
          params: { max_tokens: 10 },
          config: {},
        },
        'claude-sonnet-4-20250514'
      );

      const assistantMessage = request.messages[0];
      expect(Array.isArray(assistantMessage?.content)).toBe(true);
      const content = Array.isArray(assistantMessage?.content) ? assistantMessage.content : [];
      const thinkingBlocks = content.filter(
        (block): block is { type: 'thinking'; signature?: string } => block.type === 'thinking'
      );

      expect(thinkingBlocks).toHaveLength(2);
      expect(thinkingBlocks[0]?.signature).toBe('sig-1');
      expect(thinkingBlocks[1]?.signature).toBe('sig-2');
    });
  });

  describe('xAI Responses Reasoning Context', () => {
    test('transformRequest forwards reasoning summary with encrypted content', () => {
      const reasoningEncryptedContent = JSON.stringify({
        id: 'rs_123',
        summary: [{ type: 'summary_text', text: 'Summary text.' }],
        encrypted_content: 'enc_123',
      });

      const message = new AssistantMessage('Hello.', undefined, {
        metadata: {
          xai: {
            reasoningEncryptedContent,
          },
        },
      });

      const request = transformXAIResponsesRequest(
        {
          messages: [message],
          params: {},
          config: {},
        },
        'grok-4'
      );

      expect(Array.isArray(request.input)).toBe(true);
      const inputItems = request.input as XAIResponsesInputItem[];
      const reasoningItem = inputItems.find((item) => item.type === 'reasoning');

      expect(reasoningItem?.type).toBe('reasoning');
      if (reasoningItem?.type === 'reasoning') {
        expect(reasoningItem.encrypted_content).toBe('enc_123');
        expect(reasoningItem.summary?.[0]?.text).toBe('Summary text.');
      }
    });
  });

  describe('Message reasoning accessor', () => {
    test('message.reasoning returns reasoning blocks', () => {
      const state = createGoogleStreamState();
      state.reasoning = 'Deep thoughts...';
      state.content = 'Final answer.';
      state.finishReason = 'STOP';

      const response = buildGoogleResponse(state);
      const reasoningBlocks = response.message.reasoning;

      expect(reasoningBlocks).toHaveLength(1);
      expect(reasoningBlocks[0]?.text).toBe('Deep thoughts...');
    });

    test('message.reasoning returns empty array when no reasoning', () => {
      const state = createGoogleStreamState();
      state.content = 'Just text.';
      state.finishReason = 'STOP';

      const response = buildGoogleResponse(state);
      const reasoningBlocks = response.message.reasoning;

      expect(reasoningBlocks).toHaveLength(0);
    });
  });
});
