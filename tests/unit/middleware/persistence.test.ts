import { test, expect, describe, mock } from 'bun:test';
import { persistenceMiddleware, PersistenceAdapter } from '../../../src/middleware/persistence.ts';
import { createMiddlewareContext } from '../../../src/middleware/runner.ts';
import { Thread } from '../../../src/types/thread.ts';
import { UserMessage, AssistantMessage } from '../../../src/types/messages.ts';
import { createTurn, emptyUsage } from '../../../src/types/turn.ts';
import type { LLMRequest } from '../../../src/types/llm.ts';
import type { Turn } from '../../../src/types/turn.ts';

describe('persistenceMiddleware', () => {
  test('prepends loaded thread messages', async () => {
    const thread = new Thread([
      new UserMessage('Hello'),
      new AssistantMessage('Hi there'),
    ]);

    const load = mock(async () => thread);
    const saved: { id?: string; thread?: Thread; turn?: Turn } = {};
    const save = mock(async (id: string, savedThread: Thread, savedTurn?: Turn) => {
      saved.id = id;
      saved.thread = savedThread;
      saved.turn = savedTurn;
    });
    const adapter = new PersistenceAdapter({ id: 'thread-1', load, save });

    const middleware = persistenceMiddleware({ adapter });

    const request: LLMRequest = {
      messages: [new UserMessage('New message')],
      config: {} as LLMRequest['config'],
    };
    const ctx = createMiddlewareContext('llm', 'claude', 'anthropic', false, request);
    await middleware.onRequest!(ctx);

    const requestMessages = (ctx.request as LLMRequest).messages;
    expect(requestMessages).toHaveLength(3);
    expect(requestMessages[0]).toBe(thread.messages[0]);
    expect(requestMessages[1]).toBe(thread.messages[1]);
  });

  test('does not duplicate history already in request', async () => {
    const thread = new Thread([
      new UserMessage('Hello'),
      new AssistantMessage('Hi there'),
    ]);

    const load = mock(async () => thread);
    const save = mock(async () => {});
    const adapter = new PersistenceAdapter({ id: 'thread-dup', load, save });

    const middleware = persistenceMiddleware({ adapter });

    const request: LLMRequest = {
      messages: [...thread.messages, new UserMessage('New message')],
      config: {} as LLMRequest['config'],
    };
    const ctx = createMiddlewareContext('llm', 'claude', 'anthropic', false, request);
    await middleware.onRequest!(ctx);

    const requestMessages = (ctx.request as LLMRequest).messages;
    expect(requestMessages).toHaveLength(3);
    expect(requestMessages[0]).toBe(thread.messages[0]);
    expect(requestMessages[1]).toBe(thread.messages[1]);
  });

  test('appends turn and saves thread on turn', async () => {
    const thread = new Thread([new UserMessage('Hello')]);

    const load = mock(async () => thread);
    const saved: { id?: string; thread?: Thread; turn?: Turn } = {};
    const save = mock(async (id: string, savedThread: Thread, savedTurn?: Turn) => {
      saved.id = id;
      saved.thread = savedThread;
      saved.turn = savedTurn;
    });
    const adapter = new PersistenceAdapter({ id: 'thread-2', load, save });

    const middleware = persistenceMiddleware({ adapter });

    const newMessage = new UserMessage('New message');
    const request: LLMRequest = {
      messages: [newMessage],
      config: {} as LLMRequest['config'],
    };
    const ctx = createMiddlewareContext('llm', 'claude', 'anthropic', false, request);
    await middleware.onRequest!(ctx);

    const turnMessages = [
      newMessage,
      new AssistantMessage('Response'),
    ];
    const turn = createTurn(turnMessages, [], emptyUsage(), 1);

    const initialLength = thread.messages.length;

    await middleware.onTurn!(turn, ctx);

    expect(thread.messages.length).toBe(initialLength + turnMessages.length);

    expect(save).toHaveBeenCalledTimes(1);
    expect(saved.id).toBe('thread-2');
    expect(saved.thread).toBe(thread);
    expect(saved.turn).toBe(turn);
  });

  test('merges request history without duplicating turn messages', async () => {
    const persisted = new Thread([new UserMessage('Persisted history')]);

    const load = mock(async () => persisted);
    const save = mock(async () => {});
    const adapter = new PersistenceAdapter({ id: 'thread-3', load, save });

    const middleware = persistenceMiddleware({ adapter });

    const requestHistory = [
      new UserMessage('Persisted history'),
      new AssistantMessage('Caller history'),
    ];
    const request: LLMRequest = {
      messages: [...requestHistory, new UserMessage('New message')],
      config: {} as LLMRequest['config'],
    };
    const ctx = createMiddlewareContext('llm', 'claude', 'anthropic', false, request);
    await middleware.onRequest!(ctx);

    const turnMessages = [
      new UserMessage('New message'),
      new AssistantMessage('Response'),
    ];
    const turn = createTurn(turnMessages, [], emptyUsage(), 1);

    await middleware.onTurn!(turn, ctx);

    const threadMessageIds = new Set(persisted.messages.map((message) => message.id));
    expect(threadMessageIds.has(requestHistory[0]!.id)).toBe(true);
    expect(threadMessageIds.has(requestHistory[1]!.id)).toBe(true);
    expect(threadMessageIds.has(turnMessages[0]!.id)).toBe(true);
    expect(threadMessageIds.has(turnMessages[1]!.id)).toBe(true);

    const duplicates = persisted.messages.filter(
      (message) => message.id === turnMessages[0]!.id
    );
    expect(duplicates).toHaveLength(1);
  });
});
