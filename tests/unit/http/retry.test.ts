import { describe, expect, test } from 'bun:test';
import { ExponentialBackoff, LinearBackoff, NoRetry, TokenBucket, RetryAfterStrategy } from '../../../src/http/retry.ts';
import { UPPError, ErrorCode, ModalityType } from '../../../src/types/errors.ts';

describe('retry strategies', () => {
  test('ExponentialBackoff retries on transient errors', () => {
    const strategy = new ExponentialBackoff({ maxAttempts: 2, baseDelay: 100, maxDelay: 1000, jitter: false });
    const error = new UPPError('rate limit', ErrorCode.RateLimited, 'mock', ModalityType.LLM);

    expect(strategy.onRetry(error, 1)).toBe(100);
    expect(strategy.onRetry(error, 2)).toBe(200);
    expect(strategy.onRetry(error, 3)).toBeNull();
  });

  test('ExponentialBackoff ignores non-retryable errors', () => {
    const strategy = new ExponentialBackoff({ maxAttempts: 3, baseDelay: 100, jitter: false });
    const error = new UPPError('invalid', ErrorCode.InvalidRequest, 'mock', ModalityType.LLM);

    expect(strategy.onRetry(error, 1)).toBeNull();
  });

  test('ExponentialBackoff caps delay at maxDelay', () => {
    const strategy = new ExponentialBackoff({ maxAttempts: 5, baseDelay: 1000, maxDelay: 2500, jitter: false });
    const error = new UPPError('timeout', ErrorCode.Timeout, 'mock', ModalityType.LLM);

    expect(strategy.onRetry(error, 1)).toBe(1000);
    expect(strategy.onRetry(error, 2)).toBe(2000);
    expect(strategy.onRetry(error, 3)).toBe(2500);
  });

  test('ExponentialBackoff applies jitter within expected range', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const strategy = new ExponentialBackoff({ maxAttempts: 1, baseDelay: 1000, maxDelay: 10000, jitter: true });
      const error = new UPPError('rate limit', ErrorCode.RateLimited, 'mock', ModalityType.LLM);
      const delay = strategy.onRetry(error, 1);
      expect(delay).toBe(500);
    } finally {
      Math.random = originalRandom;
    }
  });

  test('NoRetry disables retry attempts', () => {
    const strategy = new NoRetry();
    const error = new UPPError('timeout', ErrorCode.Timeout, 'mock', ModalityType.LLM);

    expect(strategy.onRetry(error, 1)).toBeNull();
  });

  test('LinearBackoff retries with linear delay', () => {
    const strategy = new LinearBackoff({ maxAttempts: 3, delay: 100 });
    const error = new UPPError('rate limit', ErrorCode.RateLimited, 'mock', ModalityType.LLM);

    expect(strategy.onRetry(error, 1)).toBe(100);
    expect(strategy.onRetry(error, 2)).toBe(200);
    expect(strategy.onRetry(error, 3)).toBe(300);
    expect(strategy.onRetry(error, 4)).toBeNull();
  });

  test('TokenBucket enforces capacity', async () => {
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 1 });
    const first = await bucket.beforeRequest();
    const second = await bucket.beforeRequest();

    expect(first).toBe(0);
    expect(second).toBeGreaterThan(0);
  });

  test('TokenBucket reserves tokens for concurrent callers', async () => {
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 1 });
    const [first, second, third] = await Promise.all([
      bucket.beforeRequest(),
      bucket.beforeRequest(),
      bucket.beforeRequest(),
    ]);

    expect(first).toBe(0);
    expect(second).toBeGreaterThanOrEqual(1000);
    expect(third).toBeGreaterThan(second);
  });

  test('RetryAfterStrategy fork isolates state', () => {
    const strategy = new RetryAfterStrategy({ maxAttempts: 1, fallbackDelay: 1000 });
    const forked = strategy.fork();
    strategy.setRetryAfter(2);

    const error = new UPPError('rate limit', ErrorCode.RateLimited, 'mock', ModalityType.LLM);
    expect(strategy.onRetry(error, 1)).toBe(2000);
    expect(forked.onRetry(error, 1)).toBe(1000);
  });
});

describe('TokenBucket stress tests', () => {
  test('handles high concurrency without race conditions', async () => {
    const bucket = new TokenBucket({ maxTokens: 10, refillRate: 100 });
    const concurrentRequests = 50;

    const results = await Promise.all(
      Array.from({ length: concurrentRequests }, () => bucket.beforeRequest())
    );

    // First 10 should be immediate (0 delay)
    const immediateRequests = results.filter(delay => delay === 0);
    expect(immediateRequests.length).toBe(10);

    // Remaining should have increasing delays
    const delayedRequests = results.filter(delay => delay > 0);
    expect(delayedRequests.length).toBe(40);

    // Delays should be sequential (each subsequent request waits longer)
    for (let i = 1; i < delayedRequests.length; i++) {
      expect(delayedRequests[i]!).toBeGreaterThanOrEqual(delayedRequests[i - 1]!);
    }
  });

  test('refills tokens correctly over time', async () => {
    // refillRate = 1 means 1 token per second
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 1 });

    // First request is immediate (consumes the 1 available token)
    expect(await bucket.beforeRequest()).toBe(0);

    // Second should wait ~1 second for refill (1 token per second)
    const secondDelay = await bucket.beforeRequest();
    expect(secondDelay).toBeGreaterThanOrEqual(1000);
    expect(secondDelay).toBeLessThan(2000);
  });
});

describe('ExponentialBackoff edge cases', () => {
  test('handles very high attempt numbers without overflow', () => {
    const strategy = new ExponentialBackoff({
      maxAttempts: 100,
      baseDelay: 1000,
      maxDelay: 60000,
      jitter: false,
    });
    const error = new UPPError('timeout', ErrorCode.Timeout, 'mock', ModalityType.LLM);

    // Attempt 50 would be 2^49 * 1000 which overflows, but should be capped
    const delay = strategy.onRetry(error, 50);
    expect(delay).toBe(60000); // Should be capped at maxDelay
  });

  test('handles base delay of 0', () => {
    const strategy = new ExponentialBackoff({
      maxAttempts: 3,
      baseDelay: 0,
      maxDelay: 1000,
      jitter: false,
    });
    const error = new UPPError('timeout', ErrorCode.Timeout, 'mock', ModalityType.LLM);

    expect(strategy.onRetry(error, 1)).toBe(0);
    expect(strategy.onRetry(error, 2)).toBe(0);
  });

});
