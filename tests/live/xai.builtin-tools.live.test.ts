import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { xai, tools } from '../../src/xai/index.ts';
import type { XAIResponsesParams } from '../../src/xai/index.ts';

/**
 * Live API tests for xAI Built-in Tools (Responses API)
 * Requires XAI_API_KEY environment variable
 *
 * Tests the server-side built-in tools that xAI provides for Grok models.
 * Note: Built-in tools are only available via the Responses API.
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Built-in Tools Live', () => {

  test('web search tool - basic query', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 1000,
        builtInTools: [tools.webSearch()],
      },
    });

    const turn = await grok.generate(
      'What is the current weather in San Francisco? Use web search to find out.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/san francisco|weather|temperature|degrees/i);
  }, 60000);

  test('web search tool - with domain restrictions', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 1000,
        builtInTools: [
          tools.webSearch({
            allowed_domains: ['wikipedia.org', 'github.com'],
          }),
        ],
      },
    });

    const turn = await grok.generate(
      'Find information about the Rust programming language from Wikipedia. Use web search.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/rust|programming|language|memory|safety/i);
  }, 60000);

  test('x search tool - basic query', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 1000,
        builtInTools: [tools.xSearch()],
      },
    });

    const turn = await grok.generate(
      'Search X for recent posts about Elon Musk. Summarize what you find.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/elon|musk|x|tesla|spacex|post/i);
  }, 90000);

  test('x search tool - with date filter', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 1000,
        builtInTools: [
          tools.xSearch({
            from_date: '2025-01-01',
          }),
        ],
      },
    });

    const turn = await grok.generate(
      'Find posts on X about SpaceX from 2025. Use X search.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/spacex|rocket|launch|elon|space/i);
  }, 60000);

  test('code execution tool - basic calculation', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 2000,
        builtInTools: [tools.codeExecution()],
      },
    });

    const turn = await grok.generate(
      'Calculate the factorial of 10 using Python. Execute the code.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toMatch(/3628800/);
  }, 90000);

  test('code execution tool - with packages', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 2000,
        builtInTools: [
          tools.codeExecution({
            pip_packages: ['numpy'],
          }),
        ],
      },
    });

    const turn = await grok.generate(
      'Use numpy to calculate the mean and standard deviation of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]. Execute the code.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toMatch(/5\.5|mean/i);
  }, 90000);

});

/**
 * Streaming tests for xAI Built-in Tools
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Built-in Tools Streaming', () => {

  test('web search tool with streaming', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 1000,
        builtInTools: [tools.webSearch()],
      },
    });

    const stream = grok.stream(
      'What are the latest news about technology startups? Use web search.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'text_delta' && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(events.length).toBeGreaterThan(0);
    expect(events.filter(e => e === 'text_delta').length).toBeGreaterThan(0);
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('x search with streaming', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 1000,
        builtInTools: [tools.xSearch()],
      },
    });

    const stream = grok.stream(
      'What is trending on X right now? Use X search.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'text_delta' && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(events.length).toBeGreaterThan(0);
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('code execution with streaming', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 2000,
        builtInTools: [tools.codeExecution()],
      },
    });

    const stream = grok.stream(
      'Write Python code to generate the first 15 Fibonacci numbers and execute it.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'text_delta' && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(events.length).toBeGreaterThan(0);
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text).toMatch(/1.*1.*2.*3.*5.*8.*13.*21.*34.*55/);
  }, 90000);

});

/**
 * Multiple built-in tools test
 */
describe.skipIf(!process.env.XAI_API_KEY)('xAI Multiple Built-in Tools', () => {

  test('web search and code execution combined', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 2000,
        builtInTools: [
          tools.webSearch(),
          tools.codeExecution(),
        ],
      },
    });

    const turn = await grok.generate(
      'Search for the current price of gold per ounce in USD, then use Python to calculate the value of 5 ounces.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/gold|price|ounce|usd|\$/i);
  }, 120000);

  test('web search and x search combined', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 2000,
        builtInTools: [
          tools.webSearch(),
          tools.xSearch(),
        ],
      },
    });

    const turn = await grok.generate(
      'Find information about the latest AI developments from both web sources and X posts. Compare what you find.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/ai|artificial|intelligence/i);
  }, 120000);

  test('all three tools combined', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-4-1-fast', { api: 'responses' }),
      params: {
        max_output_tokens: 3000,
        builtInTools: [
          tools.webSearch(),
          tools.xSearch(),
          tools.codeExecution(),
        ],
      },
    });

    const turn = await grok.generate(
      'Search the web for Tesla stock price, check X for recent posts about TSLA, then use Python to calculate a simple moving average if the model were at $200, $210, $205, $215, $220.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/tesla|tsla|stock|price|average/i);
  }, 180000);

});
