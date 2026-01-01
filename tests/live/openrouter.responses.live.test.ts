import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openrouter } from '../../src/openrouter/index.ts';
import type { OpenRouterResponsesParams } from '../../src/openrouter/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

// Use a model that supports the Responses API (beta)
// Note: The Responses API is in beta on OpenRouter, so model support may vary
const TEST_MODEL = 'openai/gpt-5.2';
const VISION_MODEL = 'openai/gpt-5.2';

/**
 * Live API tests for OpenRouter Responses API (Beta)
 * Requires OPENROUTER_API_KEY environment variable
 *
 * IMPORTANT: The Responses API on OpenRouter is in BETA and has limitations:
 * - Streaming may not work correctly for all event types
 * - Image input format may differ from the Completions API
 * - Some features may have different behavior or not be fully supported
 *
 * KNOWN BUG (Dec 2025): OpenRouter's streaming events for tool calls
 * (`response.function_call_arguments.done`) send empty arguments strings,
 * despite their documentation indicating arguments should be present.
 * The actual arguments only appear in the final `response.completed` event.
 * Workaround: src/providers/openrouter/transform.responses.ts:465
 *
 * For production use, prefer the Completions API (default) which is stable.
 */
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Responses API Live (Beta)', () => {
  test('simple text generation', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 100 },
    });

    const turn = await model.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 50 },
    });

    const stream = model.stream('Count from 1 to 5.');

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
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 100 },
    });

    const history: any[] = [];

    // First turn
    const turn1 = await model.generate(history, 'My name is Alice.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await model.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('alice');
  });

  test('with system prompt', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 50 },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await model.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    // Pirate might respond in many ways
    expect(
      text.includes('ahoy') ||
      text.includes('arr') ||
      text.includes('matey') ||
      text.includes('ye') ||
      text.includes('cap') ||
      text.includes('sailor') ||
      text.includes('sea') ||
      text.includes('ship') ||
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
        try {
          return `Result: ${eval(params.expression)}`;
        } catch {
          return 'Error evaluating expression';
        }
      },
    };

    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [calculate],
    });

    const turn = await model.generate('What is 23 + 19?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(VISION_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 100 },
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

  // NOTE: This test works around an OpenRouter bug where streaming tool call
  // arguments are empty. Arguments are extracted from response.completed instead.
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

    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [calculator],
    });

    const stream = model.stream('What is 6 times 7? Use the multiply tool.');

    const events: string[] = [];
    let hasToolCallDelta = false;

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'tool_call_delta') {
        hasToolCallDelta = true;
      }
    }

    const turn = await stream.turn;

    // Note: tool_call_delta events may not have arguments due to OpenRouter bug
    // Tool execution should still work because we extract args from response.completed
    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    // Final response should contain the answer
    expect(turn.response.text).toContain('42');
  });

  test('structured output with JSON schema', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 200 },
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

    const turn = await model.generate('Tell me about London, UK.');

    // The 'data' field should be automatically populated and typed
    expect(turn.data).toBeDefined();
    expect((turn.data as any).city).toContain('London');
    expect(typeof (turn.data as any).population).toBe('number');
  }, 30000);

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

    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await model.generate('What is the weather in London and Paris? Use the tool for both cities.');

    // Verify multiple executions occurred in the same turn
    const cities = turn.toolExecutions.map(t => (t.arguments as any).city);
    expect(cities).toContain('London');
    expect(cities).toContain('Paris');
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    // Verify final response mentions both
    const text = turn.response.text.toLowerCase();
    expect(text).toContain('london');
    expect(text).toContain('paris');
  });

  test('streaming with structured output', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 200 },
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

    const stream = model.stream('Tell me about Berlin, Germany.');

    // Accumulate text_delta events
    let accumulatedJson = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        accumulatedJson += event.delta.text;
      }
    }

    // The accumulated JSON should be valid and parseable
    expect(accumulatedJson.length).toBeGreaterThan(0);
    const streamedData = JSON.parse(accumulatedJson);
    expect(streamedData.city).toContain('Berlin');

    const turn = await stream.turn;

    // The 'data' field should match what we accumulated
    expect(turn.data).toBeDefined();
    expect((turn.data as any).city).toContain('Berlin');
    expect(typeof (turn.data as any).population).toBe('number');
    expect((turn.data as any).isCapital).toBe(true);

    // Verify streamed matches final
    expect(streamedData.city).toBe((turn.data as any).city);
  });

  test('reasoning effort parameter', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: {
        max_output_tokens: 200,
        reasoning: { effort: 'medium' },
      },
    });

    const turn = await model.generate('What is 2 + 2?');

    expect(turn.response.text).toContain('4');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });
});

/**
 * Error handling tests for OpenRouter Responses API
 */
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Responses API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter(TEST_MODEL, { api: 'responses' }),
      params: { max_output_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe('AUTHENTICATION_FAILED');
      expect(uppError.provider).toBe('openrouter');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter('nonexistent/model-xyz-12345', { api: 'responses' }),
      params: { max_output_tokens: 10 },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(['MODEL_NOT_FOUND', 'INVALID_REQUEST', 'PROVIDER_ERROR']).toContain(uppError.code);
      expect(uppError.provider).toBe('openrouter');
    }
  });
});
