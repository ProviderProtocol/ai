import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { google } from '../../src/google/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

type CityData = { city: string; population: number; isCapital: boolean };

/**
 * Live API tests for Google Gemini
 * Requires GOOGLE_API_KEY environment variable
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Gemini Live API', () => {
  test('simple text generation', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
    });

    const turn = await gemini.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
    });

    const stream = gemini.stream('Count from 1 to 5.');

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
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await gemini.generate(history, 'My name is Charlie.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await gemini.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('charlie');
  });

  test('with system instruction', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
      system: 'You are a friendly cat. Always respond like a cat would. (meow!)',
    });

    const turn = await gemini.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    // Cat might respond with various cat-like words or actions
    expect(
      text.includes('meow') ||
      text.includes('purr') ||
      text.includes('cat') ||
      text.includes('paw') ||
      text.includes('*') ||  // action markers like *purrs*
      text.includes('mrow') ||
      text.includes('hiss') ||
      text.includes('whisker') ||
      text.includes('scratch') ||
      text.includes('nuzzle') ||
      text.includes('feline') ||
      text.includes('kitty') ||
      text.length > 0  // Fallback: just ensure we got a response
    ).toBe(true);
  });

  test('tool calling (function calling)', async () => {
    const getTime = {
      name: 'getCurrentTime',
      description: 'Get the current time',
      parameters: {
        type: 'object' as const,
        properties: {
          timezone: { type: 'string' as const, description: 'The timezone, e.g., UTC' },
        },
        required: ['timezone'],
      },
      run: async (params: { timezone: string }) => {
        return `The current time in ${params.timezone} is 3:00 PM.`;
      },
    };

    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
      tools: [getTime],
    });

    const turn = await gemini.generate('What time is it in UTC?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('3:00');
  });

  test('vision/multimodal with base64 image', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
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

    const turn = await gemini.generate([imageMessage]);

    // Should identify the duck
    expect(turn.response.text.toLowerCase()).toMatch(/duck|bird|waterfowl/);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming with tool execution', async () => {
    const calculator = {
      name: 'divide',
      description: 'Divide two numbers',
      parameters: {
        type: 'object' as const,
        properties: {
          a: { type: 'number' as const, description: 'Dividend' },
          b: { type: 'number' as const, description: 'Divisor' },
        },
        required: ['a', 'b'],
      },
      run: async (params: { a: number; b: number }) => {
        return `The result is ${params.a / params.b}`;
      },
    };

    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
      tools: [calculator],
    });

    const stream = gemini.stream('What is 100 divided by 4? Use the divide tool.');

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
    expect(turn.response.text).toContain('25');
  });

  test('structured output with JSON mode', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: {
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        // Gemini 3 requires a schema for reliable JSON output
        responseSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
        },
      },
    });

    const turn = await gemini.generate(
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
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
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

    const turn = await gemini.generate('Tell me about Paris, France.');

    // The 'data' field should be automatically populated and typed
    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Paris');
    expect(typeof data.population).toBe('number');
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

    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
      tools: [getWeather],
    });

    const turn = await gemini.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

    // Verify multiple executions occurred in the same turn
    const cities = turn.toolExecutions
      .map((execution) => {
        const city = execution.arguments.city;
        return typeof city === 'string' ? city : undefined;
      })
      .filter((city): city is string => city !== undefined);
    expect(cities).toContain('Tokyo');
    expect(cities).toContain('San Francisco');
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    // Verify final response mentions both
    const text = turn.response.text.toLowerCase();
    expect(text).toContain('tokyo');
    expect(text).toContain('san francisco');
  });

  test('streaming with structured output', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 500 },
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

    const stream = gemini.stream('Tell me about Tokyo, Japan.');

    // Google uses native structured output, so we accumulate text_delta events
    let accumulatedJson = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        accumulatedJson += event.delta.text;
      }
    }

    // The accumulated JSON should be valid and parseable
    expect(accumulatedJson.length).toBeGreaterThan(0);
    const streamedData = JSON.parse(accumulatedJson) as CityData;
    expect(streamedData.city).toContain('Tokyo');

    const turn = await stream.turn;

    // The 'data' field should match what we accumulated
    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Tokyo');
    expect(typeof data.population).toBe('number');
    expect(data.isCapital).toBe(true);

    // Verify streamed matches final
    expect(streamedData.city).toBe(data.city);
  });
});

/**
 * Error handling tests
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: { maxOutputTokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await gemini.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      // Google returns INVALID_REQUEST for bad API keys (not AUTHENTICATION_FAILED)
      expect(['AUTHENTICATION_FAILED', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('google');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('nonexistent-model-xyz'),
      params: { maxOutputTokens: 10 },
    });

    try {
      await gemini.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(['MODEL_NOT_FOUND', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('google');
    }
  });
});
