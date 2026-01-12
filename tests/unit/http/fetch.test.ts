import { describe, expect, test } from 'bun:test';
import { doFetch } from '../../../src/http/fetch.ts';
import type { RetryStrategy } from '../../../src/types/provider.ts';
import { UPPError } from '../../../src/types/errors.ts';

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
});
