import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import type { Server } from 'bun';
import { llm } from '../../src/index.ts';

type BunServer = Server<unknown>;
import { anthropic } from '../../src/anthropic/index.ts';
import { openai } from '../../src/openai/index.ts';
import {
  proxy,
  parseBody,
  toJSON,
  toSSE,
  toError,
  bindTools,
  serializeTurn,
} from '../../src/proxy/index.ts';

const TEST_PORT = 19876;
const TEST_ENDPOINT = `http://localhost:${TEST_PORT}/api/ai`;

let server: BunServer;

/**
 * Live API tests for the Proxy layer.
 * Tests the full client-server flow using real provider APIs.
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Proxy Live API', () => {
  beforeAll(() => {
    // Start a test proxy server
    server = Bun.serve({
      port: TEST_PORT,
      async fetch(req) {
        const url = new URL(req.url);

        if (req.method === 'POST' && url.pathname === '/api/ai') {
          try {
            const body = await req.json();
            const { messages, system, params, tools: wireTools, structure } = parseBody(body);

            // Get model from query param
            const modelKey = url.searchParams.get('model') ?? 'claude';
            const requestedTools = url.searchParams.get('tools')?.split(',') ?? [];

            // Select provider based on model key
            const model = modelKey === 'gpt4o'
              ? openai('gpt-4o')
              : anthropic('claude-3-5-haiku-latest');

            // Default params per provider
            const defaultParams = modelKey === 'gpt4o'
              ? {}
              : { max_tokens: 1024 };

            // Server-side tool definitions
            const serverTools = {
              get_time: {
                name: 'get_time',
                description: 'Get the current time',
                parameters: { type: 'object' as const, properties: {} },
                run: () => ({ time: new Date().toISOString() }),
              },
              add_numbers: {
                name: 'add_numbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object' as const,
                  properties: {
                    a: { type: 'number' as const, description: 'First number' },
                    b: { type: 'number' as const, description: 'Second number' },
                  },
                  required: ['a', 'b'],
                },
                run: (p: { a: number; b: number }) => ({ result: p.a + p.b }),
              },
            };

            // Get tools based on query param or wire tools from request
            let tools;
            if (requestedTools.length > 0) {
              tools = requestedTools
                .map((name) => serverTools[name as keyof typeof serverTools])
                .filter(Boolean);
            } else if (wireTools) {
              const toolImpls: Record<string, (params: unknown) => unknown> = {
                get_time: serverTools.get_time.run,
                add_numbers: (p: unknown) => serverTools.add_numbers.run(p as { a: number; b: number }),
              };
              tools = bindTools(wireTools, toolImpls);
            }

            const instance = llm({
              model,
              system,
              params: { ...defaultParams, ...params },
              tools: tools && tools.length > 0 ? tools : undefined,
              structure,
            });

            // Check streaming
            const acceptHeader = req.headers.get('accept') ?? '';
            if (acceptHeader.includes('text/event-stream')) {
              return toSSE(instance.stream(messages));
            }

            const turn = await instance.generate(messages);
            return toJSON(turn);
          } catch (error) {
            console.error('Test server error:', error);
            return toError(
              error instanceof Error ? error.message : String(error),
              500
            );
          }
        }

        return new Response('Not found', { status: 404 });
      },
    });
  });

  afterAll(() => {
    server?.stop();
  });

  test('non-streaming generation via proxy', async () => {
    const backend = proxy({ endpoint: TEST_ENDPOINT });
    const instance = llm({
      model: backend('default'),
      system: 'You are a helpful assistant. Be very brief.',
    });

    const turn = await instance.generate('Say "Hello Proxy" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming generation via proxy', async () => {
    const backend = proxy({ endpoint: TEST_ENDPOINT });
    const instance = llm({
      model: backend('default'),
      system: 'You are a helpful assistant.',
    });

    const stream = instance.stream('Count from 1 to 3, just the numbers.');

    let text = '';
    let eventCount = 0;

    for await (const event of stream) {
      eventCount++;
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(eventCount).toBeGreaterThan(0);
    expect(text).toContain('1');
    expect(turn.response.text).toContain('1');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('multi-turn conversation via proxy', async () => {
    const backend = proxy({ endpoint: TEST_ENDPOINT });
    const instance = llm({
      model: backend('default'),
      system: 'You are a helpful assistant. Be very brief.',
    });

    // First turn
    const turn1 = await instance.generate('My favorite color is blue.');

    // Build history and continue
    const history = turn1.messages;
    const turn2 = await instance.generate(history, 'What is my favorite color?');

    expect(turn2.response.text.toLowerCase()).toContain('blue');
  });

  test('server-side tool execution via proxy', async () => {
    // Tools are defined server-side only - client just sends requests
    // The test server has 'add_numbers' tool available
    const backend = proxy({ endpoint: `${TEST_ENDPOINT}?tools=add_numbers` });

    const instance = llm({
      model: backend('default'),
      system: 'Use the add_numbers tool when asked to add numbers.',
    });

    const turn = await instance.generate('What is 7 + 15? You must use the add_numbers tool.');

    // The response should contain the answer (server executed the tool)
    expect(turn.response.text).toContain('22');
  });

  test('streaming with server-side tool execution', async () => {
    const backend = proxy({ endpoint: `${TEST_ENDPOINT}?tools=add_numbers` });

    const instance = llm({
      model: backend('default'),
      system: 'Use the add_numbers tool when asked to add numbers.',
    });

    const stream = instance.stream('What is 3 + 4? Use the add_numbers tool.');

    const eventTypes: string[] = [];
    for await (const event of stream) {
      eventTypes.push(event.type);
    }

    const turn = await stream.turn;

    // Should have various event types including tool-related ones
    expect(eventTypes.length).toBeGreaterThan(0);
    // The final response should have the answer
    expect(turn.response.text).toContain('7');
  });

  test('model switching via query param', async () => {
    // Test with Claude (default)
    const claudeBackend = proxy({ endpoint: `${TEST_ENDPOINT}?model=claude` });
    const claudeInstance = llm({
      model: claudeBackend('default'),
    });

    const claudeTurn = await claudeInstance.generate('Say "I am Claude" exactly.');
    expect(claudeTurn.response.text.toLowerCase()).toContain('claude');
  });

  test('error propagation from server', async () => {
    // Point to non-existent endpoint
    const backend = proxy({ endpoint: 'http://localhost:1/nonexistent' });
    const instance = llm({ model: backend('default') });

    try {
      await instance.generate('Hello');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  test('structured output via proxy', async () => {
    const backend = proxy({ endpoint: TEST_ENDPOINT });
    const instance = llm({
      model: backend('default'),
      structure: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      },
    });

    const turn = await instance.generate('Create a person named Alice who is 25 years old.');

    expect(turn.data).toBeDefined();
    const data = turn.data as { name: string; age: number };
    expect(data.name.toLowerCase()).toContain('alice');
    expect(data.age).toBe(25);
  });
});

/**
 * Tests with OpenAI model via proxy.
 * Requires OPENAI_API_KEY environment variable.
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('Proxy Live API - OpenAI', () => {
  beforeAll(() => {
    // Reuse server if already running, or start new one
    if (!server) {
      server = Bun.serve({
        port: TEST_PORT,
        async fetch(req) {
          const url = new URL(req.url);
          if (req.method === 'POST' && url.pathname === '/api/ai') {
            try {
              const body = await req.json();
              const { messages, system, params } = parseBody(body);

              const model = openai('gpt-4o-mini');
              const instance = llm({ model, system, params });

              const acceptHeader = req.headers.get('accept') ?? '';
              if (acceptHeader.includes('text/event-stream')) {
                return toSSE(instance.stream(messages));
              }

              const turn = await instance.generate(messages);
              return toJSON(turn);
            } catch (error) {
              return toError(String(error), 500);
            }
          }
          return new Response('Not found', { status: 404 });
        },
      });
    }
  });

  afterAll(() => {
    server?.stop();
  });

  test('OpenAI generation via proxy', async () => {
    const backend = proxy({ endpoint: `${TEST_ENDPOINT}?model=gpt4o` });
    const instance = llm({
      model: backend('default'),
      system: 'Be very brief.',
    });

    const turn = await instance.generate('Say "Hello from GPT" exactly.');

    expect(turn.response.text.toLowerCase()).toContain('gpt');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('OpenAI streaming via proxy', async () => {
    const backend = proxy({ endpoint: `${TEST_ENDPOINT}?model=gpt4o` });
    const instance = llm({
      model: backend('default'),
    });

    const stream = instance.stream('Count 1 to 3.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text).toContain('1');
    expect(turn.response.text).toContain('1');
  });
});
