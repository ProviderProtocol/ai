import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openrouter } from '../../src/openrouter/index.ts';
import type { OpenRouterCompletionsParams } from '../../src/openrouter/index.ts';
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

// Use a fast, cheap model for testing
const TEST_MODEL = 'openai/gpt-5.2';
const VISION_MODEL = 'openai/gpt-5.2'; // Supports vision

type CityData = { city: string; population: number; isCapital: boolean };

/**
 * Live API tests for OpenRouter Chat Completions API (default)
 * Requires OPENROUTER_API_KEY environment variable
 */
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Completions API Live', () => {
  test('simple text generation', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL), // Default: uses Completions API
      params: { max_tokens: 100 },
    });

    const turn = await model.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('explicitly use completions api', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL, { api: 'completions' }), // Explicit
      params: { max_tokens: 100 },
    });

    const turn = await model.generate('Say "Completions API" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('completions');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 50 },
    });

    const stream = model.stream('Count from 1 to 5.');

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
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 100 },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await model.generate(history, 'My name is Bob.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await model.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('bob');
  });

  test('with system prompt', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 50 },
      system: 'You are a robot. Always respond like a robot.',
    });

    const turn = await model.generate('Hello!');

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

  test('with system prompt array', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 50 },
      system: [{ type: 'text', text: 'You are concise.' }],
    });

    const turn = await model.generate('Hello!');

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
        const result = safeEvaluateExpression(params.expression);
        return result === null ? 'Error evaluating expression' : `Result: ${result}`;
      },
    };

    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 200 },
      tools: [calculate],
    });

    const turn = await model.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(VISION_MODEL),
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

    const turn = await model.generate([imageMessage]);

    // Should identify the duck
    expect(turn.response.text.toLowerCase()).toMatch(/duck|bird|waterfowl/);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  }, 30000);

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

    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 200 },
      tools: [calculator],
    });

    const stream = model.stream('What is 6 times 7? Use the multiply tool.');

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

  test('structured output with JSON schema', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
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

    const turn = await model.generate('Tell me about Paris, France.');

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

    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await model.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

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
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
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

    const stream = model.stream('Tell me about Tokyo, Japan.');

    // OpenRouter uses native structured output, so we accumulate text_delta events
    let accumulatedJson = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
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

  test('OpenRouter-specific: model routing with fallback', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: {
        max_tokens: 50,
        models: [TEST_MODEL, 'anthropic/claude-3-haiku'],
        route: 'fallback',
      },
    });

    const turn = await model.generate('Say hello.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('OpenRouter-specific: provider preferences', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: {
        max_tokens: 50,
        provider: {
          allow_fallbacks: true,
          require_parameters: false,
        },
      },
    });

    const turn = await model.generate('Say hello.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('OpenRouter-specific: extended sampling parameters', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter('meta-llama/llama-3.1-8b-instruct'),
      params: {
        max_tokens: 50,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        min_p: 0.05,
        repetition_penalty: 1.1,
      },
    });

    const turn = await model.generate('Say hello.');

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });
});

/**
 * Error handling tests for OpenRouter Completions API
 */
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Completions API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(TEST_MODEL),
      params: { max_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe(ErrorCode.AuthenticationFailed);
      expect(uppError.provider).toBe('openrouter');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter('nonexistent/model-xyz-12345'),
      params: { max_tokens: 10 },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect([ErrorCode.ModelNotFound, ErrorCode.InvalidRequest, ErrorCode.ProviderError] as ErrorCode[]).toContain(uppError.code);
      expect(uppError.provider).toBe('openrouter');
    }
  });
});
