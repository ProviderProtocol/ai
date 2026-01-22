import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic, betas } from '../../src/anthropic/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError, ErrorCode } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

// Load helloworld.pdf for document tests
const HELLO_PDF_PATH = join(import.meta.dir, '../assets/helloworld.pdf');
const HELLO_PDF_BASE64 = readFileSync(HELLO_PDF_PATH).toString('base64');

type CityData = { city: string; population: number; isCapital: boolean };
type CityCountryData = { city: string; country: string; population: number };

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
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 100 },
    });

    const history: Message[] = [];

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
      if (event.type === StreamEventType.ToolCallDelta) {
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

    // Anthropic legacy models do not have native structured output, but we can request JSON
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
    // Native structured outputs require Claude 4.5 models, but we can test protocol-level enforcement (this will use tool forcing)
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

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await claude.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

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

    // Anthropic uses tool-based structured output - emits both ToolCallDelta and ObjectDelta
    let sawToolCallDelta = false;
    let sawObjectDelta = false;
    let toolCallJson = '';
    let objectDeltaJson = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta && event.delta.argumentsJson) {
        sawToolCallDelta = true;
        toolCallJson += event.delta.argumentsJson;
      }
      if (event.type === StreamEventType.ObjectDelta && event.delta.text) {
        sawObjectDelta = true;
        objectDeltaJson += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Verify we got both ToolCallDelta and ObjectDelta events
    expect(sawToolCallDelta).toBe(true);
    expect(sawObjectDelta).toBe(true);
    expect(toolCallJson.length).toBeGreaterThan(0);
    expect(objectDeltaJson.length).toBeGreaterThan(0);
    // Both should contain the same content
    expect(toolCallJson).toBe(objectDeltaJson);

    // The 'data' field should contain parsed structured output
    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Tokyo');
    expect(typeof data.population).toBe('number');
    expect(data.isCapital).toBe(true);
  });
});

