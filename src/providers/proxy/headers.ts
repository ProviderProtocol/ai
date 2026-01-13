/**
 * @fileoverview Header merging utilities for proxy provider.
 *
 * @module providers/proxy/headers
 */

/**
 * Merge request headers with provider default headers.
 */
export function mergeHeaders(
  requestHeaders: Record<string, string | undefined> | undefined,
  defaultHeaders: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = { ...defaultHeaders };
  if (requestHeaders) {
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }
  }
  return headers;
}
