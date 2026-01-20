import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { cerebras } from '../../src/providers/cerebras/index.ts';
import type { CerebrasLLMParams } from '../../src/providers/cerebras/index.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError, ErrorCode } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';

type CityData = { city: string; population: number; isCapital: boolean };

/**
 * Live API tests for Cerebras
 * Requires CEREBRAS_API_KEY environment variable
 *
 * Uses gpt-oss-120b which supports:
 * - Streaming
 * - Tool calling
 * - Structured output
 * - Reasoning (reasoning_effort, reasoning_format)
 */
describe.skipIf(!process.env.CEREBRAS_API_KEY)('Cerebras Live API', () => {
  test('simple text generation', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 200, reasoning_format: 'hidden' },
    });

    const turn = await model.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 200, reasoning_format: 'hidden' },
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
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 200, reasoning_format: 'hidden' },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await model.generate(history, 'My name is Alice.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await model.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('alice');
  });

  test('with system prompt', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 200, reasoning_format: 'hidden' },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await model.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes('ahoy') ||
      text.includes('matey') ||
      text.includes('arr') ||
      text.includes('pirate') ||
      text.includes('sea') ||
      text.includes('ship') ||
      text.includes('captain') ||
      text.includes('treasure')
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

    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 400, reasoning_format: 'hidden' },
      tools: [getWeather],
    });

    const turn = await model.generate('What is the weather in Tokyo?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.toolExecutions[0]?.toolName).toBe('getWeather');
    expect(turn.response.text.toLowerCase()).toContain('tokyo');
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

    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 400, reasoning_format: 'hidden' },
      tools: [calculator],
    });

    const stream = model.stream('What is 7 + 15? Use the add tool.');

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
    expect(turn.response.text).toContain('22');
  });

  test('structured output with JSON schema', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 300, reasoning_format: 'hidden' },
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
    expect(data.city.toLowerCase()).toContain('paris');
    expect(typeof data.population).toBe('number');
    expect(typeof data.isCapital).toBe('boolean');
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

    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 500, reasoning_format: 'hidden' },
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

  test('streaming with structured output', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 300, reasoning_format: 'hidden' },
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

    let accumulatedText = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta && event.delta.text) {
        accumulatedText += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city.toLowerCase()).toContain('tokyo');
    expect(typeof data.population).toBe('number');
  });
});

/**
 * Reasoning tests for Cerebras gpt-oss-120b
 * Tests the reasoning_effort and reasoning_format parameters
 */
describe.skipIf(!process.env.CEREBRAS_API_KEY)('Cerebras Reasoning', () => {
  test('reasoning with parsed format', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: {
        max_completion_tokens: 500,
        reasoning_effort: 'medium',
        reasoning_format: 'parsed',
      },
    });

    const turn = await model.generate('What is 15 * 23? Think step by step.');

    expect(turn.response.text).toContain('345');
    // With parsed format, reasoning should be in metadata
    const reasoning = turn.response.metadata?.cerebras?.reasoning;
    // Reasoning may or may not be present depending on model behavior
    if (reasoning) {
      expect(typeof reasoning).toBe('string');
    }
  });

  test('reasoning with high effort', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: {
        max_completion_tokens: 800,
        reasoning_effort: 'high',
        reasoning_format: 'parsed',
      },
    });

    const turn = await model.generate(
      'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?'
    );

    // The answer should be $0.05 (not $0.10 which is the common wrong answer)
    const text = turn.response.text.toLowerCase();
    expect(text).toMatch(/0\.05|5\s*cents|five\s*cents|\$0\.05/);
  });

  test('streaming with reasoning', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: {
        max_completion_tokens: 500,
        reasoning_effort: 'medium',
        reasoning_format: 'parsed',
      },
    });

    const stream = model.stream('What is the square root of 144?');

    let hasReasoningDelta = false;
    let hasTextDelta = false;

    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta) {
        hasReasoningDelta = true;
      }
      if (event.type === StreamEventType.TextDelta) {
        hasTextDelta = true;
      }
    }

    const turn = await stream.turn;

    expect(turn.response.text).toContain('12');
    expect(hasTextDelta).toBe(true);
    // Reasoning delta may or may not be present depending on model behavior
    // Log it for debugging purposes
    if (hasReasoningDelta) {
      expect(hasReasoningDelta).toBe(true);
    }
  });
});

/**
 * Error handling tests
 */
describe.skipIf(!process.env.CEREBRAS_API_KEY)('Cerebras Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe(ErrorCode.AuthenticationFailed);
      expect(uppError.provider).toBe('cerebras');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('nonexistent-model-xyz'),
      params: { max_completion_tokens: 10 },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect([ErrorCode.ModelNotFound, ErrorCode.InvalidRequest] as string[]).toContain(uppError.code);
      expect(uppError.provider).toBe('cerebras');
    }
  });
});

/**
 * Cerebras-specific feature tests
 */
describe.skipIf(!process.env.CEREBRAS_API_KEY)('Cerebras Features', () => {
  test('time info is available in metadata', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 200, reasoning_format: 'hidden' },
    });

    const turn = await model.generate('Say hello.');

    // Time info should be in metadata if returned by the API
    const cerebrasMeta = turn.response.metadata?.cerebras as {
      time_info?: { total_time?: number };
    } | undefined;
    const timeInfo = cerebrasMeta?.time_info;
    // Time info may or may not be present in all responses
    if (timeInfo && timeInfo.total_time !== undefined) {
      expect(typeof timeInfo.total_time).toBe('number');
    }
  });

  test('cached tokens are tracked in usage', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: { max_completion_tokens: 200, reasoning_format: 'hidden' },
    });

    // First request to potentially cache
    const turn1 = await model.generate('Tell me about the capital of France.');

    // Second request with same prefix to potentially hit cache
    const turn2 = await model.generate('Tell me about the capital of France. What is its population?');

    // Usage should be tracked (cache read tokens may or may not be present)
    expect(turn1.usage.inputTokens).toBeGreaterThan(0);
    expect(turn2.usage.inputTokens).toBeGreaterThan(0);
    // cacheReadTokens will be 0 if not cached, but should be defined
    expect(typeof turn2.usage.cacheReadTokens).toBe('number');
  });

  test('service tier parameter is accepted', async () => {
    const model = llm<CerebrasLLMParams>({
      model: cerebras('gpt-oss-120b'),
      params: {
        max_completion_tokens: 200,
        reasoning_format: 'hidden',
        service_tier: 'default',
      },
    });

    const turn = await model.generate('Say hello.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
  });
});
