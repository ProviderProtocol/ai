/**
 * @fileoverview Error normalization utilities.
 *
 * @module utils/error
 */

import { ErrorCode, UPPError } from '../types/errors.ts';

/**
 * Converts an unknown thrown value into an Error instance.
 *
 * @param value - Unknown error value
 * @returns An Error instance
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') {
      return new Error(message);
    }
  }
  return new Error(String(value));
}

/**
 * Checks whether an error represents a cancellation.
 *
 * @param value - Unknown error value
 * @returns True if the error indicates cancellation
 */
export function isCancelledError(value: unknown): boolean {
  if (value instanceof UPPError) {
    return value.code === ErrorCode.Cancelled;
  }

  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    return name === 'AbortError';
  }

  return false;
}
