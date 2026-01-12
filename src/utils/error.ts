/**
 * @fileoverview Error normalization utilities.
 *
 * @module utils/error
 */

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
