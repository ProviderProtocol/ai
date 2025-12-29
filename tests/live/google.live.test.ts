import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { google } from '../../src/google/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';

/**
 * Live API tests for Google Gemini
 * Requires GOOGLE_API_KEY environment variable
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Gemini Live API', () => {
  test('simple text generation', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 100 },
    });

    const turn = await gemini.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 50 },
    });

    const stream = gemini.stream('Count from 1 to 5.');

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
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 100 },
    });

    const history: any[] = [];

    // First turn
    const turn1 = await gemini.generate(history, 'My name is Charlie.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await gemini.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('charlie');
  });

  test('with system instruction', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 50 },
      system: 'You are a friendly cat. Always respond like a cat would.',
    });

    const turn = await gemini.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes('meow') ||
      text.includes('purr') ||
      text.includes('cat') ||
      text.includes('paw') ||
      text.includes('*')
    ).toBe(true);
  });

  test('tool calling (function calling)', async () => {
    const getTime = {
      name: 'getCurrentTime',
      description: 'Get the current time',
      parameters: {
        type: 'object' as const,
        properties: {
          timezone: { type: 'string' as const, description: 'The timezone, e.g., UTC' },
        },
        required: ['timezone'],
      },
      run: async (params: { timezone: string }) => {
        return `The current time in ${params.timezone} is 3:00 PM.`;
      },
    };

    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 200 },
      tools: [getTime],
    });

    const turn = await gemini.generate('What time is it in UTC?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('3:00');
  });
});
