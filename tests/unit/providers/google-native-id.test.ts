import { test, expect, describe } from 'bun:test';
import { ToolResultMessage, AssistantMessage } from '../../../src/types/messages.ts';

describe('Google native function call IDs', () => {
  test('uses native ID when provided by API', async () => {
    const { transformResponse } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const response = transformResponse({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'native_fc_123',
                  name: 'search',
                  args: { query: 'test' },
                },
              },
            ],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      },
    });

    const toolCalls = response.message.toolCalls ?? [];
    expect(toolCalls[0]?.toolCallId).toBe('native_fc_123');
  });

  test('falls back to synthetic ID when native ID not provided', async () => {
    const { transformResponse } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const response = transformResponse({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { functionCall: { name: 'search', args: { query: 'test' } } },
            ],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      },
    });

    const toolCalls = response.message.toolCalls ?? [];
    expect(toolCalls[0]?.toolCallId).toBe('google_toolcall:0:search');
  });

  test('preserves native ID through multi-turn context', async () => {
    const { transformRequest, transformResponse } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const responseWithNativeId = transformResponse({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'native_fc_456',
                  name: 'calculate',
                  args: { x: 5 },
                },
              },
            ],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      },
    });

    const toolResult = new ToolResultMessage([
      { toolCallId: 'native_fc_456', result: { value: 10 } },
    ]);

    const request = transformRequest(
      {
        messages: [responseWithNativeId.message, toolResult],
        config: {},
      },
      'gemini-1.5-flash'
    );

    const modelPart = request.contents?.[0]?.parts?.[0] as {
      functionCall?: { id?: string; name: string };
    } | undefined;
    expect(modelPart?.functionCall?.id).toBe('native_fc_456');
  });
});

describe('Google TOOL_USE finish reason', () => {
  test('normalizes TOOL_USE to tool_use stop reason', async () => {
    const { transformResponse } = await import(
      '../../../src/providers/google/transform.ts'
    );

    const response = transformResponse({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { functionCall: { name: 'search', args: { query: 'test' } } },
            ],
          },
          finishReason: 'TOOL_USE',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });

    expect(response.stopReason).toBe('tool_use');
  });
});
