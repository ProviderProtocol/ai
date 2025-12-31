import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { xai } from '../../src/xai/index.ts';
import type { XAIMessagesParams } from '../../src/xai/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

/**
 * Live API tests for xAI Messages API (Anthropic-compatible)
 * Requires XAI_API_KEY environment variable
 *
 * The Messages API is compatible with Anthropic's API format,
 * making it easy to migrate from Claude to Grok.
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Messages API Live', () => {
  test('simple text generation', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 100 },
    });

    const turn = await grok.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 50 },
    });

    const stream = grok.stream('Count from 1 to 5.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text).toContain('1');
    expect(text).toContain('5');
    expect(turn.response.text).toContain('1');
    expect(turn.response.text).toContain('5');
  });

  test('multi-turn conversation', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 100 },
    });

    const history: any[] = [];

    // First turn
    const turn1 = await grok.generate(history, 'My name is Charlie.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await grok.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('charlie');
  });

  test('with system prompt', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 50 },
      system: 'You are a helpful assistant who always responds in rhymes.',
    });

    const turn = await grok.generate('Hello!');

    // Should have a response
    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  test('tool calling', async () => {
    const calculate = {
      name: 'calculate',
      description: 'Calculate a mathematical expression',
      parameters: {
        type: 'object' as const,
        properties: {
          expression: { type: 'string' as const, description: 'The math expression' },
        },
        required: ['expression'],
      },
      run: async (params: { expression: string }) => {
        try {
          return `Result: ${eval(params.expression)}`;
        } catch {
          return 'Error evaluating expression';
        }
      },
    };

    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 200 },
      tools: [calculate],
    });

    const turn = await grok.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 100 },
    });

    const imageMessage = new UserMessage([
      { type: 'text', text: 'What animal is in this image? Reply with just the animal name.' },
      {
        type: 'image',
        mimeType: 'image/png',
        source: { type: 'base64', data: DUCK_IMAGE_BASE64 },
      },
    ]);

    const turn = await grok.generate([imageMessage]);

    expect(turn.response.text.toLowerCase()).toMatch(/duck|bird|waterfowl/);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming with tool execution', async () => {
    const calculator = {
      name: 'multiply',
      description: 'Multiply two numbers',
      parameters: {
        type: 'object' as const,
        properties: {
          a: { type: 'number' as const, description: 'First number' },
          b: { type: 'number' as const, description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      run: async (params: { a: number; b: number }) => {
        return `The product is ${params.a * params.b}`;
      },
    };

    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 200 },
      tools: [calculator],
    });

    const stream = grok.stream('What is 6 times 7? Use the multiply tool.');

    const events: string[] = [];
    let hasToolCallDelta = false;

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'tool_call_delta') {
        hasToolCallDelta = true;
      }
    }

    const turn = await stream.turn;

    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    expect(turn.response.text).toContain('42');
  });

  test('structured output with JSON schema', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 200 },
      structure: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          occupation: { type: 'string' },
        },
        required: ['name', 'age', 'occupation'],
      },
    });

    const turn = await grok.generate('Tell me about Albert Einstein.');

    expect(turn.data).toBeDefined();
    expect((turn.data as any).name).toContain('Einstein');
    expect(typeof (turn.data as any).age).toBe('number');
    expect(typeof (turn.data as any).occupation).toBe('string');
  });

  test('parallel tool execution', async () => {
    const getWeather = {
      name: 'getWeather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object' as const,
        properties: { city: { type: 'string' as const } },
        required: ['city'],
      },
      run: async (params: { city: string }) => `${params.city}: 68°F`,
    };

    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await grok.generate('What is the weather in Berlin and Rome? Use the tool for both cities.');

    const cities = turn.toolExecutions.map(t => (t.arguments as any).city);
    expect(cities).toContain('Berlin');
    expect(cities).toContain('Rome');
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    const text = turn.response.text.toLowerCase();
    expect(text).toContain('berlin');
    expect(text).toContain('rome');
  });

  test('temperature control', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: {
        max_tokens: 50,
        temperature: 0,
      },
    });

    // With temperature 0, responses should be deterministic
    const turn1 = await grok.generate('What is 2+2?');
    const turn2 = await grok.generate('What is 2+2?');

    // Both should contain 4
    expect(turn1.response.text).toContain('4');
    expect(turn2.response.text).toContain('4');
  });

  test('top_p sampling', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: {
        max_tokens: 50,
        top_p: 0.9,
      },
    });

    const turn = await grok.generate('Say hello.');

    expect(turn.response.text.length).toBeGreaterThan(0);
  });
});

/**
 * Error handling tests for xAI Messages API
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Messages API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'messages' }),
      params: { max_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await grok.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      // xAI may return either AUTHENTICATION_FAILED (401) or INVALID_REQUEST (400) for invalid keys
      expect(['AUTHENTICATION_FAILED', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('xai');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('nonexistent-model-xyz', { api: 'messages' }),
      params: { max_tokens: 10 },
    });

    try {
      await grok.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(['MODEL_NOT_FOUND', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('xai');
    }
  });
});
