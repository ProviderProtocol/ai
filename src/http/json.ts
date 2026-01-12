/**
 * @fileoverview JSON response parsing utilities.
 *
 * @module http/json
 */

import { ErrorCode, UPPError, type Modality } from '../types/errors.ts';
import { toError } from '../utils/error.ts';

/**
 * Parses a JSON response body with normalized error handling.
 *
 * @typeParam T - Expected JSON shape
 * @param response - Fetch response to parse
 * @param provider - Provider identifier for error context
 * @param modality - Modality for error context
 * @returns Parsed JSON object
 * @throws {UPPError} INVALID_RESPONSE when JSON parsing fails or body is empty
 */
export async function parseJsonResponse<T>(
  response: Response,
  provider: string,
  modality: Modality
): Promise<T> {
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    const cause = toError(error);
    throw new UPPError(
      'Failed to read response body',
      ErrorCode.InvalidResponse,
      provider,
      modality,
      response.status,
      cause
    );
  }

  if (!bodyText) {
    throw new UPPError(
      'Empty response body',
      ErrorCode.InvalidResponse,
      provider,
      modality,
      response.status
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (error) {
    const cause = toError(error);
    throw new UPPError(
      'Failed to parse JSON response',
      ErrorCode.InvalidResponse,
      provider,
      modality,
      response.status,
      cause
    );
  }
}
