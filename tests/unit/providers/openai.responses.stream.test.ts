import { test, expect } from 'bun:test';
import { buildResponseFromState, createStreamState } from '../../../src/providers/openai/transform.responses.ts';

test('buildResponseFromState orders output by index and skips incomplete tool calls', () => {
  const state = createStreamState();

  state.textByIndex.set(1, 'second');
  state.textByIndex.set(0, 'first');
  state.toolCalls.set(1, {
    itemId: 'item_1',
    callId: 'call_1',
    name: 'getWeather',
    arguments: '{"city":"Paris"}',
  });
  state.toolCalls.set(2, {
    arguments: '{"city":"Tokyo"}',
  });

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

  expect(response.message.toolCalls).toBeDefined();
  expect(response.message.toolCalls).toHaveLength(1);
  const toolCall = response.message.toolCalls?.[0];
  expect(toolCall?.toolCallId).toBe('call_1');
  expect(toolCall?.toolName).toBe('getWeather');
});

test('buildResponseFromState maps incomplete status to max_tokens', () => {
  const state = createStreamState();
  state.status = 'incomplete';
  state.incompleteReason = 'max_output_tokens';
  state.textByIndex.set(0, 'partial');

  const response = buildResponseFromState(state);
  expect(response.stopReason).toBe('max_tokens');
});

test('buildResponseFromState maps incomplete status to end_turn for other reasons', () => {
  const state = createStreamState();
  state.status = 'incomplete';
  state.incompleteReason = 'content_filter';
  state.textByIndex.set(0, 'partial');

  const response = buildResponseFromState(state);
  expect(response.stopReason).toBe('end_turn');
});
