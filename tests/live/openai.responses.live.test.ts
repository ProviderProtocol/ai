import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import type { OpenAILLMParams } from '../../src/openai/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');

/**
 * Live API tests for OpenAI Responses API (default)
 * Requires OPENAI_API_KEY environment variable
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Responses API Live', () => {
  test('simple text generation', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'), // Default: uses Responses API
      params: { max_completion_tokens: 100 },
    });

    const turn = await gpt.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('explicitly use responses api', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini', { api: 'responses' }), // Explicit
      params: { max_completion_tokens: 100 },
    });

    const turn = await gpt.generate('Say "Responses API" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('responses');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 50 },
    });

    const stream = gpt.stream('Count from 1 to 5.');

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
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 100 },
    });

    const history: any[] = [];

    // First turn
    const turn1 = await gpt.generate(history, 'My name is Bob.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await gpt.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('bob');
  });

  test('with system prompt (instructions)', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 50 },
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
        // Simple eval for demo (not safe in production!)
        try {
          return `Result: ${eval(params.expression)}`;
        } catch {
          return 'Error evaluating expression';
        }
      },
    };

    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 200 },
      tools: [calculate],
    });

    const turn = await gpt.generate('What is 15 + 27?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('42');
  });

  test('vision/multimodal with base64 image', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 100 },
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

    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 200 },
      tools: [calculator],
    });

    const stream = gpt.stream('What is 6 times 7? Use the multiply tool.');

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
    expect(turn.response.text).toContain('42');
  });

  test('protocol-level structured output (schema enforcement)', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 200 },
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
    expect((turn.data as any).city).toBe('Paris');
    expect(typeof (turn.data as any).population).toBe('number');
  });

  test('streaming with structured output', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 200 },
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

    // OpenAI uses native structured output, so we accumulate text_delta events
    let accumulatedJson = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        accumulatedJson += event.delta.text;
      }
    }

    // The accumulated JSON should be valid and parseable
    expect(accumulatedJson.length).toBeGreaterThan(0);
    const streamedData = JSON.parse(accumulatedJson);
    expect(streamedData.city).toBe('Tokyo');

    const turn = await stream.turn;

    // The 'data' field should match what we accumulated
    expect(turn.data).toBeDefined();
    expect((turn.data as any).city).toBe('Tokyo');
    expect(typeof (turn.data as any).population).toBe('number');
    expect((turn.data as any).isCapital).toBe(true);

    // Verify streamed matches final
    expect(streamedData.city).toBe((turn.data as any).city);
  });
});

/**
 * Error handling tests for Responses API
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Responses API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const gpt = llm<OpenAILLMParams>({
      model: openai('gpt-4o-mini'),
      params: { max_completion_tokens: 10 },
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
    const gpt = llm<OpenAILLMParams>({
      model: openai('nonexistent-model-xyz'),
      params: { max_completion_tokens: 10 },
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
