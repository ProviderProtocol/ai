import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

/**
 * Live API tests for Anthropic
 * Requires ANTHROPIC_API_KEY environment variable
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Live API', () => {
  test('simple text generation', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 100 },
    });

    const turn = await claude.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 50 },
    });

    const stream = claude.stream('Count from 1 to 5.');

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
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 100 },
    });

    const history: any[] = [];

    // First turn
    const turn1 = await claude.generate(history, 'My name is Alice.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await claude.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('alice');
  });

  test('with system prompt', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 50 },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await claude.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes('ahoy') ||
      text.includes('matey') ||
      text.includes('arr') ||
      text.includes('pirate') ||
      text.includes('sea') ||
      text.includes('ship')
    ).toBe(true);
  });

  test('tool calling', async () => {
    const getWeather = {
      name: 'getWeather',
      description: 'Get the weather for a location',
      parameters: {
        type: 'object' as const,
        properties: {
          location: { type: 'string' as const, description: 'The city name' },
        },
        required: ['location'],
      },
      run: async (params: { location: string }) => {
        return `The weather in ${params.location} is 72°F and sunny.`;
      },
    };

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 200 },
      tools: [getWeather],
    });

    const turn = await claude.generate('What is the weather in Tokyo?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.toolExecutions[0]?.toolName).toBe('getWeather');
    expect(turn.response.text.toLowerCase()).toContain('tokyo');
  });

  test('vision/multimodal with base64 image', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
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

    const turn = await claude.generate([imageMessage]);

    // Should identify the duck
    expect(turn.response.text.toLowerCase()).toMatch(/duck|bird|waterfowl/);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming with tool execution', async () => {
    const calculator = {
      name: 'add',
      description: 'Add two numbers together',
      parameters: {
        type: 'object' as const,
        properties: {
          a: { type: 'number' as const, description: 'First number' },
          b: { type: 'number' as const, description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      run: async (params: { a: number; b: number }) => {
        return `The sum is ${params.a + params.b}`;
      },
    };

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 200 },
      tools: [calculator],
    });

    const stream = claude.stream('What is 7 + 15? Use the add tool.');

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
    expect(turn.response.text).toContain('22');
  });

  test('structured output with JSON schema', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 200 },
    });

    // Anthropic doesn't have native structured output, but we can request JSON
    const turn = await claude.generate(
      'Return a JSON object with fields "name" (string) and "age" (number) for a person named John who is 30. Only return the JSON, no other text.'
    );

    // Should be valid JSON
    const text = turn.response.text.trim();
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe('John');
    expect(parsed.age).toBe(30);
  });

  test('protocol-level structured output (schema enforcement)', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
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

    const turn = await claude.generate('Tell me about Paris, France.');

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

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await claude.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

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

  test('streaming with structured output', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
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

    const stream = claude.stream('Tell me about Tokyo, Japan.');

    // Anthropic uses tool-based structured output, so we accumulate tool_call_delta events
    let accumulatedJson = '';
    for await (const event of stream) {
      if (event.type === 'tool_call_delta' && event.delta.argumentsJson) {
        accumulatedJson += event.delta.argumentsJson;
      }
    }

    // The accumulated JSON should be valid and parseable
    expect(accumulatedJson.length).toBeGreaterThan(0);
    const streamedData = JSON.parse(accumulatedJson);
    expect(streamedData.city).toContain('Tokyo');

    const turn = await stream.turn;

    // The 'data' field should match what we accumulated
    expect(turn.data).toBeDefined();
    expect((turn.data as any).city).toContain('Tokyo');
    expect(typeof (turn.data as any).population).toBe('number');
    expect((turn.data as any).isCapital).toBe(true);

    // Verify streamed matches final
    expect(streamedData.city).toBe((turn.data as any).city);
  });
});

/**
 * Error handling tests
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await claude.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe('AUTHENTICATION_FAILED');
      expect(uppError.provider).toBe('anthropic');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('nonexistent-model-xyz'),
      params: { max_tokens: 10 },
    });

    try {
      await claude.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(['MODEL_NOT_FOUND', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('anthropic');
    }
  });
});
