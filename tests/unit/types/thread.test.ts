import { test, expect, describe } from 'bun:test';
import { Thread } from '../../../src/types/thread.ts';
import { UserMessage, AssistantMessage } from '../../../src/types/messages.ts';
import { createTurn, emptyUsage } from '../../../src/types/turn.ts';

describe('Thread', () => {
  test('creates empty thread', () => {
    const thread = new Thread();
    expect(thread.length).toBe(0);
    expect(thread.id).toBeDefined();
  });

  test('creates thread with initial messages', () => {
    const messages = [
      new UserMessage('Hello'),
      new AssistantMessage('Hi there!'),
    ];
    const thread = new Thread(messages);
    expect(thread.length).toBe(2);
  });

  test('push adds messages', () => {
    const thread = new Thread();
    thread.push(new UserMessage('Hello'));
    thread.push(new AssistantMessage('Hi!'));
    expect(thread.length).toBe(2);
  });

  test('user adds user message', () => {
    const thread = new Thread();
    thread.user('Hello');
    expect(thread.length).toBe(1);
    expect(thread.messages[0]?.type).toBe('user');
  });

  test('assistant adds assistant message', () => {
    const thread = new Thread();
    thread.assistant('Hello');
    expect(thread.length).toBe(1);
    expect(thread.messages[0]?.type).toBe('assistant');
  });

  test('append adds turn messages', () => {
    const thread = new Thread();
    const turn = createTurn(
      [new UserMessage('Q'), new AssistantMessage('A')],
      [],
      emptyUsage(),
      1
    );
    thread.append(turn);
    expect(thread.length).toBe(2);
  });

  test('filter by type', () => {
    const thread = new Thread([
      new UserMessage('Hello'),
      new AssistantMessage('Hi!'),
      new UserMessage('How are you?'),
    ]);
    const userMsgs = thread.filter('user');
    expect(userMsgs).toHaveLength(2);
  });

  test('tail gets last N messages', () => {
    const thread = new Thread([
      new UserMessage('1'),
      new UserMessage('2'),
      new UserMessage('3'),
    ]);
    const last2 = thread.tail(2);
    expect(last2).toHaveLength(2);
    expect(last2[0]?.text).toBe('2');
    expect(last2[1]?.text).toBe('3');
  });

  test('slice creates new thread', () => {
    const thread = new Thread([
      new UserMessage('1'),
      new UserMessage('2'),
      new UserMessage('3'),
    ]);
    const sliced = thread.slice(1, 2);
    expect(sliced.length).toBe(1);
    expect(sliced.messages[0]?.text).toBe('2');
  });

  test('clear removes all messages', () => {
    const thread = new Thread([new UserMessage('Hello')]);
    thread.clear();
    expect(thread.length).toBe(0);
  });

  test('toMessages returns copy', () => {
    const thread = new Thread([new UserMessage('Hello')]);
    const messages = thread.toMessages();
    expect(messages).toHaveLength(1);
    messages.push(new UserMessage('World'));
    expect(thread.length).toBe(1);
  });

  test('iteration works', () => {
    const thread = new Thread([
      new UserMessage('1'),
      new UserMessage('2'),
    ]);
    const texts: string[] = [];
    for (const msg of thread) {
      texts.push(msg.text);
    }
    expect(texts).toEqual(['1', '2']);
  });

  test('toJSON and fromJSON round trip', () => {
    const thread = new Thread([
      new UserMessage('Hello'),
      new AssistantMessage('Hi!'),
    ]);
    const json = thread.toJSON();
    const restored = Thread.fromJSON(json);

    expect(restored.length).toBe(2);
    expect(restored.messages[0]?.type).toBe('user');
    expect(restored.messages[0]?.text).toBe('Hello');
    expect(restored.messages[1]?.type).toBe('assistant');
  });
});