/**
 * Native structured outputs tests (beta feature)
 * These tests use the betas.structuredOutputs beta via the new betas API
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Native Structured Outputs', () => {
  test('native structured output with betas API', async () => {
    // Native structured outputs require Claude 4.5 models
    // Using the new betas API instead of manual header configuration
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-5', {
        betas: [betas.structuredOutputs],
      }),
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

    // The 'data' field should be populated from native JSON output
    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Paris');
    expect(typeof data.population).toBe('number');
    expect(data.isCapital).toBe(true);

    // With native structured outputs, the text contains the raw JSON
    expect(turn.response.text.length).toBeGreaterThan(0);
    const parsedText = JSON.parse(turn.response.text) as CityData;
    expect(parsedText.city).toBe(data.city);
  });

  test('streaming with native structured output', async () => {
    // Native structured outputs require Claude 4.5 models
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-5', {
        betas: [betas.structuredOutputs],
      }),
      params: { max_tokens: 200 },
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

    const stream = claude.stream('Tell me about Tokyo, Japan.');

    // Native structured outputs stream text_delta events (not tool_call_delta)
    let accumulatedText = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        accumulatedText += event.delta.text;
      }
    }

    // The accumulated text should be valid JSON
    expect(accumulatedText.length).toBeGreaterThan(0);
    const streamedData = JSON.parse(accumulatedText) as CityCountryData;
    expect(streamedData.city).toContain('Tokyo');
    expect(streamedData.country).toContain('Japan');

    const turn = await stream.turn;

    // The 'data' field should match what we accumulated
    expect(turn.data).toBeDefined();
    const data = turn.data as CityCountryData;
    expect(data.city).toContain('Tokyo');
    expect(typeof data.population).toBe('number');

    // Verify streamed matches final
    expect(streamedData.city).toBe(data.city);
  });

  test('multiple betas can be combined', async () => {
    // Test combining multiple betas - structuredOutputs + tokenEfficientTools
    const getWeather = {
      name: 'getWeather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object' as const,
        properties: { city: { type: 'string' as const } },
        required: ['city'],
      },
      run: async (params: { city: string }) => `${params.city}: 75°F and sunny`,
    };

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-5', {
        betas: [betas.structuredOutputs, betas.tokenEfficientTools],
      }),
      params: { max_tokens: 300 },
      tools: [getWeather],
      structure: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          temperature: { type: 'string' },
          conditions: { type: 'string' },
        },
        required: ['city', 'temperature', 'conditions'],
      },
    });

    const turn = await claude.generate('What is the weather in Tokyo? Use the tool and return structured data.');

    // Should have tool executions
    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    // Should have structured data
    expect(turn.data).toBeDefined();
  });

  test('token efficient tools beta works with haiku', async () => {
    // Test token efficient tools beta with Claude Haiku
    const greet = {
      name: 'greet',
      description: 'Greet a person by name',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Name to greet' },
        },
        required: ['name'],
      },
      run: async (params: { name: string }) => `Hello, ${params.name}!`,
    };

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest', {
        betas: [betas.tokenEfficientTools],
      }),
      params: { max_tokens: 150 },
      tools: [greet],
    });

    const turn = await claude.generate('Greet Alice using the greet tool.');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.toolExecutions[0]?.toolName).toBe('greet');
  });

  test('custom string betas are passed through', async () => {
    // Test that arbitrary string betas work (for future/unlisted betas)
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest', {
        betas: ['pdfs-2024-09-25'], // Using a known beta as string
      }),
      params: { max_tokens: 50 },
    });

    // This should work - the beta is passed through even if we don't use PDFs
    const turn = await claude.generate('Say hello.');
    expect(turn.response.text.toLowerCase()).toContain('hello');
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
      expect(uppError.code).toBe(ErrorCode.AuthenticationFailed);
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
      expect([ErrorCode.ModelNotFound, ErrorCode.InvalidRequest] as string[]).toContain(uppError.code);
      expect(uppError.provider).toBe('anthropic');
    }
  });
});

/**
 * Document input tests (PDF support)
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Document Input', () => {
  test('PDF document with base64 encoding', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 100 },
    });

    // Create a user message with PDF document
    const docMessage = new UserMessage([
      { type: 'text', text: 'What text is shown in this PDF document? Reply with just the text.' },
      {
        type: 'document',
        mimeType: 'application/pdf',
        source: { type: 'base64', data: HELLO_PDF_BASE64 },
      },
    ]);

    const turn = await claude.generate([docMessage]);

    // Should identify the "Hello, world!" text
    expect(turn.response.text.toLowerCase()).toMatch(/hello.*world|hello,\s*world/i);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('plain text document', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 100 },
    });

    const docMessage = new UserMessage([
      { type: 'text', text: 'What is the capital mentioned in this document? Reply with just the city name.' },
      {
        type: 'document',
        mimeType: 'text/plain',
        source: { type: 'text', data: 'The capital of France is Paris. It is known for the Eiffel Tower.' },
      },
    ]);

    const turn = await claude.generate([docMessage]);

    expect(turn.response.text.toLowerCase()).toContain('paris');
  });

  test('mixed content with image and document', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 200 },
    });

    const mixedMessage = new UserMessage([
      { type: 'text', text: 'I have an image and a document. What animal is in the image and what text is in the PDF?' },
      {
        type: 'image',
        mimeType: 'image/png',
        source: { type: 'base64', data: DUCK_IMAGE_BASE64 },
      },
      {
        type: 'document',
        mimeType: 'application/pdf',
        source: { type: 'base64', data: HELLO_PDF_BASE64 },
      },
    ]);

    const turn = await claude.generate([mixedMessage]);

    const text = turn.response.text.toLowerCase();
    // Should mention both the duck and "hello world"
    expect(text).toMatch(/duck|bird|waterfowl/);
    expect(text).toMatch(/hello.*world|hello,\s*world/i);
  });

  test('streaming with document input', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 100 },
    });

    const docMessage = new UserMessage([
      { type: 'text', text: 'Read this document and tell me what it says.' },
      {
        type: 'document',
        mimeType: 'application/pdf',
        source: { type: 'base64', data: HELLO_PDF_BASE64 },
      },
    ]);

    const stream = claude.stream([docMessage]);

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Both streamed text and final turn should contain "hello world"
    expect(text.toLowerCase()).toMatch(/hello.*world|hello,\s*world/i);
    expect(turn.response.text.toLowerCase()).toMatch(/hello.*world|hello,\s*world/i);
  });
});
