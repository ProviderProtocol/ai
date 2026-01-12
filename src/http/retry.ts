/**
 * Retry strategies for handling transient failures in HTTP requests.
 * @module http/retry
 */

import type { RetryStrategy } from '../types/provider.ts';
import type { UPPError } from '../types/errors.ts';

/**
 * Implements exponential backoff with optional jitter for retry delays.
 *
 * The delay between retries doubles with each attempt, helping to:
 * - Avoid overwhelming servers during outages
 * - Reduce thundering herd effects when many clients retry simultaneously
 * - Give transient issues time to resolve
 *
 * Delay formula: min(baseDelay * 2^(attempt-1), maxDelay)
 * With jitter: delay * random(0.5, 1.0)
 *
 * Only retries on transient errors: RATE_LIMITED, NETWORK_ERROR, TIMEOUT, PROVIDER_ERROR
 *
 * @implements {RetryStrategy}
 *
 * @example
 * ```typescript
 * // Default configuration (3 retries, 1s base, 30s max, jitter enabled)
 * const retry = new ExponentialBackoff();
 *
 * // Custom configuration
 * const customRetry = new ExponentialBackoff({
 *   maxAttempts: 5,     // Up to 5 retry attempts
 *   baseDelay: 500,     // Start with 500ms delay
 *   maxDelay: 60000,    // Cap at 60 seconds
 *   jitter: false       // Disable random jitter
 * });
 *
 * // Use with provider
 * const provider = createOpenAI({
 *   retryStrategy: customRetry
 * });
 * ```
 */
export class ExponentialBackoff implements RetryStrategy {
  private maxAttempts: number;
  private baseDelay: number;
  private maxDelay: number;
  private jitter: boolean;

  /**
   * Creates a new ExponentialBackoff instance.
   *
   * @param options - Configuration options
   * @param options.maxAttempts - Maximum number of retry attempts (default: 3)
   * @param options.baseDelay - Initial delay in milliseconds (default: 1000)
   * @param options.maxDelay - Maximum delay cap in milliseconds (default: 30000)
   * @param options.jitter - Whether to add random jitter to delays (default: true)
   */
  constructor(options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    jitter?: boolean;
  } = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.jitter = options.jitter ?? true;
  }

  /**
   * Determines whether to retry and calculates the delay.
   *
   * @param error - The error that triggered the retry
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds before next retry, or null to stop retrying
   */
  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    if (!this.isRetryable(error)) {
      return null;
    }

    let delay = this.baseDelay * Math.pow(2, attempt - 1);
    delay = Math.min(delay, this.maxDelay);

    if (this.jitter) {
      delay = delay * (0.5 + Math.random());
    }

    return Math.floor(delay);
  }

  /**
   * Checks if an error is eligible for retry.
   *
   * @param error - The error to evaluate
   * @returns True if the error is transient and retryable
   */
  private isRetryable(error: UPPError): boolean {
    return (
      error.code === 'RATE_LIMITED' ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT' ||
      error.code === 'PROVIDER_ERROR'
    );
  }
}

/**
 * Implements linear backoff where delays increase proportionally with each attempt.
 *
 * Unlike exponential backoff, linear backoff increases delays at a constant rate:
 * - Attempt 1: delay * 1 (e.g., 1000ms)
 * - Attempt 2: delay * 2 (e.g., 2000ms)
 * - Attempt 3: delay * 3 (e.g., 3000ms)
 *
 * This strategy is simpler and more predictable than exponential backoff,
 * suitable for scenarios where gradual delay increase is preferred over
 * aggressive backoff.
 *
 * Only retries on transient errors: RATE_LIMITED, NETWORK_ERROR, TIMEOUT, PROVIDER_ERROR
 *
 * @implements {RetryStrategy}
 *
 * @example
 * ```typescript
 * // Default configuration (3 retries, 1s delay increment)
 * const retry = new LinearBackoff();
 *
 * // Custom configuration
 * const customRetry = new LinearBackoff({
 *   maxAttempts: 4,  // Up to 4 retry attempts
 *   delay: 2000      // 2s, 4s, 6s, 8s delays
 * });
 *
 * // Use with provider
 * const provider = createAnthropic({
 *   retryStrategy: customRetry
 * });
 * ```
 */
