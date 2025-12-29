import { UPPError, type ErrorCode, type Modality } from '../types/errors.ts';

/**
 * Map HTTP status codes to UPP error codes
 */
export function statusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'INVALID_REQUEST';
    case 401:
    case 403:
      return 'AUTHENTICATION_FAILED';
    case 404:
      return 'MODEL_NOT_FOUND';
    case 408:
      return 'TIMEOUT';
    case 413:
      return 'CONTEXT_LENGTH_EXCEEDED';
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
 * Normalize HTTP error responses to UPPError
 * Maps HTTP status codes to appropriate ErrorCode values
 * Extracts error message from response body when available
 */
export async function normalizeHttpError(
  response: Response,
  provider: string,
  modality: Modality
): Promise<UPPError> {
  const code = statusToErrorCode(response.status);
  let message = `HTTP ${response.status}: ${response.statusText}`;

  try {
    const body = await response.text();
    if (body) {
      try {
        const json = JSON.parse(body);
        // Common error message locations across providers
        const extractedMessage =
          json.error?.message ||
          json.message ||
          json.error?.error?.message ||
          json.detail;

        if (extractedMessage) {
          message = extractedMessage;
        }
      } catch {
        // Body is not JSON, use raw text if short
        if (body.length < 200) {
          message = body;
        }
      }
    }
  } catch {
    // Failed to read body, use default message
  }

  return new UPPError(message, code, provider, modality, response.status);
}

/**
 * Create a network error
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
 * Create a timeout error
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
 * Create a cancelled error
 */
export function cancelledError(provider: string, modality: Modality): UPPError {
  return new UPPError('Request was cancelled', 'CANCELLED', provider, modality);
}
