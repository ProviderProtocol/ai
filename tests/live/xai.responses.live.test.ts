import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { xai } from '../../src/xai/index.ts';
import type { XAIResponsesParams } from '../../src/xai/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeEvaluateExpression } from '../helpers/math.ts';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

type CityData = { city: string; country: string; population: number };

/**
 * Live API tests for xAI Responses API (OpenAI Responses-compatible)
 * Requires XAI_API_KEY environment variable
 *
 * The Responses API is a stateful API that supports:
 * - Stateful conversations via `store` and `previous_response_id`
 * - Built-in tools (web_search, code_interpreter, etc.)
 * - Multi-turn tool execution
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Responses API Live', () => {
  test('simple text generation', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 100 },
    });

    const turn = await grok.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 50 },
    });

    const stream = grok.stream('Count from 1 to 5.');

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
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
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 100 },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await grok.generate(history, 'My name is Alice.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await grok.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('alice');
  });

  test('with system prompt (instructions)', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 50 },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await grok.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    // Pirate might use various pirate phrases
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
        const result = safeEvaluateExpression(params.expression);
        return result === null ? 'Error evaluating expression' : `Result: ${result}`;
      },
    };

    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [calculate],
    });

    const turn = await grok.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  }, 30000);

  test('vision/multimodal with base64 image', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 100 },
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

    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [calculator],
    });

    const stream = grok.stream('What is 6 times 7? Use the multiply tool.');

    const events: string[] = [];
    let hasToolCallDelta = false;

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === StreamEventType.ToolCallDelta) {
        hasToolCallDelta = true;
      }
    }

    const turn = await stream.turn;

    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    expect(turn.response.text).toContain('42');
  });

  test('structured output with JSON schema', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      structure: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          country: { type: 'string' },
          population: { type: 'number' },
        },
        required: ['city', 'country', 'population'],
      },
    });

    const turn = await grok.generate('Tell me about Tokyo, Japan.');

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Tokyo');
    expect(data.country).toContain('Japan');
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
      run: async (params: { city: string }) => `${params.city}: 72°F`,
    };

    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await grok.generate('What is the weather in London and Paris? Use the tool for both cities.');

    const cities = turn.toolExecutions
      .map((execution) => {
        const city = execution.arguments.city;
        return typeof city === 'string' ? city : undefined;
      })
      .filter((city): city is string => city !== undefined);
    expect(cities).toContain('London');
    expect(cities).toContain('Paris');
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    const text = turn.response.text.toLowerCase();
    expect(text).toContain('london');
    expect(text).toContain('paris');
  });

  test('truncation strategy', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: {
        max_output_tokens: 100,
        truncation: 'auto',
      },
    });

    const turn = await grok.generate('Say hello.');

    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 30000);
});

/**
 * Error handling tests for xAI Responses API
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Responses API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast-non-reasoning', { api: 'responses' }),
      params: { max_output_tokens: 10 },
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
    const grok = llm<XAIResponsesParams>({
      model: xai('nonexistent-model-xyz', { api: 'responses' }),
      params: { max_output_tokens: 10 },
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
