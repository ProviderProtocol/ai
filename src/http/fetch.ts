import type { ProviderConfig } from '../types/provider.ts';
import type { Modality } from '../types/errors.ts';
import { UPPError } from '../types/errors.ts';
import {
  normalizeHttpError,
  networkError,
  timeoutError,
  cancelledError,
} from './errors.ts';

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 120000; // 2 minutes

/**
 * Execute fetch with retry, timeout, and error normalization
 *
 * @param url - Request URL
 * @param init - Fetch init options
 * @param config - Provider config
 * @param provider - Provider name for error messages
 * @param modality - Modality for error messages
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
  const strategy = config.retryStrategy;

  // Pre-request delay (e.g., token bucket)
  if (strategy?.beforeRequest) {
    const delay = await strategy.beforeRequest();
    if (delay > 0) {
      await sleep(delay);
    }
  }

  let lastError: UPPError | undefined;
  let attempt = 0;

  while (true) {
    attempt++;

    try {
      const response = await fetchWithTimeout(
        fetchFn,
        url,
        init,
        timeout,
        provider,
        modality
      );

      // Check for HTTP errors
      if (!response.ok) {
        const error = await normalizeHttpError(response, provider, modality);

        // Check for Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter && strategy) {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds) && 'setRetryAfter' in strategy) {
            (strategy as { setRetryAfter: (s: number) => void }).setRetryAfter(
              seconds
            );
          }
        }

        // Try to retry
        if (strategy) {
          const delay = await strategy.onRetry(error, attempt);
          if (delay !== null) {
            await sleep(delay);
            lastError = error;
            continue;
          }
        }

        throw error;
      }

      // Success - reset strategy state
      strategy?.reset?.();

      return response;
    } catch (error) {
      // Already a UPPError, handle retry
      if (error instanceof UPPError) {
        if (strategy) {
          const delay = await strategy.onRetry(error, attempt);
          if (delay !== null) {
            await sleep(delay);
            lastError = error;
            continue;
          }
        }
        throw error;
      }

      // Network error
      const uppError = networkError(error as Error, provider, modality);

      if (strategy) {
        const delay = await strategy.onRetry(uppError, attempt);
        if (delay !== null) {
          await sleep(delay);
          lastError = uppError;
          continue;
        }
      }

      throw uppError;
    }
  }
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeout: number,
  provider: string,
  modality: Modality
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Merge abort signals if one was provided
  const existingSignal = init.signal;
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      // Check if it was the user's signal or our timeout
      if (existingSignal?.aborted) {
        throw cancelledError(provider, modality);
      }
      throw timeoutError(timeout, provider, modality);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Streaming fetch - returns response without checking ok status
 * Used when we need to read the stream for SSE
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
  const strategy = config.retryStrategy;

  // Pre-request delay
  if (strategy?.beforeRequest) {
    const delay = await strategy.beforeRequest();
    if (delay > 0) {
      await sleep(delay);
    }
  }

  // For streaming, we don't retry - the consumer handles errors
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
    throw networkError(error as Error, provider, modality);
  }
}
