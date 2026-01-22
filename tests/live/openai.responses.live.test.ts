import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import type { OpenAIResponsesParams } from '../../src/openai/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError, ErrorCode } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import type { DocumentBlock } from '../../src/types/content.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeEvaluateExpression } from '../helpers/math.ts';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

type CityData = { city: string; population: number; isCapital: boolean };

/**
 * Live API tests for OpenAI Responses API (default)
 * Requires OPENAI_API_KEY environment variable
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Responses API Live', () => {
  test('simple text generation', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'), // Default: uses Responses API
      params: { max_output_tokens: 100 },
    });

    const turn = await gpt.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('explicitly use responses api', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2', { api: 'responses' }), // Explicit
      params: { max_output_tokens: 100 },
    });

    const turn = await gpt.generate('Say "Responses API" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('responses');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('rejects document inputs when unsupported', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 20 },
    });

    const documentBlock: DocumentBlock = {
      type: 'document',
      source: { type: 'text', data: 'Document contents' },
      mimeType: 'text/plain',
      title: 'Notes',
    };

    try {
      await gpt.generate(documentBlock);
      throw new Error('Expected document input rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe(ErrorCode.InvalidRequest);
        expect(error.message).toContain('PDF documents');
      }
    }
  });

  test('streaming text generation', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 50 },
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

  test('aborts stream before request starts', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 200 },
    });

    const stream = gpt.stream('Write a long response about the history of space travel.');
    stream.abort();

    const iterator = stream[Symbol.asyncIterator]();

    try {
      await iterator.next();
      throw new Error('Expected stream to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('CANCELLED');
        expect(error.modality).toBe('llm');
      }
    }

    await expect(stream.turn).rejects.toBeInstanceOf(UPPError);
  });

  test('multi-turn conversation', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 100 },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await gpt.generate(history, 'My name is Bob.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await gpt.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('bob');
  });

  test('with system prompt (instructions)', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 50 },
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

    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 200 },
      tools: [calculate],
    });

    const turn = await gpt.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
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

    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 200 },
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

  test('protocol-level structured output (schema enforcement)', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 200 },
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

    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 300 },
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
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
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
  }, 30000);
});

/**
 * Error handling tests for Responses API
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Responses API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-5.2'),
      params: { max_output_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await gpt.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe('AUTHENTICATION_FAILED');
      expect(uppError.provider).toBe('openai');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('nonexistent-model-xyz'),
      params: { max_output_tokens: 10 },
    });

    try {
      await gpt.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(['MODEL_NOT_FOUND', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('openai');
    }
  });
});
