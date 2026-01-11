import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic, tools } from '../../src/anthropic/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';

/**
 * Live API tests for Anthropic Built-in Tools
 * Requires ANTHROPIC_API_KEY environment variable
 *
 * Tests the server-side built-in tools that Anthropic provides for Claude models.
 *
 * Beta header requirements:
 * - Web Search: None (GA)
 * - Computer Use: `computer-use-2025-01-24`
 * - Text Editor: None (GA)
 * - Bash: None (GA)
 * - Code Execution: `code-execution-2025-08-25`
 * - Tool Search: `advanced-tool-use-2025-11-20`
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Built-in Tools Live', () => {

  test('web search tool - basic query', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 1000,
        tools: [tools.webSearch()],
      },
    });

    const turn = await claude.generate(
      'What is the current population of Tokyo, Japan? Use web search to find the most recent data.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/tokyo|population|million/i);
  }, 60000);

  test('web search tool - with domain restrictions', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 1000,
        tools: [
          tools.webSearch({
            allowed_domains: ['wikipedia.org', 'github.com'],
            max_uses: 3,
          }),
        ],
      },
    });

    const turn = await claude.generate(
      'Find information about TypeScript from Wikipedia. Use web search.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/typescript|programming|language/i);
  }, 60000);

  test('web search tool - with user location', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 1000,
        tools: [
          tools.webSearch({
            user_location: {
              type: 'approximate',
              city: 'San Francisco',
              region: 'California',
              country: 'US',
            },
          }),
        ],
      },
    });

    const turn = await claude.generate(
      'What are some popular restaurants nearby? Use web search.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('code execution tool (requires beta header)', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      config: {
        headers: {
          'anthropic-beta': 'code-execution-2025-08-25',
        },
      },
      params: {
        max_tokens: 2000,
        tools: [tools.codeExecution()],
      },
    });

    const turn = await claude.generate(
      'Calculate the fibonacci sequence up to 20 numbers using Python. Execute the code to show the result.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    // The response should mention fibonacci and show evidence of execution
    expect(turn.response.text.toLowerCase()).toMatch(/fibonacci|sequence|python|executed|calculated/i);
  }, 90000);

});

/**
 * Streaming tests for Anthropic Built-in Tools
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Built-in Tools Streaming', () => {

  test('web search tool with streaming', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 1000,
        tools: [tools.webSearch()],
      },
    });

    const stream = claude.stream(
      'What is the latest news about artificial intelligence? Use web search.'
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

  test('code execution with streaming (requires beta header)', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      config: {
        headers: {
          'anthropic-beta': 'code-execution-2025-08-25',
        },
      },
      params: {
        max_tokens: 2000,
        tools: [tools.codeExecution()],
      },
    });

    const stream = claude.stream(
      'Write and execute Python code to generate the first 10 prime numbers.'
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
    // The response should mention primes and show evidence of execution
    expect(turn.response.text.toLowerCase()).toMatch(/prime|python|executed|calculated|numbers/i);
  }, 90000);

});

/**
 * Multiple built-in tools test
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Multiple Built-in Tools', () => {

  test('web search and code execution combined (requires beta header)', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      config: {
        headers: {
          'anthropic-beta': 'code-execution-2025-08-25',
        },
      },
      params: {
        max_tokens: 2000,
        tools: [
          tools.webSearch({ max_uses: 2 }),
          tools.codeExecution(),
        ],
      },
    });

    const turn = await claude.generate(
      'Search for the current USD to EUR exchange rate, then write Python code to convert 100 USD to EUR. Execute the code.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/usd|eur|euro|dollar|exchange/i);
  }, 120000);

});
