/**
 * HTTP fetch utilities with retry, timeout, and error normalization.
 * @module http/fetch
 */

import type { ProviderConfig, RetryStrategy } from '../types/provider.ts';
import type { Modality } from '../types/errors.ts';
import { UPPError } from '../types/errors.ts';
import {
  normalizeHttpError,
  networkError,
  timeoutError,
  cancelledError,
} from './errors.ts';
import { toError } from '../utils/error.ts';

/** Default request timeout in milliseconds (2 minutes). */
const DEFAULT_TIMEOUT = 120000;
const MAX_RETRY_AFTER_SECONDS = 3600;

/**
 * Warns when a non-TLS URL is used with a provider.
 * Only warns in non-production, excludes localhost for local development.
 */
export function warnInsecureUrl(url: string, provider: string): void {
  if (
    process.env.NODE_ENV !== 'production' &&
    url.startsWith('http://') &&
    !url.includes('localhost') &&
    !url.includes('127.0.0.1') &&
    !url.includes('[::1]')
  ) {
    console.warn(
      `[UPP] Provider "${provider}" using non-TLS URL: ${url}. ` +
      'API keys may be exposed to network interception.'
    );
  }
}

type ForkableRetryStrategy = RetryStrategy & {
  fork: () => RetryStrategy | undefined;
};

function hasFork(strategy: RetryStrategy | undefined): strategy is ForkableRetryStrategy {
  return !!strategy && typeof (strategy as { fork?: unknown }).fork === 'function';
}

/**
 * Executes an HTTP fetch request with automatic retry, timeout handling, and error normalization.
 *
 * This function wraps the standard fetch API with additional capabilities:
 * - Configurable timeout with automatic request cancellation (per attempt)
 * - Retry strategy support (exponential backoff, linear, token bucket, etc.)
 * - Pre-request delay support for rate limiting strategies
 * - Automatic Retry-After header parsing and handling
 * - Error normalization to UPPError format
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options (method, headers, body, etc.)
 * @param config - Provider configuration containing fetch customization, timeout, and retry strategy
 * @param provider - Provider identifier for error context (e.g., 'openai', 'anthropic')
 * @param modality - Request modality for error context (e.g., 'llm', 'embedding', 'image')
 * @returns The successful Response object
 *
 * @throws {UPPError} RATE_LIMITED - When rate limited and retries exhausted
 * @throws {UPPError} NETWORK_ERROR - When a network failure occurs
 * @throws {UPPError} TIMEOUT - When the request times out
 * @throws {UPPError} CANCELLED - When the request is aborted via signal
 * @throws {UPPError} Various codes based on HTTP status (see statusToErrorCode)
 *
 * @example
 * ```typescript
 * const response = await doFetch(
 *   'https://api.openai.com/v1/chat/completions',
 *   {
 *     method: 'POST',
 *     headers: { 'Authorization': 'Bearer sk-...' },
 *     body: JSON.stringify({ model: 'gpt-4', messages: [] })
 *   },
 *   { timeout: 30000, retryStrategy: new ExponentialBackoff() },
 *   'openai',
 *   'llm'
 * );
 * ```
 */
export async function doFetch(
  url: string,
  init: RequestInit,
  config: ProviderConfig,
  provider: string,
  modality: Modality
): Promise<Response> {
  const fetchFn = config.fetch ?? fetch;
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const baseStrategy = config.retryStrategy;
  const strategy = hasFork(baseStrategy) ? baseStrategy.fork() : baseStrategy;

  // Warn about potential security issue with non-TLS URLs
  warnInsecureUrl(url, provider);

  let attempt = 0;

  while (true) {
    attempt++;

    if (strategy?.beforeRequest) {
      const delay = await strategy.beforeRequest();
      if (delay > 0) {
        await sleep(delay);
      }
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        fetchFn,
        url,
        init,
        timeout,
        provider,
        modality
      );
    } catch (error) {
      if (error instanceof UPPError) {
        if (strategy) {
          const delay = await strategy.onRetry(error, attempt);
          if (delay !== null) {
            await sleep(delay);
            continue;
          }
        }
        throw error;
      }

      const uppError = networkError(toError(error), provider, modality);

      if (strategy) {
        const delay = await strategy.onRetry(uppError, attempt);
        if (delay !== null) {
          await sleep(delay);
          continue;
        }
      }

      throw uppError;
    }

    if (!response.ok) {
      const error = await normalizeHttpError(response, provider, modality);

      const retryAfterSeconds = parseRetryAfter(
        response.headers.get('Retry-After'),
        config.retryAfterMaxSeconds ?? MAX_RETRY_AFTER_SECONDS
      );
      if (retryAfterSeconds !== null && strategy && 'setRetryAfter' in strategy) {
        (strategy as { setRetryAfter: (s: number) => void }).setRetryAfter(
          retryAfterSeconds
        );
      }

      if (strategy) {
        const delay = await strategy.onRetry(error, attempt);
        if (delay !== null) {
          await sleep(delay);
          continue;
        }
      }

      throw error;
    }

    strategy?.reset?.();

    return response;
  }
}

