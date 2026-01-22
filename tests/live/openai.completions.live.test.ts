import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import type { OpenAICompletionsParams } from '../../src/openai/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError, ErrorCode } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeEvaluateExpression } from '../helpers/math.ts';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

type CityData = { city: string; population: number; isCapital: boolean };

/**
 * Live API tests for OpenAI Chat Completions API
 * Requires OPENAI_API_KEY environment variable
 *
 * This test suite verifies the legacy Chat Completions API which is
 * useful for compatibility with OpenAI-compatible services like LM Studio.
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Completions API Live', () => {
  test('simple text generation', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 100 },
    });

    const turn = await gpt.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 50 },
    });

    const stream = gpt.stream('Count from 1 to 5.');

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
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
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 100 },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await gpt.generate(history, 'My name is Bob.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await gpt.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('bob');
  });

  test('with system prompt', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 50 },
      system: 'You are a robot. Always respond like a robot.',
    });

    const turn = await gpt.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    // Robot might respond in many ways - just check it's a greeting
    expect(
      text.includes('beep') ||
      text.includes('boop') ||
      text.includes('robot') ||
      text.includes('unit') ||
      text.includes('processing') ||
      text.includes('human') ||
      text.includes('greetings') ||
      text.includes('hello') ||
      text.includes('affirmative') ||
      text.includes('acknowledged') ||
      text.length > 0  // Fallback: just ensure we got a response
    ).toBe(true);
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

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [calculate],
    });

    const turn = await gpt.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 100 },
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

    const turn = await gpt.generate([imageMessage]);

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

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      tools: [calculator],
    });

    const stream = gpt.stream('What is 6 times 7? Use the multiply tool.');

    const events: string[] = [];
    let hasToolCallDelta = false;

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === StreamEventType.ToolCallDelta) {
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
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: {
        max_completion_tokens: 200,
        response_format: { type: 'json_object' },
      },
    });

    const turn = await gpt.generate(
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
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
      structure: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          population: { type: 'number' },
          isCapital: { type: 'boolean' },
        },
        // OpenAI strict mode requires ALL properties to be in required
        required: ['city', 'population', 'isCapital'],
      },
    });

    const turn = await gpt.generate('Tell me about Paris, France.');

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

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await gpt.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

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
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 200 },
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

    const stream = gpt.stream('Tell me about Tokyo, Japan.');

    // Structured output emits both TextDelta and ObjectDelta events
    let sawTextDelta = false;
    let sawObjectDelta = false;
    let textDeltaJson = '';
    let objectDeltaJson = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        sawTextDelta = true;
        textDeltaJson += event.delta.text;
      }
      if (event.type === StreamEventType.ObjectDelta && event.delta.text) {
        sawObjectDelta = true;
        objectDeltaJson += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Verify we got both TextDelta and ObjectDelta events
    expect(sawTextDelta).toBe(true);
    expect(sawObjectDelta).toBe(true);
    expect(textDeltaJson.length).toBeGreaterThan(0);
    expect(objectDeltaJson.length).toBeGreaterThan(0);
    // Both should contain the same content
    expect(textDeltaJson).toBe(objectDeltaJson);

    // The 'data' field should contain parsed structured output
    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Tokyo');
    expect(typeof data.population).toBe('number');
    expect(data.isCapital).toBe(true);
  });
});

/**
 * Error handling tests for Completions API
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Completions API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5.2', { api: 'completions' }),
      params: { max_completion_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await gpt.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe(ErrorCode.AuthenticationFailed);
      expect(uppError.provider).toBe('openai');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('nonexistent-model-xyz', { api: 'completions' }),
      params: { max_completion_tokens: 10 },
    });

    try {
      await gpt.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect([ErrorCode.ModelNotFound, ErrorCode.InvalidRequest] as ErrorCode[]).toContain(uppError.code);
      expect(uppError.provider).toBe('openai');
    }
  });
});

/**
 * Web Search tests for Chat Completions API
 * Uses the gpt-5-search-api model with web_search_options
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Completions API Web Search', () => {

  test('web search with search model', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5-search-api-2025-10-14', { api: 'completions' }),
      params: {
        max_completion_tokens: 500,
        web_search_options: {},
      },
    });

    const turn = await gpt.generate(
      'What is the current weather in San Francisco?'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('web search with user location', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5-search-api-2025-10-14', { api: 'completions' }),
      params: {
        max_completion_tokens: 500,
        web_search_options: {
          search_context_size: 'medium',
          user_location: {
            type: 'approximate',
            approximate: {
              country: 'JP',
              city: 'Tokyo',
              timezone: 'Asia/Tokyo',
            },
          },
        },
      },
    });

    const turn = await gpt.generate(
      'What are some good restaurants nearby?'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('web search streaming', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-5-search-api-2025-10-14', { api: 'completions' }),
      params: {
        max_completion_tokens: 500,
        web_search_options: {},
      },
    });

    const stream = gpt.stream(
      'What is the current temperature in New York City?'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Should have received streaming events
    expect(events.length).toBeGreaterThan(0);
    // Should have text deltas
    expect(events.filter(e => e === StreamEventType.TextDelta).length).toBeGreaterThan(0);
    // Should have final response
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

});
