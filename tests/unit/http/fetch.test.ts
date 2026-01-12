import { describe, expect, test } from 'bun:test';
import { doFetch, doStreamFetch } from '../../../src/http/fetch.ts';
import type { RetryStrategy } from '../../../src/types/provider.ts';
import { UPPError, ErrorCode } from '../../../src/types/errors.ts';

class RetryAfterCapture implements RetryStrategy {
  retryAfterSeconds?: number;

  setRetryAfter(seconds: number): void {
    this.retryAfterSeconds = seconds;
  }

  onRetry(_error: UPPError, _attempt: number): number | null {
    return null;
  }
}

describe('doFetch', () => {
  test('retries once and runs beforeRequest per attempt', async () => {
    let callCount = 0;
    const fetchFn: typeof fetch = Object.assign(
      async () => {
        callCount += 1;
        if (callCount === 1) {
          return new Response('fail', { status: 500 });
        }
        return new Response('ok', { status: 200 });
      },
      { preconnect: (_input: string | URL) => undefined }
    );

    class CountingStrategy implements RetryStrategy {
      beforeCount = 0;
      retryCount = 0;

      beforeRequest(): number {
        this.beforeCount += 1;
        return 0;
      }

      onRetry(_error: UPPError, attempt: number): number | null {
        this.retryCount += 1;
        return attempt < 2 ? 0 : null;
      }
    }

    const strategy = new CountingStrategy();

    const response = await doFetch(
      'https://example.com',
      { method: 'GET' },
      { fetch: fetchFn, retryStrategy: strategy },
      'mock',
      'llm'
    );

    expect(response.ok).toBe(true);
    expect(callCount).toBe(2);
    expect(strategy.beforeCount).toBe(2);
    expect(strategy.retryCount).toBe(1);
  });

  test('parses Retry-After HTTP-date headers', async () => {
    const strategy = new RetryAfterCapture();
    const httpDate = new Date(Date.now() + 1500).toUTCString();

    const fetchFn: typeof fetch = Object.assign(
      async (..._args: Parameters<typeof fetch>): Promise<Response> =>
        new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
          status: 429,
          headers: { 'Retry-After': httpDate },
        }),
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    try {
      await doFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn, retryStrategy: strategy },
        'mock',
        'llm'
      );
      throw new Error('Expected doFetch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
    }

    expect(strategy.retryAfterSeconds).toBeDefined();
    if (strategy.retryAfterSeconds !== undefined) {
      expect(strategy.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  test('clamps Retry-After seconds to non-negative', async () => {
    const strategy = new RetryAfterCapture();
    const fetchFn: typeof fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
          status: 429,
          headers: { 'Retry-After': '-5' },
        }),
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    await expect(
      doFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn, retryStrategy: strategy },
        'mock',
        'llm'
      )
    ).rejects.toBeInstanceOf(UPPError);

    expect(strategy.retryAfterSeconds).toBe(0);
  });

  test('clamps overly large Retry-After values', async () => {
    const strategy = new RetryAfterCapture();
    const fetchFn: typeof fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
          status: 429,
          headers: { 'Retry-After': '999999' },
        }),
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    await expect(
      doFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn, retryStrategy: strategy },
        'mock',
        'llm'
      )
    ).rejects.toBeInstanceOf(UPPError);

    expect(strategy.retryAfterSeconds).toBeDefined();
    if (strategy.retryAfterSeconds !== undefined) {
      expect(strategy.retryAfterSeconds).toBeLessThan(999999);
    }
  });

  test('respects retryAfterMaxSeconds override', async () => {
    const strategy = new RetryAfterCapture();
    const fetchFn: typeof fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
          status: 429,
          headers: { 'Retry-After': '999' },
        }),
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    await expect(
      doFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn, retryStrategy: strategy, retryAfterMaxSeconds: 5 },
        'mock',
        'llm'
      )
    ).rejects.toBeInstanceOf(UPPError);

    expect(strategy.retryAfterSeconds).toBe(5);
  });

  test('times out when fetch does not resolve', async () => {
    const fetchFn: typeof fetch = Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              const abortError = new Error('Aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            },
            { once: true }
          );
        }),
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    await expect(
      doFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn, timeout: 5 },
        'mock',
        'llm'
      )
    ).rejects.toMatchObject({ code: ErrorCode.Timeout });
  });

  test('throws CANCELLED when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      doFetch(
        'https://example.com',
        { method: 'GET', signal: controller.signal },
        { timeout: 100 },
        'mock',
        'llm'
      )
    ).rejects.toMatchObject({ code: ErrorCode.Cancelled });
  });

  test('wraps network failures as NETWORK_ERROR', async () => {
    const fetchFn: typeof fetch = Object.assign(
      async () => {
        throw new Error('socket hang up');
      },
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    await expect(
      doFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn },
        'mock',
        'llm'
      )
    ).rejects.toMatchObject({ code: ErrorCode.NetworkError });
  });
});

describe('doStreamFetch', () => {
  test('returns response without checking status', async () => {
    const fetchFn: typeof fetch = Object.assign(
      async () =>
        new Response('not found', {
          status: 404,
        }),
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    const response = await doStreamFetch(
      'https://example.com',
      { method: 'GET' },
      { fetch: fetchFn },
      'mock',
      'llm'
    );

    expect(response.status).toBe(404);
  });

  test('wraps network failures as NETWORK_ERROR', async () => {
    const fetchFn: typeof fetch = Object.assign(
      async () => {
        throw new Error('dns failure');
      },
      {
        preconnect: (_input: string | URL) => undefined,
      }
    );

    await expect(
      doStreamFetch(
        'https://example.com',
        { method: 'GET' },
        { fetch: fetchFn },
        'mock',
        'llm'
      )
    ).rejects.toMatchObject({ code: ErrorCode.NetworkError });
  });
});
