import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { moonshot, tools, type MoonshotLLMParams } from '../../src/moonshot/index.ts';
import { StreamEventType } from '../../src/types/stream.ts';

const hasMoonshotKey = !!process.env.MOONSHOT_API_KEY || !!process.env.KIMI_API_KEY;

/**
 * Live API tests for Moonshot Builtin Tools
 * Requires MOONSHOT_API_KEY or KIMI_API_KEY environment variable
 *
 * Note: These tools are defined with schemas recognized by Moonshot's API.
 * The model will generate tool calls which can be executed server-side
 * in Moonshot's web interface, or handled by the client with the tool loop.
 *
 * These tests verify that the model correctly identifies when to use
 * each builtin tool and generates appropriate tool calls.
 */
describe.skipIf(!hasMoonshotKey)('Moonshot Builtin Tools', () => {
  test('web search tool generates correct tool call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.webSearch()],
      },
    });

    const turn = await model.generate(
      'What is the current weather in Tokyo? Use web search to find out.'
    );

    // Model should call web_search tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('web_search');
    expect(toolCall?.arguments).toHaveProperty('query');
  }, 60000);

  test('code runner tool generates Python code call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.codeRunner()],
      },
    });

    const turn = await model.generate(
      'Calculate the factorial of 10 using Python code.'
    );

    // Model should call code_runner tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('code_runner');
    expect(toolCall?.arguments).toHaveProperty('code');
    // Code should contain factorial logic
    const code = toolCall?.arguments.code as string;
    expect(code).toMatch(/factorial|10|math/i);
  }, 60000);

  test('quickjs tool generates JavaScript code call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.quickjs()],
      },
    });

    const turn = await model.generate(
      'Use JavaScript to calculate the sum of numbers from 1 to 100.'
    );

    // Model should call quickjs tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('quickjs');
    expect(toolCall?.arguments).toHaveProperty('code');
  }, 60000);

  test('convert tool generates unit conversion call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.convert()],
      },
    });

    const turn = await model.generate('Convert 100 kilometers to miles.');

    // Model should call convert tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('convert');
    expect(toolCall?.arguments).toHaveProperty('value');
    expect(toolCall?.arguments).toHaveProperty('from_unit');
    expect(toolCall?.arguments).toHaveProperty('to_unit');
  }, 60000);

  test('date tool generates date operation call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.date()],
      },
    });

    const turn = await model.generate(
      'What day of the week was January 1, 2000?'
    );

    // Model should call date tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('date');
    expect(toolCall?.arguments).toHaveProperty('operation');
  }, 60000);

  test('base64 tool generates encoding call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.base64()],
      },
    });

    const turn = await model.generate('Encode the text "Hello World" in base64.');

    // Model should call base64_encode tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('base64_encode');
    expect(toolCall?.arguments).toHaveProperty('data');
  }, 60000);

  test('base64 decode tool generates decoding call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.base64Decode()],
      },
    });

    const turn = await model.generate('Decode this base64: SGVsbG8gV29ybGQ=');

    // Model should call base64_decode tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('base64_decode');
    expect(toolCall?.arguments).toHaveProperty('data');
  }, 60000);

  test('fetch tool generates URL fetch call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.fetch()],
      },
    });

    const turn = await model.generate(
      'Fetch the content from https://example.com and summarize it.'
    );

    // Model should call fetch tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('fetch');
    expect(toolCall?.arguments).toHaveProperty('url');
  }, 60000);

  test('memory tool generates storage call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.memory()],
      },
    });

    const turn = await model.generate(
      'Remember that my favorite color is blue. Store this in memory.'
    );

    // Model should call memory tool with store action
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('memory');
    expect(toolCall?.arguments).toHaveProperty('action');
  }, 60000);

  test('rethink tool generates reflection call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
        tools: [tools.rethink()],
      },
    });

    const turn = await model.generate(
      'Think carefully about how to solve: What is 17 * 23? Use the rethink tool to organize your thoughts.'
    );

    // Model should call rethink tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('rethink');
    expect(toolCall?.arguments).toHaveProperty('thought');
  }, 60000);

  test('multiple tools - model chooses appropriate tool', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.codeRunner(), tools.convert()],
      },
    });

    const turn = await model.generate('Calculate 2^10 using code.');

    // Model should choose code_runner for calculation
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('code_runner');
  }, 60000);

  test('mew tool generates cat meowing call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 200,
        thinking: { type: 'disabled' },
        tools: [tools.mew()],
      },
    });

    const turn = await model.generate('Give me a cat blessing!');

    // Model should call mew_generator tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('mew_generator');
  }, 60000);

  test('random choice tool generates selection call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 200,
        thinking: { type: 'disabled' },
        tools: [tools.randomChoice()],
      },
    });

    const turn = await model.generate(
      'Randomly pick one option from: apple, banana, cherry, date'
    );

    // Model should call random_choice tool
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    const toolCall = turn.response.toolCalls?.[0];
    expect(toolCall?.toolName).toBe('random_choice');
    expect(toolCall?.arguments).toHaveProperty('candidates');
  }, 60000);
});

/**
 * Streaming tests for Moonshot Builtin Tools
 */
describe.skipIf(!hasMoonshotKey)('Moonshot Builtin Tools Streaming', () => {
  test('web search with streaming generates tool call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.webSearch()],
      },
    });

    const stream = model.stream(
      'Search the web for the latest news about artificial intelligence.'
    );

    let toolCallEvents = 0;
    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        toolCallEvents++;
      }
    }

    const turn = await stream.turn;

    // Should have received tool call deltas
    expect(toolCallEvents).toBeGreaterThan(0);
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    expect(turn.response.toolCalls?.[0]?.toolName).toBe('web_search');
  }, 60000);

  test('code runner with streaming generates code call', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.codeRunner()],
      },
    });

    const stream = model.stream(
      'Write and run Python code to generate the first 10 Fibonacci numbers.'
    );

    let toolCallEvents = 0;
    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        toolCallEvents++;
      }
    }

    const turn = await stream.turn;

    // Should have received tool call deltas
    expect(toolCallEvents).toBeGreaterThan(0);
    expect(turn.response.toolCalls?.length).toBeGreaterThan(0);
    expect(turn.response.toolCalls?.[0]?.toolName).toBe('code_runner');
    // Code should contain fibonacci logic
    const code = turn.response.toolCalls?.[0]?.arguments.code as string;
    expect(code).toMatch(/fib|fibonacci/i);
  }, 60000);
});

/**
 * Tests for combining builtin tools with custom function tools
 */
describe.skipIf(!hasMoonshotKey)('Moonshot Mixed Tools', () => {
  test('builtin tool with custom function tool', async () => {
    const getGreeting = {
      name: 'getGreeting',
      description: 'Get a greeting message for a given name',
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'The name to greet' },
        },
        required: ['name'],
      },
      run: async (params: { name: string }) => `Hello, ${params.name}!`,
    };

    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
        tools: [tools.date()], // Builtin tool via params
      },
      tools: [getGreeting], // Custom tool via UPP
    });

    const turn = await model.generate(
      'First greet Alice using the greeting tool, then tell me what day of the week today is.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toContain('alice');
  }, 60000);
});
