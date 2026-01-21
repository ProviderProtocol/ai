import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import { pubsubMiddleware, memoryAdapter } from '../../src/middleware/pubsub/index.ts';
import { createSubscriberStream } from '../../src/middleware/pubsub/server/webapi.ts';
import { parseSSEStream } from '../../src/http/sse.ts';
import { deserializeStreamEvent } from '../../src/stream/serialization.ts';
import { StreamEventType, type StreamEvent } from '../../src/types/stream.ts';

const isStreamEventPayload = (payload: unknown): payload is StreamEvent => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as { type?: unknown; index?: unknown; delta?: unknown };
  if (typeof candidate.type !== 'string') {
    return false;
  }
  if (typeof candidate.index !== 'number') {
    return false;
  }
  if (!candidate.delta || typeof candidate.delta !== 'object') {
    return false;
  }

  return true;
};

const collectSubscriberText = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  let text = '';
  for await (const payload of parseSSEStream(stream)) {
    if (!isStreamEventPayload(payload)) {
      continue;
    }
    const event = deserializeStreamEvent(payload);
    if (event.type === StreamEventType.TextDelta && event.delta.text) {
      text += event.delta.text;
    }
  }
  return text;
};

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('PubSub stream resumption (live)', () => {
  test('replay matches streamed output during reconnect', async () => {
    const adapter = memoryAdapter();
    const streamId = `pubsub-${crypto.randomUUID()}`;

    const model = llm({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 128 },
      middleware: [pubsubMiddleware({ adapter, streamId })],
    });

    const stream = model.stream('Repeat the word "hello" 25 times, separated by spaces.');
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();
    let originalText = '';

    if (!first.done) {
      const event = first.value;
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        originalText += event.delta.text;
      }
    }

    const subscriberTextPromise = collectSubscriberText(
      createSubscriberStream(streamId, adapter)
    );

    let current = await iterator.next();
    while (!current.done) {
      const event = current.value;
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        originalText += event.delta.text;
      }
      current = await iterator.next();
    }

    const turn = await stream.turn;
    const subscriberText = await subscriberTextPromise;

    expect(originalText).toBe(turn.response.text);
    expect(subscriberText).toBe(turn.response.text);
  });
});
