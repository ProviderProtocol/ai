import { describe, expect, test } from 'bun:test';
import { ExponentialBackoff, NoRetry } from '../../../src/http/retry.ts';
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
});
