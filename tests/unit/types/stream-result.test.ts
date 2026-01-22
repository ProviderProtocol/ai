import { describe, expect, test } from 'bun:test';
import { createStreamResult, textDelta } from '../../../src/types/stream.ts';
import { createTurn, emptyUsage } from '../../../src/types/turn.ts';
import { AssistantMessage, UserMessage } from '../../../src/types/messages.ts';

function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be defined');
  }
}

const createTestTurn = () => createTurn(
  [new UserMessage('Hi'), new AssistantMessage('Hello')],
  [],
  emptyUsage(),
  1
);

describe('createStreamResult', () => {
  test('auto-drains when awaited', async () => {
    const events = [textDelta('Hello'), textDelta('World')];
    let yielded = 0;

    let resolveDone: (() => void) | null = null;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    async function* generator() {
      for (const event of events) {
        yielded += 1;
        yield event;
      }
      if (!resolveDone) {
        throw new Error('done resolver not initialized');
      }
      resolveDone();
    }

    const turn = createTestTurn();
    const stream = createStreamResult(
      generator(),
      async () => {
        await done;
        return turn;
      },
      new AbortController()
    );

    const resolved = await stream;

    expect(resolved).toBe(turn);
    expect(yielded).toBe(events.length);
  });

  test('double-await shares the same turn promise', async () => {
    let factoryCalls = 0;
    let resolveDone: (() => void) | null = null;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    async function* generator() {
      yield textDelta('Once');
      if (!resolveDone) {
        throw new Error('done resolver not initialized');
      }
      resolveDone();
    }

    const turn = createTestTurn();
    const stream = createStreamResult(
      generator(),
      async () => {
        factoryCalls += 1;
        await done;
        return turn;
      },
      new AbortController()
    );

    const [first, second] = await Promise.all([stream, stream]);

    expect(first).toBe(turn);
    expect(second).toBe(turn);
    expect(factoryCalls).toBe(1);
  });

  test('awaiting while iterating resolves', async () => {
    const resolvers: { gate: (() => void) | null; done: (() => void) | null } = {
      gate: null,
      done: null,
    };
    const gate = new Promise<void>((resolve) => {
      resolvers.gate = resolve;
    });
    const done = new Promise<void>((resolve) => {
      resolvers.done = resolve;
    });

    const event = textDelta('Hello');

    async function* generator() {
      await gate;
      yield event;
      assertDefined(resolvers.done);
      resolvers.done();
    }

    const turn = createTestTurn();
    const stream = createStreamResult(
      generator(),
      async () => {
        await done;
        return turn;
      },
      new AbortController()
    );

    const iterator = stream[Symbol.asyncIterator]();
    const nextPromise = iterator.next();
    const turnPromise = Promise.resolve(stream);

    assertDefined(resolvers.gate);
    resolvers.gate();

    const [nextResult, resolvedTurn] = await Promise.all([nextPromise, turnPromise]);

    expect(nextResult.done).toBe(false);
    expect(nextResult.value).toEqual(event);
    expect(resolvedTurn).toBe(turn);
  });
});
