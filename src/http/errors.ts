/**
 * HTTP error handling and normalization utilities.
 * @module http/errors
 */

import { UPPError, type ErrorCode, type Modality } from '../types/errors.ts';
import { toError } from '../utils/error.ts';

/**
 * Maps HTTP status codes to standardized UPP error codes.
 *
 * This function provides consistent error categorization across all providers:
 * - 400 -> INVALID_REQUEST (bad request format or parameters)
 * - 401, 403 -> AUTHENTICATION_FAILED (invalid or missing credentials)
 * - 404 -> MODEL_NOT_FOUND (requested model does not exist)
 * - 408 -> TIMEOUT (request timed out)
 * - 413 -> CONTEXT_LENGTH_EXCEEDED (input too long)
 * - 429 -> RATE_LIMITED (too many requests)
 * - 5xx -> PROVIDER_ERROR (server-side issues)
 *
 * @param status - HTTP status code from the response
 * @returns The corresponding UPP ErrorCode
 *
 * @example
 * ```typescript
 * const errorCode = statusToErrorCode(429);
 * // Returns 'RATE_LIMITED'
 *
 * const serverError = statusToErrorCode(503);
 * // Returns 'PROVIDER_ERROR'
 * ```
 */
export function statusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'INVALID_REQUEST';
    case 402:
      return 'QUOTA_EXCEEDED';
    case 401:
    case 403:
      return 'AUTHENTICATION_FAILED';
    case 404:
      return 'MODEL_NOT_FOUND';
    case 408:
      return 'TIMEOUT';
    case 409:
      return 'INVALID_REQUEST';
    case 422:
      return 'INVALID_REQUEST';
    case 413:
      return 'CONTEXT_LENGTH_EXCEEDED';
    case 451:
      return 'CONTENT_FILTERED';
    case 429:
      return 'RATE_LIMITED';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'PROVIDER_ERROR';
    default:
      return 'PROVIDER_ERROR';
  }
}

/**
 * Normalizes HTTP error responses into standardized UPPError objects.
 *
 * This function performs several operations:
 * 1. Maps the HTTP status code to an appropriate ErrorCode
 * 2. Attempts to extract a meaningful error message from the response body
 * 3. Handles various provider-specific error response formats
 *
 * Supported error message formats:
 * - `{ error: { message: "..." } }` (OpenAI, Anthropic)
 * - `{ message: "..." }` (simple format)
 * - `{ error: { error: { message: "..." } } }` (nested format)
 * - `{ detail: "..." }` (FastAPI style)
 * - Plain text body (if under 200 characters)
 *
 * @param response - The HTTP Response object with non-2xx status
 * @param provider - Provider identifier for error context
 * @param modality - Request modality for error context
 * @returns A UPPError with normalized code and message
 *
 * @example
 * ```typescript
 * if (!response.ok) {
 *   const error = await normalizeHttpError(response, 'openai', 'llm');
 *   // error.code might be 'RATE_LIMITED' for 429
 *   // error.message contains provider's error message
 *   throw error;
 * }
 * ```
 */
export async function normalizeHttpError(
  response: Response,
  provider: string,
  modality: Modality
): Promise<UPPError> {
  const code = statusToErrorCode(response.status);
  let message = `HTTP ${response.status}: ${response.statusText}`;
  let bodyReadError: Error | undefined;

  try {
    const body = await response.text();
    if (body) {
      try {
        const json = JSON.parse(body);
        const extractedMessage =
          json.error?.message ||
          json.message ||
          json.error?.error?.message ||
          json.detail;

        if (extractedMessage) {
          message = extractedMessage;
        }
      } catch {
        if (body.length < 200) {
          message = body;
        }
      }
    }
  } catch (error) {
    bodyReadError = toError(error);
  }

  return new UPPError(message, code, provider, modality, response.status, bodyReadError);
}

/**
 * Creates a UPPError for network failures (DNS, connection, etc.).
 *
 * Use this when the request fails before receiving any HTTP response,
 * such as DNS resolution failures, connection refused, or network unreachable.
 *
 * @param error - The underlying Error that caused the failure
 * @param provider - Provider identifier for error context
 * @param modality - Request modality for error context
 * @returns A UPPError with NETWORK_ERROR code and the original error attached
 */
export function networkError(
  error: Error,
  provider: string,
  modality: Modality
): UPPError {
  return new UPPError(
    `Network error: ${error.message}`,
    'NETWORK_ERROR',
    provider,
    modality,
    undefined,
    error
  );
}

/**
 * Creates a UPPError for request timeout.
 *
 * Use this when the request exceeds the configured timeout duration
 * and is aborted by the AbortController.
 *
 * @param timeout - The timeout duration in milliseconds that was exceeded
 * @param provider - Provider identifier for error context
 * @param modality - Request modality for error context
 * @returns A UPPError with TIMEOUT code
 */
export function timeoutError(
  timeout: number,
  provider: string,
  modality: Modality
): UPPError {
  return new UPPError(
    `Request timed out after ${timeout}ms`,
    'TIMEOUT',
    provider,
    modality
  );
}

/**
 * Creates a UPPError for user-initiated request cancellation.
 *
 * Use this when the request is aborted via a user-provided AbortSignal,
 * distinct from timeout-based cancellation.
 *
 * @param provider - Provider identifier for error context
 * @param modality - Request modality for error context
 * @returns A UPPError with CANCELLED code
 */
export function cancelledError(provider: string, modality: Modality): UPPError {
  return new UPPError('Request was cancelled', 'CANCELLED', provider, modality);
}
