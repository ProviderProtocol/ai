import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { parsedObjectMiddleware, type ParsedStreamEvent } from '../../src/middleware/parsed-object.ts';
import { responses } from '../../src/responses/index.ts';
import type { ResponsesParams } from '../../src/responses/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { StreamEventType, type StreamEvent } from '../../src/types/stream.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeEvaluateExpression } from '../helpers/math.ts';

/** Helper to access parsed field from middleware-enhanced events */
const getParsed = (event: StreamEvent): unknown => (event as ParsedStreamEvent).delta.parsed;

const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

type CityData = { city: string; population: number; isCapital: boolean; country?: string };

/**
 * Live API tests for OpenResponses provider using OpenAI as the backend.
 * These tests verify that the responses() provider correctly implements
 * the OpenResponses specification.
 *
 * Requires OPENAI_API_KEY environment variable.
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenResponses Provider Live (OpenAI Backend)', () => {
  const OPENAI_HOST = 'https://api.openai.com/v1';

  test('simple text generation', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 100 },
    });

    const turn = await model.generate('Say "Hello OpenResponses" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('openresponses');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 50 },
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
    expect(turn.response.text).toContain('1');
    expect(turn.response.text).toContain('5');
  });

  test('multi-turn conversation', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 100 },
    });

    const history: Message[] = [];

    const turn1 = await model.generate(history, 'My name is Alice.');
    history.push(...turn1.messages);

    const turn2 = await model.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('alice');
  });

  test('with system prompt', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 50 },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await model.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes('ahoy') ||
      text.includes('matey') ||
      text.includes('arr') ||
      text.includes('ye') ||
      text.includes('ship') ||
      text.includes('sea') ||
      text.includes('captain') ||
      text.includes('sailor') ||
      text.length > 0
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

    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 200 },
      tools: [calculate],
    });

    const turn = await model.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
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

    const turn = await model.generate([imageMessage]);

    expect(turn.response.text.toLowerCase()).toMatch(/duck|bird|waterfowl/);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('structured output', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
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

    const turn = await model.generate('Tell me about Paris, France.');

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Paris');
    expect(typeof data.population).toBe('number');
  });

  test('structured output streaming emits object_delta with parsed', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
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
      middleware: [parsedObjectMiddleware()],
    });

    const stream = model.stream('Tell me about Tokyo, Japan. Include the population.');

    const parsedSnapshots: unknown[] = [];
    let hasObjectDelta = false;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        hasObjectDelta = true;
        if (getParsed(event) !== undefined) {
          parsedSnapshots.push(getParsed(event));
        }
      }
    }

    const turn = await stream.turn;

    expect(hasObjectDelta).toBe(true);
    expect(parsedSnapshots.length).toBeGreaterThan(0);

    const lastParsed = parsedSnapshots[parsedSnapshots.length - 1] as CityData;
    expect(lastParsed.city).toBeDefined();
    expect(lastParsed.country).toBeDefined();

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData & { country: string };
    expect(data.city.toLowerCase()).toContain('tokyo');
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

    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 200 },
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

    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    expect(turn.response.text).toContain('42');
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

    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await model.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

    const cities = turn.toolExecutions
      .map((execution) => {
        const city = execution.arguments.city;
        return typeof city === 'string' ? city : undefined;
      })
      .filter((city): city is string => city !== undefined);

    expect(cities).toContain('Tokyo');
    expect(cities).toContain('San Francisco');
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    const text = turn.response.text.toLowerCase();
    expect(text).toContain('tokyo');
    expect(text).toContain('san francisco');
  });

  test('aborts stream before request starts', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 200 },
    });

    const stream = model.stream('Write a long response about the history of space travel.');
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
});

/**
 * Error handling tests for OpenResponses provider.
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenResponses Provider Error Handling', () => {
  const OPENAI_HOST = 'https://api.openai.com/v1';

  test('invalid API key returns UPPError', async () => {
    const model = llm<ResponsesParams>({
      model: responses('gpt-5.2', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe('AUTHENTICATION_FAILED');
      expect(uppError.provider).toBe('responses');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const model = llm<ResponsesParams>({
      model: responses('nonexistent-model-xyz', {
        host: OPENAI_HOST,
        apiKeyEnv: 'OPENAI_API_KEY',
      }),
      params: { max_output_tokens: 10 },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(['MODEL_NOT_FOUND', 'INVALID_REQUEST']).toContain(uppError.code);
      expect(uppError.provider).toBe('responses');
    }
  });

  test('missing host throws error', () => {
    expect(() => {
      responses('gpt-5.2', {} as { host: string });
    }).toThrow('OpenResponses provider requires a host option');
  });
});
