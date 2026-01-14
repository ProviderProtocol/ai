import { test, expect, describe } from 'bun:test';
import {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../../src/types/messages.ts';
import type { DocumentBlock } from '../../../src/types/content.ts';

describe('UserMessage', () => {
  test('creates from string', () => {
    const msg = new UserMessage('Hello world');
    expect(msg.type).toBe('user');
    expect(msg.text).toBe('Hello world');
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0]?.type).toBe('text');
  });

  test('creates from content array', () => {
    const msg = new UserMessage([
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);
    expect(msg.text).toBe('First\n\nSecond');
    expect(msg.content).toHaveLength(2);
  });

  test('exposes document blocks', () => {
    const documentBlock: DocumentBlock = {
      type: 'document',
      source: { type: 'text', data: 'Notes content' },
      mimeType: 'text/plain',
      title: 'Notes',
    };
    const msg = new UserMessage([
      { type: 'text', text: 'Read this' },
      documentBlock,
    ]);

    expect(msg.documents).toHaveLength(1);
    expect(msg.documents[0]).toBe(documentBlock);
  });

  test('has unique id and timestamp', () => {
    const msg1 = new UserMessage('Test');
    const msg2 = new UserMessage('Test');
    expect(msg1.id).not.toBe(msg2.id);
    expect(msg1.timestamp).toBeInstanceOf(Date);
  });

  test('accepts custom options', () => {
    const msg = new UserMessage('Test', {
      id: 'custom-id',
      metadata: { anthropic: { cache: true } },
    });
    expect(msg.id).toBe('custom-id');
    expect(msg.metadata?.anthropic?.cache).toBe(true);
  });
});

describe('AssistantMessage', () => {
  test('creates from string', () => {
    const msg = new AssistantMessage('Hello!');
    expect(msg.type).toBe('assistant');
    expect(msg.text).toBe('Hello!');
    expect(msg.hasToolCalls).toBe(false);
  });

  test('creates with tool calls', () => {
    const msg = new AssistantMessage('Checking...', [
      {
        toolCallId: 'call_123',
        toolName: 'getWeather',
        arguments: { location: 'Tokyo' },
      },
    ]);
    expect(msg.hasToolCalls).toBe(true);
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls?.[0]?.toolName).toBe('getWeather');
  });

  test('hasToolCalls is false for empty array', () => {
    const msg = new AssistantMessage('Test', []);
    expect(msg.hasToolCalls).toBe(false);
  });
});

describe('ToolResultMessage', () => {
  test('creates with results', () => {
    const msg = new ToolResultMessage([
      { toolCallId: 'call_123', result: '72°F, sunny' },
    ]);
    expect(msg.type).toBe('tool_result');
    expect(msg.results).toHaveLength(1);
    expect(msg.text).toBe('72°F, sunny');
  });

  test('handles object results', () => {
    const msg = new ToolResultMessage([
      { toolCallId: 'call_123', result: { temp: 72, condition: 'sunny' } },
    ]);
    expect(msg.text).toContain('temp');
    expect(msg.text).toContain('72');
  });
});

describe('Type guards', () => {
  test('isUserMessage', () => {
    const user = new UserMessage('Test');
    const assistant = new AssistantMessage('Test');
    expect(isUserMessage(user)).toBe(true);
    expect(isUserMessage(assistant)).toBe(false);
  });

  test('isAssistantMessage', () => {
    const user = new UserMessage('Test');
    const assistant = new AssistantMessage('Test');
    expect(isAssistantMessage(assistant)).toBe(true);
    expect(isAssistantMessage(user)).toBe(false);
  });

  test('isToolResultMessage', () => {
    const toolResult = new ToolResultMessage([{ toolCallId: '1', result: 'ok' }]);
    const user = new UserMessage('Test');
    expect(isToolResultMessage(toolResult)).toBe(true);
    expect(isToolResultMessage(user)).toBe(false);
  });
});