export class LinearBackoff implements RetryStrategy {
  private maxAttempts: number;
  private delay: number;

  /**
   * Creates a new LinearBackoff instance.
   *
   * @param options - Configuration options
   * @param options.maxAttempts - Maximum number of retry attempts (default: 3)
   * @param options.delay - Base delay multiplier in milliseconds (default: 1000)
   */
  constructor(options: {
    maxAttempts?: number;
    delay?: number;
  } = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.delay = options.delay ?? 1000;
  }

  /**
   * Determines whether to retry and calculates the linear delay.
   *
   * @param error - The error that triggered the retry
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds (delay * attempt), or null to stop retrying
   */
  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    if (!this.isRetryable(error)) {
      return null;
    }

    return this.delay * attempt;
  }

  /**
   * Checks if an error is eligible for retry.
   *
   * @param error - The error to evaluate
   * @returns True if the error is transient and retryable
   */
  private isRetryable(error: UPPError): boolean {
    return (
      error.code === 'RATE_LIMITED' ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT' ||
      error.code === 'PROVIDER_ERROR'
    );
  }
}

/**
 * Disables all retry behavior, failing immediately on any error.
 *
 * Use this strategy when:
 * - Retries are handled at a higher level in your application
 * - You want immediate failure feedback
 * - The operation is not idempotent
 * - Time sensitivity requires fast failure
 *
 * @implements {RetryStrategy}
 *
 * @example
 * ```typescript
 * // Disable retries for time-sensitive operations
 * const provider = createOpenAI({
 *   retryStrategy: new NoRetry()
 * });
 * ```
 */
export class NoRetry implements RetryStrategy {
  /**
   * Always returns null to indicate no retry should be attempted.
   *
   * @returns Always returns null
   */
  onRetry(_error: UPPError, _attempt: number): null {
    return null;
  }
}

/**
 * Implements token bucket rate limiting with automatic refill.
 *
 * The token bucket algorithm provides smooth rate limiting by:
 * - Maintaining a bucket of tokens that replenish over time
 * - Consuming one token per request
 * - Delaying requests when the bucket is empty
 * - Allowing burst traffic up to the bucket capacity
 *
 * This is particularly useful for:
 * - Client-side rate limiting to avoid hitting API rate limits
 * - Smoothing request patterns to maintain consistent throughput
 * - Preventing accidental API abuse
 *
 * Unlike other retry strategies, TokenBucket implements {@link beforeRequest}
 * to proactively delay requests before they are made.
 *
 * @implements {RetryStrategy}
 *
 * @example
 * ```typescript
 * // Allow 10 requests burst, refill 1 token per second
 * const bucket = new TokenBucket({
 *   maxTokens: 10,    // Burst capacity
 *   refillRate: 1,    // Tokens per second
 *   maxAttempts: 3    // Retry attempts on rate limit
 * });
 *
 * // Aggressive rate limiting: 5 req/s sustained
 * const strictBucket = new TokenBucket({
 *   maxTokens: 5,
 *   refillRate: 5
 * });
 *
 * // Use with provider
 * const provider = createOpenAI({
 *   retryStrategy: bucket
 * });
 * ```
 */
export class TokenBucket implements RetryStrategy {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  private maxAttempts: number;
  private lock: Promise<void>;

  /**
   * Creates a new TokenBucket instance.
   *
   * @param options - Configuration options
   * @param options.maxTokens - Maximum bucket capacity (default: 10)
   * @param options.refillRate - Tokens added per second (default: 1)
   * @param options.maxAttempts - Maximum retry attempts on rate limit (default: 3)
   */
  constructor(options: {
    maxTokens?: number;
    refillRate?: number;
    maxAttempts?: number;
  } = {}) {
    this.maxTokens = options.maxTokens ?? 10;
    this.refillRate = options.refillRate ?? 1;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.lock = Promise.resolve();
  }

