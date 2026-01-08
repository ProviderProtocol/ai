import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { cache } from '../../../../src/providers/google/cache.ts';

const MOCK_API_KEY = 'test-api-key';
const MOCK_CACHE_NAME = 'cachedContents/abc123xyz';

interface MockedFetch {
  (...args: Parameters<typeof fetch>): ReturnType<typeof fetch>;
  mock: { calls: Array<[string, RequestInit?]> };
}

describe('Google Cache Utilities', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: MockedFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function setMockFetch(response: Response): void {
    const fn = mock(() => Promise.resolve(response));
    mockFetch = fn as unknown as MockedFetch;
    global.fetch = fn as unknown as typeof fetch;
  }

  function getCallArgs(index = 0): [string, RequestInit] {
    return mockFetch.mock.calls[index] as [string, RequestInit];
  }

  describe('cache.create', () => {
    test('creates cache with minimal options', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
          }),
          { status: 200 }
        )
      );

      const result = await cache.create({
        apiKey: MOCK_API_KEY,
        model: 'gemini-3-flash-preview',
      });

      expect(result.name).toBe(MOCK_CACHE_NAME);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = getCallArgs();
      expect(url).toContain('cachedContents');
      expect(url).toContain(`key=${MOCK_API_KEY}`);
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('models/gemini-3-flash-preview');
    });

    test('creates cache with full options', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            displayName: 'Test Cache',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
            usageMetadata: { totalTokenCount: 5000 },
          }),
          { status: 200 }
        )
      );

      const result = await cache.create({
        apiKey: MOCK_API_KEY,
        model: 'gemini-3-flash-preview',
        displayName: 'Test Cache',
        systemInstruction: 'You are a helpful assistant.',
        contents: [{ role: 'user', parts: [{ text: 'Hello world' }] }],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'test_func',
                description: 'A test function',
                parameters: { type: 'object', properties: {} },
              },
            ],
          },
        ],
        ttl: '3600s',
      });

      expect(result.name).toBe(MOCK_CACHE_NAME);
      expect(result.displayName).toBe('Test Cache');

      const body = JSON.parse(getCallArgs()[1].body as string);
      expect(body.displayName).toBe('Test Cache');
      expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
      expect(body.contents).toHaveLength(1);
      expect(body.tools).toHaveLength(1);
      expect(body.ttl).toBe('3600s');
    });

    test('prefers ttl over expireTime when both provided', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
          }),
          { status: 200 }
        )
      );

      await cache.create({
        apiKey: MOCK_API_KEY,
        model: 'gemini-3-flash-preview',
        ttl: '3600s',
        expireTime: '2024-12-31T23:59:59Z',
      });

      const body = JSON.parse(getCallArgs()[1].body as string);
      expect(body.ttl).toBe('3600s');
      expect(body.expireTime).toBeUndefined();
    });

    test('uses expireTime when ttl not provided', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-12-31T23:59:59Z',
          }),
          { status: 200 }
        )
      );

      await cache.create({
        apiKey: MOCK_API_KEY,
        model: 'gemini-3-flash-preview',
        expireTime: '2024-12-31T23:59:59Z',
      });

      const body = JSON.parse(getCallArgs()[1].body as string);
      expect(body.expireTime).toBe('2024-12-31T23:59:59Z');
      expect(body.ttl).toBeUndefined();
    });

    test('throws on API error', async () => {
      setMockFetch(new Response('Bad Request', { status: 400 }));

      await expect(
        cache.create({
          apiKey: MOCK_API_KEY,
          model: 'gemini-3-flash-preview',
        })
      ).rejects.toThrow('Failed to create cache: 400');
    });

    test('normalizes model name without prefix', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
          }),
          { status: 200 }
        )
      );

      await cache.create({
        apiKey: MOCK_API_KEY,
        model: 'gemini-3-flash-preview',
      });

      const body = JSON.parse(getCallArgs()[1].body as string);
      expect(body.model).toBe('models/gemini-3-flash-preview');
    });

    test('preserves model name with prefix', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
          }),
          { status: 200 }
        )
      );

      await cache.create({
        apiKey: MOCK_API_KEY,
        model: 'models/gemini-3-flash-preview',
      });

      const body = JSON.parse(getCallArgs()[1].body as string);
      expect(body.model).toBe('models/gemini-3-flash-preview');
    });
  });

  describe('cache.get', () => {
    test('retrieves cache by full name', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
          }),
          { status: 200 }
        )
      );

      const result = await cache.get(MOCK_CACHE_NAME, MOCK_API_KEY);

      expect(result.name).toBe(MOCK_CACHE_NAME);
      const [url] = getCallArgs();
      expect(url).toContain('cachedContents/abc123xyz');
    });

    test('retrieves cache by short ID', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T01:00:00Z',
          }),
          { status: 200 }
        )
      );

      const result = await cache.get('abc123xyz', MOCK_API_KEY);

      expect(result.name).toBe(MOCK_CACHE_NAME);
      const [url] = getCallArgs();
      expect(url).toContain('cachedContents/abc123xyz');
    });

    test('throws on not found', async () => {
      setMockFetch(new Response('Not Found', { status: 404 }));

      await expect(cache.get('nonexistent', MOCK_API_KEY)).rejects.toThrow(
        'Failed to get cache: 404'
      );
    });
  });

  describe('cache.list', () => {
    test('lists caches without pagination', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            cachedContents: [
              {
                name: 'cachedContents/cache1',
                model: 'models/gemini-3-flash-preview',
                createTime: '2024-01-01T00:00:00Z',
                expireTime: '2024-01-01T01:00:00Z',
              },
              {
                name: 'cachedContents/cache2',
                model: 'models/gemini-1.5-pro-001',
                createTime: '2024-01-01T00:00:00Z',
                expireTime: '2024-01-01T02:00:00Z',
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await cache.list({ apiKey: MOCK_API_KEY });

      expect(result.cachedContents).toHaveLength(2);
    });

    test('lists caches with pagination', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            cachedContents: [
              {
                name: 'cachedContents/cache1',
                model: 'models/gemini-3-flash-preview',
                createTime: '2024-01-01T00:00:00Z',
                expireTime: '2024-01-01T01:00:00Z',
              },
            ],
            nextPageToken: 'token123',
          }),
          { status: 200 }
        )
      );

      const result = await cache.list({
        apiKey: MOCK_API_KEY,
        pageSize: 1,
        pageToken: 'prevToken',
      });

      expect(result.cachedContents).toHaveLength(1);
      expect(result.nextPageToken).toBe('token123');

      const [url] = getCallArgs();
      expect(url).toContain('pageSize=1');
      expect(url).toContain('pageToken=prevToken');
    });

    test('throws on API error', async () => {
      setMockFetch(new Response('Unauthorized', { status: 401 }));

      await expect(cache.list({ apiKey: 'invalid' })).rejects.toThrow(
        'Failed to list caches: 401'
      );
    });
  });

  describe('cache.update', () => {
    test('updates cache ttl', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-01-01T02:00:00Z',
          }),
          { status: 200 }
        )
      );

      const result = await cache.update(MOCK_CACHE_NAME, { ttl: '7200s' }, MOCK_API_KEY);

      expect(result.name).toBe(MOCK_CACHE_NAME);
      const [url, options] = getCallArgs();
      expect(url).toContain('cachedContents/abc123xyz');
      expect(options.method).toBe('PATCH');

      const body = JSON.parse(options.body as string);
      expect(body.ttl).toBe('7200s');
    });

    test('updates cache expireTime', async () => {
      setMockFetch(
        new Response(
          JSON.stringify({
            name: MOCK_CACHE_NAME,
            model: 'models/gemini-3-flash-preview',
            createTime: '2024-01-01T00:00:00Z',
            expireTime: '2024-12-31T23:59:59Z',
          }),
          { status: 200 }
        )
      );

      const result = await cache.update(
        'abc123xyz',
        { expireTime: '2024-12-31T23:59:59Z' },
        MOCK_API_KEY
      );

      expect(result.name).toBe(MOCK_CACHE_NAME);
      const body = JSON.parse(getCallArgs()[1].body as string);
      expect(body.expireTime).toBe('2024-12-31T23:59:59Z');
    });

    test('throws on not found', async () => {
      setMockFetch(new Response('Not Found', { status: 404 }));

      await expect(
        cache.update('nonexistent', { ttl: '3600s' }, MOCK_API_KEY)
      ).rejects.toThrow('Failed to update cache: 404');
    });
  });

  describe('cache.delete', () => {
    test('deletes cache by full name', async () => {
      setMockFetch(new Response(null, { status: 200 }));

      await cache.delete(MOCK_CACHE_NAME, MOCK_API_KEY);

      const [url, options] = getCallArgs();
      expect(url).toContain('cachedContents/abc123xyz');
      expect(options.method).toBe('DELETE');
    });

    test('deletes cache by short ID', async () => {
      setMockFetch(new Response(null, { status: 200 }));

      await cache.delete('abc123xyz', MOCK_API_KEY);

      const [url] = getCallArgs();
      expect(url).toContain('cachedContents/abc123xyz');
    });

    test('throws on not found', async () => {
      setMockFetch(new Response('Not Found', { status: 404 }));

      await expect(cache.delete('nonexistent', MOCK_API_KEY)).rejects.toThrow(
        'Failed to delete cache: 404'
      );
    });
  });
});
