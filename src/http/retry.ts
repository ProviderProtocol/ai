import type { RetryStrategy } from '../types/provider.ts';
import type { UPPError } from '../types/errors.ts';

/**
 * Exponential backoff retry strategy
 */
export class ExponentialBackoff implements RetryStrategy {
  private maxAttempts: number;
  private baseDelay: number;
  private maxDelay: number;
  private jitter: boolean;

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

  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    // Only retry on retryable errors
    if (!this.isRetryable(error)) {
      return null;
    }

    // Calculate delay with exponential backoff
    let delay = this.baseDelay * Math.pow(2, attempt - 1);
    delay = Math.min(delay, this.maxDelay);

    // Add jitter
    if (this.jitter) {
      delay = delay * (0.5 + Math.random());
    }

    return Math.floor(delay);
  }

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
 * Linear backoff retry strategy
 */
export class LinearBackoff implements RetryStrategy {
  private maxAttempts: number;
  private delay: number;

  constructor(options: {
    maxAttempts?: number;
    delay?: number;
  } = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.delay = options.delay ?? 1000;
  }

  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    // Only retry on retryable errors
    if (!this.isRetryable(error)) {
      return null;
    }

    return this.delay * attempt;
  }

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
 * No retry strategy - fail immediately
 */
export class NoRetry implements RetryStrategy {
  onRetry(): null {
    return null;
  }
}

/**
 * Token bucket rate limiter with retry
 */
export class TokenBucket implements RetryStrategy {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;
  private maxAttempts: number;

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
  }

  beforeRequest(): number {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate time until next token
    const msPerToken = 1000 / this.refillRate;
    return Math.ceil(msPerToken);
  }

  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt > this.maxAttempts) {
      return null;
    }

    if (error.code !== 'RATE_LIMITED') {
      return null;
    }

    // Wait for token bucket to refill
    const msPerToken = 1000 / this.refillRate;
    return Math.ceil(msPerToken * 2); // Wait for 2 tokens
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

/**
 * Retry strategy that respects Retry-After headers
 */
export class RetryAfterStrategy implements RetryStrategy {
  private maxAttempts: number;
  private fallbackDelay: number;
  private lastRetryAfter?: number;

  constructor(options: {
    maxAttempts?: number;
    fallbackDelay?: number;
  } = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.fallbackDelay = options.fallbackDelay ?? 5000;
  }

  /**
   * Set the Retry-After value from response headers
   * Call this before onRetry when you have a Retry-After header
   */
  setRetryAfter(seconds: number): void {
    this.lastRetryAfter = seconds * 1000;
  }

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
