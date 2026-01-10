/**
 * Unit tests for Vertex AI Gemini caching functionality.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { cache } from '../../../../src/providers/vertex/cache.ts';

describe('Vertex Cache', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'test-cache' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('create()', () => {
    test('builds correct URL with regional location', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/cachedContents'
      );
    });

    test('builds correct URL with global location', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'global',
        model: 'gemini-2.5-flash',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toBe(
        'https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/cachedContents'
      );
    });

    test('includes Bearer token in Authorization header', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      expect(options.headers).toHaveProperty('Authorization', 'Bearer test-token');
    });

    test('builds full model resource name', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe(
        'projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash'
      );
    });

    test('passes through full model resource name unchanged', async () => {
      const fullModelName = 'projects/other/locations/eu/publishers/google/models/gemini-3';
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: fullModelName,
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe(fullModelName);
    });

    test('includes all optional fields when provided', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        displayName: 'Test Cache',
        systemInstruction: 'You are a helpful assistant.',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        tools: [{ functionDeclarations: [{ name: 'test', description: 'Test', parameters: { type: 'object', properties: {} } }] }],
        ttl: '3600s',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body.displayName).toBe('Test Cache');
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a helpful assistant.' }] });
      expect(body.contents).toHaveLength(1);
      expect(body.tools).toHaveLength(1);
      expect(body.ttl).toBe('3600s');
    });

    test('prefers ttl over expireTime', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        ttl: '3600s',
        expireTime: '2025-01-01T00:00:00Z',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body.ttl).toBe('3600s');
      expect(body.expireTime).toBeUndefined();
    });

    test('uses expireTime when ttl not provided', async () => {
      await cache.create({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        model: 'gemini-2.5-flash',
        expireTime: '2025-01-01T00:00:00Z',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body.expireTime).toBe('2025-01-01T00:00:00Z');
      expect(body.ttl).toBeUndefined();
    });
  });

  describe('get()', () => {
    test('builds correct URL with cache ID', async () => {
      await cache.get('abc123', {
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/cachedContents/abc123'
      );
    });

    test('extracts cache ID from full resource name', async () => {
      await cache.get('projects/my-project/locations/us-central1/cachedContents/xyz789', {
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('/cachedContents/xyz789');
    });

    test('uses GET method', async () => {
      await cache.get('abc123', {
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      expect(options.method).toBe('GET');
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ cachedContents: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;
    });

    test('builds correct base URL', async () => {
      await cache.list({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/cachedContents'
      );
    });

    test('includes pagination parameters', async () => {
      await cache.list({
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
        pageSize: 10,
        pageToken: 'next-page',
      });

      const call = mockFetch.mock.calls[0]!;
      const url = call[0] as string;
      expect(url).toContain('pageSize=10');
      expect(url).toContain('pageToken=next-page');
    });
  });

  describe('update()', () => {
    test('uses PATCH method', async () => {
      await cache.update(
        'abc123',
        { ttl: '7200s' },
        {
          accessToken: 'test-token',
          projectId: 'my-project',
          location: 'us-central1',
        }
      );

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      expect(options.method).toBe('PATCH');
    });

    test('sends update body as JSON', async () => {
      await cache.update(
        'abc123',
        { ttl: '7200s' },
        {
          accessToken: 'test-token',
          projectId: 'my-project',
          location: 'us-central1',
        }
      );

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.ttl).toBe('7200s');
    });
  });

  describe('delete()', () => {
    test('uses DELETE method', async () => {
      await cache.delete('abc123', {
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const call = mockFetch.mock.calls[0]!;
      const options = call[1] as RequestInit;
      expect(options.method).toBe('DELETE');
    });

    test('builds correct URL with cache ID', async () => {
      await cache.delete('abc123', {
        accessToken: 'test-token',
        projectId: 'my-project',
        location: 'us-central1',
      });

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('/cachedContents/abc123');
    });
  });

  describe('error handling', () => {
    test('throws UPPError on 400 response', async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'Bad request' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(
        cache.create({
          accessToken: 'test-token',
          projectId: 'my-project',
          location: 'us-central1',
          model: 'gemini-2.5-flash',
        })
      ).rejects.toThrow();
    });

    test('throws UPPError on 404 response', async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'Not found' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(
        cache.get('nonexistent', {
          accessToken: 'test-token',
          projectId: 'my-project',
          location: 'us-central1',
        })
      ).rejects.toThrow();
    });
  });
});
