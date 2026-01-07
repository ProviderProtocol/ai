/**
 * @fileoverview ID generation utilities for the Universal Provider Protocol.
 *
 * Provides functions for generating unique identifiers used throughout UPP,
 * including message IDs, tool call IDs, and other internal references.
 *
 * @module utils/id
 */

/**
 * Generates a unique UUID v4 identifier.
 *
 * Uses the native `crypto.randomUUID()` when available for cryptographically
 * secure randomness. Falls back to a Math.random-based implementation for
 * environments without Web Crypto API support.
 *
 * @returns A UUID v4 string in the format `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
 *
 * @example
 * ```typescript
 * const messageId = generateId();
 * // => "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 * ```
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a short alphanumeric identifier.
 *
 * Creates a 12-character random string using alphanumeric characters (a-z, A-Z, 0-9).
 * Useful for tool call IDs and other cases where a full UUID is not required.
 *
 * @param prefix - Optional prefix to prepend to the generated ID
 * @returns A string containing the prefix followed by 12 random alphanumeric characters
 *
 * @example
 * ```typescript
 * const toolCallId = generateShortId('call_');
 * // => "call_aB3xY9mK2pQr"
 *
 * const simpleId = generateShortId();
 * // => "Tz4wN8vL1sHj"
 * ```
 */
export function generateShortId(prefix = ''): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = prefix;
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
