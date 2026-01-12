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
  return new Error(String(value));
}
