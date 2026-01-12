import { describe, expect, test } from 'bun:test';
import { ExponentialBackoff, NoRetry, TokenBucket, RetryAfterStrategy } from '../../../src/http/retry.ts';
import { UPPError } from '../../../src/types/errors.ts';

describe('retry strategies', () => {
  test('ExponentialBackoff retries on transient errors', () => {
    const strategy = new ExponentialBackoff({ maxAttempts: 2, baseDelay: 100, maxDelay: 1000, jitter: false });
    const error = new UPPError('rate limit', 'RATE_LIMITED', 'mock', 'llm');

    expect(strategy.onRetry(error, 1)).toBe(100);
    expect(strategy.onRetry(error, 2)).toBe(200);
    expect(strategy.onRetry(error, 3)).toBeNull();
  });

  test('ExponentialBackoff ignores non-retryable errors', () => {
    const strategy = new ExponentialBackoff({ maxAttempts: 3, baseDelay: 100, jitter: false });
    const error = new UPPError('invalid', 'INVALID_REQUEST', 'mock', 'llm');

    expect(strategy.onRetry(error, 1)).toBeNull();
  });

  test('NoRetry disables retry attempts', () => {
    const strategy = new NoRetry();
    const error = new UPPError('timeout', 'TIMEOUT', 'mock', 'llm');

    expect(strategy.onRetry(error, 1)).toBeNull();
  });

  test('TokenBucket enforces capacity', async () => {
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 1 });
    const first = await bucket.beforeRequest();
    const second = await bucket.beforeRequest();

    expect(first).toBe(0);
    expect(second).toBeGreaterThan(0);
  });

  test('RetryAfterStrategy fork isolates state', () => {
    const strategy = new RetryAfterStrategy({ maxAttempts: 1, fallbackDelay: 1000 });
    const forked = strategy.fork();
    strategy.setRetryAfter(2);

    const error = new UPPError('rate limit', 'RATE_LIMITED', 'mock', 'llm');
    expect(strategy.onRetry(error, 1)).toBe(2000);
    expect(forked.onRetry(error, 1)).toBe(1000);
  });
});