  /**
   * Called before each request to consume a token or calculate wait time.
   *
   * Refills the bucket based on elapsed time, then either:
   * - Returns 0 if a token is available (consumed immediately)
   * - Returns the wait time in milliseconds until the next token
   *
   * @returns Delay in milliseconds before the request can proceed
   */
  beforeRequest(): Promise<number> {
    return this.withLock(() => {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return 0;
      }

      const msPerToken = 1000 / this.refillRate;
      return Math.ceil(msPerToken);
    });
  }

  /**
   * Handles retry logic for rate-limited requests.
   *
   * Only retries on RATE_LIMITED errors, waiting for bucket refill.
   *
   * @param error - The error that triggered the retry
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds (time for 2 tokens), or null to stop
   */
  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    if (error.code !== 'RATE_LIMITED') {
      return null;
    }

    const msPerToken = 1000 / this.refillRate;
    return Math.ceil(msPerToken * 2);
  }

  /**
   * Resets the bucket to full capacity.
   *
   * Called automatically on successful requests to restore available tokens.
   */
  reset(): void {
    void this.withLock(() => {
      this.tokens = this.maxTokens;
      this.lastRefill = Date.now();
    });
  }

  /**
   * Refills the bucket based on elapsed time since last refill.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    this.lock = next.then(() => undefined, () => undefined);
    return next;
  }
}

/**
 * Respects server-provided Retry-After headers for optimal retry timing.
 *
 * When servers return a 429 (Too Many Requests) response, they often include
 * a Retry-After header indicating when the client should retry. This strategy
 * uses that information for precise retry timing.
 *
 * Benefits over fixed backoff strategies:
 * - Follows server recommendations for optimal retry timing
 * - Avoids retrying too early and wasting requests
 * - Adapts to dynamic rate limit windows
 *
 * If no Retry-After header is provided, falls back to a configurable delay.
 * Only retries on RATE_LIMITED errors.
 *
 * @implements {RetryStrategy}
 *
 * @example
 * ```typescript
 * // Use server-recommended retry timing
 * const retryAfter = new RetryAfterStrategy({
 *   maxAttempts: 5,       // Retry up to 5 times
 *   fallbackDelay: 10000  // 10s fallback if no header
 * });
 *
 * // The doFetch function automatically calls setRetryAfter
 * // when a Retry-After header is present in the response
 *
 * const provider = createOpenAI({
 *   retryStrategy: retryAfter
 * });
 * ```
 */
export class RetryAfterStrategy implements RetryStrategy {
  private maxAttempts: number;
  private fallbackDelay: number;
  private lastRetryAfter?: number;

  /**
   * Creates a new RetryAfterStrategy instance.
   *
   * @param options - Configuration options
   * @param options.maxAttempts - Maximum number of retry attempts (default: 3)
   * @param options.fallbackDelay - Delay in ms when no Retry-After header (default: 5000)
   */
  constructor(options: {
    maxAttempts?: number;
    fallbackDelay?: number;
  } = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.fallbackDelay = options.fallbackDelay ?? 5000;
  }

  /**
   * Creates a request-scoped copy of this strategy.
   */
  fork(): RetryAfterStrategy {
    return new RetryAfterStrategy({
      maxAttempts: this.maxAttempts,
      fallbackDelay: this.fallbackDelay,
    });
  }

  /**
   * Sets the retry delay from a Retry-After header value.
   *
   * Called by doFetch when a Retry-After header is present in the response.
   * The value is used for the next onRetry call and then cleared.
   *
   * @param seconds - The Retry-After value in seconds
   */
  setRetryAfter(seconds: number): void {
    this.lastRetryAfter = seconds * 1000;
  }

  /**
   * Determines retry delay using Retry-After header or fallback.
   *
   * @param error - The error that triggered the retry
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay from Retry-After header or fallback, null to stop
   */
  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    if (error.code !== 'RATE_LIMITED') {
      return null;
    }

    const delay = this.lastRetryAfter ?? this.fallbackDelay;
    this.lastRetryAfter = undefined;
    return delay;
  }
}
