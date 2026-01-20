import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { groq } from '../../src/groq/index.ts';
import type { GroqLLMParams } from '../../src/groq/index.ts';
import type { Message } from '../../src/types/messages.ts';
import { UPPError, ErrorCode } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import { safeEvaluateExpression } from '../helpers/math.ts';

type CityData = { city: string; population: number; isCapital: boolean };

/**
 * Live API tests for Groq Chat Completions API
 * Requires GROQ_API_KEY environment variable
 */
describe.skipIf(!process.env.GROQ_API_KEY)('Groq API Live', () => {
  test('simple text generation', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 100 },
    });

    const turn = await model.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 100 },
    });

    const stream = model.stream('Say "hello world" and nothing else.');

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text.toLowerCase()).toContain('hello');
    expect(turn.response.text.toLowerCase()).toContain('hello');
  });

  test('multi-turn conversation', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
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
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 100 },
      system: 'You are a helpful assistant. Always be polite.',
    });

    const turn = await model.generate('What is 2+2?');

    // Just verify we got a response with the system prompt applied
    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('4');
  });

  test('tool calling', async () => {
    const calculate = {
      name: 'calculate',
      description: 'Calculate a mathematical expression. You MUST use this tool for any math.',
      parameters: {
        type: 'object' as const,
        properties: {
          expression: { type: 'string' as const, description: 'The math expression to evaluate' },
        },
        required: ['expression'],
      },
      run: async (params: { expression: string }) => {
        const result = safeEvaluateExpression(params.expression);
        return result === null ? 'Error evaluating expression' : `Result: ${result}`;
      },
    };

    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 300 },
      tools: [calculate],
    });

    const turn = await model.generate('Use the calculate tool to compute 15 + 27. Do not answer without using the tool.');

    // Model should either use the tool or answer correctly
    const hasToolCalls = turn.toolExecutions.length > 0;
    const hasCorrectAnswer = turn.response.text.includes('42');
    expect(hasToolCalls || hasCorrectAnswer).toBe(true);
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

    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
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

    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    expect(turn.response.text).toContain('42');
  });

  test('structured output with JSON mode', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: {
        max_tokens: 200,
        response_format: { type: 'json_object' },
      },
    });

    const turn = await model.generate(
      'Return a JSON object with fields "name" (string) and "age" (number) for a person named John who is 30.'
    );

    const text = turn.response.text.trim();
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe('John');
    expect(parsed.age).toBe(30);
  });

  test('protocol-level structured output (schema enforcement)', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
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

    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 300 },
      tools: [getWeather],
    });

    const turn = await model.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

    const cities = turn.toolExecutions
      .map((execution) => {
        const city = execution.arguments.city;
        return typeof city === 'string' ? city.toLowerCase() : undefined;
      })
      .filter((city): city is string => city !== undefined);
    expect(cities.some(c => c.includes('tokyo'))).toBe(true);
    expect(cities.some(c => c.includes('san francisco'))).toBe(true);
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    const text = turn.response.text.toLowerCase();
    expect(text.includes('tokyo') || text.includes('75')).toBe(true);
  });

  test('streaming basic', async () => {
    // Simple streaming test without JSON constraints
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 100 },
    });

    const stream = model.stream('What is the capital of France? Answer in one word.');

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;
    expect(text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toContain('paris');
  });

});

/**
 * Error handling tests for Groq API
 */
describe.skipIf(!process.env.GROQ_API_KEY)('Groq API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 10 },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe(ErrorCode.AuthenticationFailed);
      expect(uppError.provider).toBe('groq');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('nonexistent-model-xyz'),
      params: { max_tokens: 10 },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect([ErrorCode.ModelNotFound, ErrorCode.InvalidRequest] as ErrorCode[]).toContain(uppError.code);
      expect(uppError.provider).toBe('groq');
    }
  });
});

/**
 * Temperature edge case tests
 * Note: Groq converts temperature 0 to 1e-8
 */
describe.skipIf(!process.env.GROQ_API_KEY)('Groq API Temperature Handling', () => {
  test('temperature 0 works (converted to 1e-8)', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 20, temperature: 0 },
    });

    const turn = await model.generate('What is 1+1?');
    expect(turn.response.text).toBeDefined();
  });

  test('low temperature (0.1) works', async () => {
    const model = llm<GroqLLMParams>({
      model: groq('openai/gpt-oss-120b'),
      params: { max_tokens: 50, temperature: 0.1 },
    });

    const turn = await model.generate('What is 2+2? Answer with just the number.');
    expect(turn.response.text.length).toBeGreaterThan(0);
  });
});
