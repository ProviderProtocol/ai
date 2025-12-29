import { test, expect, describe, beforeAll } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';

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
});