/**
 * Executes a fetch request with configurable timeout.
 *
 * Creates an AbortController to cancel the request if it exceeds the timeout.
 * Properly handles both user-provided abort signals and timeout-based cancellation,
 * throwing appropriate error types for each case.
 *
 * @param fetchFn - The fetch function to use (allows custom implementations)
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options
 * @param timeout - Maximum time in milliseconds before aborting
 * @param provider - Provider identifier for error context
 * @param modality - Request modality for error context
 * @returns The Response from the fetch call
 *
 * @throws {UPPError} TIMEOUT - When the timeout is exceeded
 * @throws {UPPError} CANCELLED - When cancelled via user-provided signal
 * @throws {Error} Network errors are passed through unchanged
 */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeout: number,
  provider: string,
  modality: Modality
): Promise<Response> {
  const existingSignal = init.signal;

  // Check if already aborted before starting
  if (existingSignal?.aborted) {
    throw cancelledError(provider, modality);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const onAbort = () => controller.abort();
  if (existingSignal) {
    existingSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (toError(error).name === 'AbortError') {
      if (existingSignal?.aborted) {
        throw cancelledError(provider, modality);
      }
      throw timeoutError(timeout, provider, modality);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (existingSignal) {
      existingSignal.removeEventListener('abort', onAbort);
    }
  }
}

/**
 * Delays execution for a specified duration.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an HTTP fetch request for streaming responses.
 *
 * Unlike {@link doFetch}, this function returns the response immediately without
 * checking the HTTP status. This is necessary for Server-Sent Events (SSE) and
 * other streaming protocols where error information may be embedded in the stream.
 *
 * The caller is responsible for:
 * - Checking response.ok and handling HTTP errors
 * - Parsing the response stream (e.g., using parseSSEStream)
 * - Handling stream-specific error conditions
 *
 * Retries are not performed for streaming requests since partial data may have
 * already been consumed by the caller.
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options
 * @param config - Provider configuration containing fetch customization and timeout
 * @param provider - Provider identifier for error context
 * @param modality - Request modality for error context
 * @returns The Response object (may have non-2xx status)
 *
 * @throws {UPPError} NETWORK_ERROR - When a network failure occurs
 * @throws {UPPError} TIMEOUT - When the request times out
 * @throws {UPPError} CANCELLED - When the request is aborted via signal
 *
 * @example
 * ```typescript
 * const response = await doStreamFetch(
 *   'https://api.openai.com/v1/chat/completions',
 *   {
 *     method: 'POST',
 *     headers: { 'Authorization': 'Bearer sk-...' },
 *     body: JSON.stringify({ model: 'gpt-4', messages: [], stream: true })
 *   },
 *   { timeout: 120000 },
 *   'openai',
 *   'llm'
 * );
 *
 * if (!response.ok) {
 *   throw await normalizeHttpError(response, 'openai', 'llm');
 * }
 *
 * for await (const event of parseSSEStream(response.body!)) {
 *   console.log(event);
 * }
 * ```
 */
export async function doStreamFetch(
  url: string,
  init: RequestInit,
  config: ProviderConfig,
  provider: string,
  modality: Modality
): Promise<Response> {
  const fetchFn = config.fetch ?? fetch;
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const baseStrategy = config.retryStrategy;
  const strategy = hasFork(baseStrategy) ? baseStrategy.fork() : baseStrategy;

  if (strategy?.beforeRequest) {
    const delay = await strategy.beforeRequest();
    if (delay > 0) {
      await sleep(delay);
    }
  }

  try {
    const response = await fetchWithTimeout(
      fetchFn,
      url,
      init,
      timeout,
      provider,
      modality
    );
    return response;
  } catch (error) {
    if (error instanceof UPPError) {
      throw error;
    }
    throw networkError(toError(error), provider, modality);
  }
}

/**
 * Parses Retry-After header values into seconds.
 *
 * Supports both delta-seconds and HTTP-date formats.
 */
function parseRetryAfter(headerValue: string | null, maxSeconds: number): number | null {
  if (!headerValue) {
    return null;
  }

  const seconds = parseInt(headerValue, 10);
  if (!Number.isNaN(seconds)) {
    return Math.min(maxSeconds, Math.max(0, seconds));
  }

  const dateMillis = Date.parse(headerValue);
  if (Number.isNaN(dateMillis)) {
    return null;
  }

  const deltaMs = dateMillis - Date.now();
  if (deltaMs <= 0) {
    return 0;
  }

  const deltaSeconds = Math.ceil(deltaMs / 1000);
  return Math.min(maxSeconds, Math.max(0, deltaSeconds));
}
