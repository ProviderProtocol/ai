import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import type { Server } from 'bun';
import { llm } from '../../../src/index.ts';
import { proxy } from '../../../src/proxy/index.ts';
import { ExponentialBackoff } from '../../../src/http/index.ts';

type BunServer = Server<unknown>;

const TEST_PORT = 19877;
const TEST_ENDPOINT = `http://localhost:${TEST_PORT}`;

let server: BunServer;
let requestHeaders: Record<string, string> = {};
let requestCount = 0;

const mockTurnJSON = {
  messages: [
    {
      id: 'msg_1',
      type: 'user',
      content: [{ type: 'text', text: 'Hello' }],
      timestamp: new Date().toISOString(),
    },
    {
      id: 'msg_2',
      type: 'assistant',
      content: [{ type: 'text', text: 'Hi there!' }],
      timestamp: new Date().toISOString(),
    },
  ],
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 },
  cycles: 1,
  toolExecutions: [],
};

describe('Proxy Config Integration Tests', () => {
  beforeAll(() => {
    server = Bun.serve({
      port: TEST_PORT,
      async fetch(req) {
        requestCount++;

        // Capture request headers for verification
        requestHeaders = {};
        req.headers.forEach((value, key) => {
          requestHeaders[key] = value;
        });

        const url = new URL(req.url);

        // Simulate flaky server (fails first N requests)
        if (url.pathname === '/flaky') {
          const failCount = parseInt(url.searchParams.get('fail') ?? '0', 10);
          if (requestCount <= failCount) {
            return new Response('Server error', { status: 503 });
          }
        }

        // Return auth error if missing auth header
        if (url.pathname === '/auth-required') {
          const auth = req.headers.get('authorization');
          if (!auth || !auth.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        // Normal response
        return new Response(JSON.stringify(mockTurnJSON), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
  });

  afterAll(() => {
    server?.stop();
  });

  describe('works without config', () => {
    test('proxy works with no config options', async () => {
      requestCount = 0;
      const proxyProvider = proxy({ endpoint: TEST_ENDPOINT });
      const instance = llm({ model: proxyProvider('default') });

      const turn = await instance.generate('Hello');

      expect(turn.response.text).toBe('Hi there!');
      expect(requestCount).toBe(1);
    });

    test('proxy works with empty config object', async () => {
      requestCount = 0;
      const proxyProvider = proxy({ endpoint: TEST_ENDPOINT });
      const instance = llm({
        model: proxyProvider('default'),
        config: {},
      });

      const turn = await instance.generate('Hello');

      expect(turn.response.text).toBe('Hi there!');
    });
  });

  describe('custom headers', () => {
    test('passes authorization header to server', async () => {
      requestHeaders = {};
      const proxyProvider = proxy({ endpoint: `${TEST_ENDPOINT}/auth-required` });
      const instance = llm({
        model: proxyProvider('default'),
        config: {
          headers: { 'Authorization': 'Bearer my-platform-token' },
        },
      });

      const turn = await instance.generate('Hello');

      expect(turn.response.text).toBe('Hi there!');
      expect(requestHeaders.authorization).toBe('Bearer my-platform-token');
    });

    test('passes custom headers to server', async () => {
      requestHeaders = {};
      const proxyProvider = proxy({ endpoint: TEST_ENDPOINT });
      const instance = llm({
        model: proxyProvider('default'),
        config: {
          headers: {
            'X-User-ID': 'user-123',
            'X-Request-ID': 'req-456',
          },
        },
      });

      await instance.generate('Hello');

      expect(requestHeaders['x-user-id']).toBe('user-123');
      expect(requestHeaders['x-request-id']).toBe('req-456');
    });

    test('merges provider default headers with config headers', async () => {
      requestHeaders = {};
      const proxyProvider = proxy({
        endpoint: TEST_ENDPOINT,
        headers: { 'X-Provider-Default': 'default-value' },
      });
      const instance = llm({
        model: proxyProvider('default'),
        config: {
          headers: { 'X-Config-Header': 'config-value' },
        },
      });

      await instance.generate('Hello');

      expect(requestHeaders['x-provider-default']).toBe('default-value');
      expect(requestHeaders['x-config-header']).toBe('config-value');
    });
  });

  describe('retry behavior', () => {
    test('retries on server error with retry strategy', async () => {
      requestCount = 0;
      const proxyProvider = proxy({ endpoint: `${TEST_ENDPOINT}/flaky?fail=2` });
      const instance = llm({
        model: proxyProvider('default'),
        config: {
          retryStrategy: new ExponentialBackoff({
            maxAttempts: 5,
            baseDelay: 10,
            maxDelay: 100,
          }),
        },
      });

      const turn = await instance.generate('Hello');

      // Should have retried twice (failed 2, succeeded on 3rd)
      expect(requestCount).toBe(3);
      expect(turn.response.text).toBe('Hi there!');
    });

    test('fails without retry strategy on server error', async () => {
      requestCount = 0;
      const proxyProvider = proxy({ endpoint: `${TEST_ENDPOINT}/flaky?fail=1` });
      const instance = llm({
        model: proxyProvider('default'),
        // No retry strategy
      });

      try {
        await instance.generate('Hello');
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect(requestCount).toBe(1);
        expect(error).toBeDefined();
      }
    });
  });

  describe('streaming with config', () => {
    test('passes headers in streaming requests', async () => {
      requestHeaders = {};

      // Create a streaming response
      const sseServer = Bun.serve({
        port: TEST_PORT + 1,
        async fetch(req) {
          req.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });

          const sseData = [
            'data: {"type":"text_delta","index":0,"delta":{"text":"Hi"}}\n\n',
            `data: ${JSON.stringify(mockTurnJSON)}\n\n`,
            'data: [DONE]\n\n',
          ].join('');

          return new Response(sseData, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        },
      });

      try {
        const proxyProvider = proxy({ endpoint: `http://localhost:${TEST_PORT + 1}` });
        const instance = llm({
          model: proxyProvider('default'),
          config: {
            headers: { 'Authorization': 'Bearer stream-token' },
          },
        });

        const stream = instance.stream('Hello');
        for await (const event of stream) {
          void event;
        }

        expect(requestHeaders.authorization).toBe('Bearer stream-token');
      } finally {
        sseServer.stop();
      }
    });
  });
});
