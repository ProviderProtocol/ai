import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { xai } from '../../src/xai/index.ts';
import type { XAICompletionsParams } from '../../src/xai/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

/**
 * Live API tests for xAI Chat Completions API (OpenAI-compatible)
 * Requires XAI_API_KEY environment variable
 *
 * This test suite verifies the Chat Completions API which is
 * the default and recommended API for xAI/Grok models.
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Completions API Live', () => {
  test('simple text generation', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 100 },
    });

    const turn = await grok.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
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
    // Turn response should also have the content
    expect(turn.response.text).toContain('1');
    expect(turn.response.text).toContain('5');
  });

  test('multi-turn conversation', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 100 },
    });

    const history: any[] = [];

    // First turn
    const turn1 = await grok.generate(history, 'My name is Bob.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await grok.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('bob');
  });

  test('with system prompt', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 50 },
      system: 'You are a robot. Always respond like a robot.',
    });

    const turn = await grok.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    // Robot might respond in many ways - just check we got a response
    expect(text.length).toBeGreaterThan(0);
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
        // Simple eval for demo (not safe in production!)
        try {
          return `Result: ${eval(params.expression)}`;
        } catch {
          return 'Error evaluating expression';
        }
      },
    };

    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 200 },
      tools: [calculate],
    });

    const turn = await grok.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 100 },
    });

    // Create a user message with duck image
    const imageMessage = new UserMessage([
      { type: 'text', text: 'What animal is in this image? Reply with just the animal name.' },
      {
        type: 'image',
        mimeType: 'image/png',
        source: { type: 'base64', data: DUCK_IMAGE_BASE64 },
      },
    ]);

    const turn = await grok.generate([imageMessage]);

    // Should identify the duck
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

    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
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

    // Should have streamed tool call events
    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    // Final response should contain the answer
    expect(turn.response.text).toContain('42');
  });

  test('structured output with JSON mode', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: {
        max_tokens: 200,
        response_format: { type: 'json_object' },
      },
    });

    const turn = await grok.generate(
      'Return a JSON object with fields "name" (string) and "age" (number) for a person named John who is 30.'
    );

    // Should be valid JSON
    const text = turn.response.text.trim();
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe('John');
    expect(parsed.age).toBe(30);
  });

  test('protocol-level structured output (schema enforcement)', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 200 },
      structure: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          population: { type: 'number' },
          isCapital: { type: 'boolean' },
        },
        required: ['city', 'population', 'isCapital'],
      },
    });

    const turn = await grok.generate('Tell me about Paris, France.');

    // The 'data' field should be automatically populated and typed
    expect(turn.data).toBeDefined();
    expect((turn.data as any).city).toContain('Paris');
    expect(typeof (turn.data as any).population).toBe('number');
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
      run: async (params: { city: string }) => `${params.city}: 75°F`,
    };

    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
      params: { max_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await grok.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

    // Verify multiple executions occurred in the same turn
    const cities = turn.toolExecutions.map(t => (t.arguments as any).city);
    expect(cities).toContain('Tokyo');
    expect(cities).toContain('San Francisco');
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    // Verify final response mentions both
    const text = turn.response.text.toLowerCase();
    expect(text).toContain('tokyo');
    expect(text).toContain('san francisco');
  });

});

/**
 * Error handling tests for xAI Completions API
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Completions API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'completions' }),
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
    const grok = llm<XAICompletionsParams>({
      model: xai('nonexistent-model-xyz', { api: 'completions' }),
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
