import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { google, tools } from '../../src/google/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import { StreamEventType } from '../../src/types/stream.ts';

/**
 * Live API tests for Google Gemini Built-in Tools
 * Requires GOOGLE_API_KEY environment variable
 *
 * Tests the server-side built-in tools that Google provides for Gemini models.
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Built-in Tools Live', () => {

  test('google search tool - basic query', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 1000,
        tools: [tools.googleSearch()],
      },
    });

    const turn = await gemini.generate(
      'What is the current population of New York City? Use Google Search to find recent data.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/new york|population|million/i);
  }, 60000);

  test('code execution tool - basic calculation', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 2000,
        tools: [tools.codeExecution()],
      },
    });

    const turn = await gemini.generate(
      'Calculate the sum of all prime numbers less than 100. Use code execution.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toMatch(/1060/);
  }, 90000);

  test('url context tool - fetch and analyze URL', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 1500,
        tools: [tools.urlContext()],
      },
    });

    const turn = await gemini.generate(
      'Fetch and summarize the main content from https://www.anthropic.com. What does this company do?'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/ai|claude|anthropic|safety/i);
  }, 60000);

});

/**
 * Streaming tests for Google Built-in Tools
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Built-in Tools Streaming', () => {

  test('google search tool with streaming', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 1000,
        tools: [tools.googleSearch()],
      },
    });

    const stream = gemini.stream(
      'What are the latest developments in quantum computing? Use Google Search.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(events.length).toBeGreaterThan(0);
    expect(events.filter(e => e === StreamEventType.TextDelta).length).toBeGreaterThan(0);
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('code execution with streaming', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 2000,
        tools: [tools.codeExecution()],
      },
    });

    const stream = gemini.stream(
      'Write Python code to generate a list of perfect squares up to 100 and execute it.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(events.length).toBeGreaterThan(0);
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text).toMatch(/1.*4.*9.*16.*25.*36.*49.*64.*81.*100/);
  }, 90000);

});

/**
 * Multiple built-in tools test
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Multiple Built-in Tools', () => {

  test('google search and code execution combined', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 2000,
        tools: [
          tools.googleSearch(),
          tools.codeExecution(),
        ],
      },
    });

    const turn = await gemini.generate(
      'Find the current Bitcoin price in USD using Google Search, then use code to calculate what 0.5 BTC would be worth.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/bitcoin|btc|usd|\$/i);
  }, 120000);

  test('google search and code execution for math', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 2000,
        tools: [
          tools.googleSearch(),
          tools.codeExecution(),
        ],
      },
    });

    const turn = await gemini.generate(
      'What is the formula for the area of a circle? Then use code execution to calculate the area of a circle with radius 5.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toMatch(/78|79|area|circle/i);
  }, 120000);

});

/**
 * Google Maps tool test
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Maps Tool', () => {

  test('google maps tool - location query', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 1500,
        tools: [tools.googleMaps()],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 40.758896, longitude: -73.985130 },
          },
        },
      },
    });

    const turn = await gemini.generate(
      'What are some notable landmarks near Times Square in New York? Use Google Maps.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toMatch(/times square|broadway|new york|manhattan/i);
  }, 60000);

});
