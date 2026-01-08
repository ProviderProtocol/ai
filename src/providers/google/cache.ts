/**
 * @fileoverview Google Gemini caching utilities.
 *
 * Provides functions for creating and managing cached content entries
 * that can be reused across multiple Gemini API requests to reduce
 * costs and latency for repeated context.
 *
 * @see {@link https://ai.google.dev/api/caching Google Caching API docs}
 * @module providers/google/cache
 */

import type {
  GoogleCacheCreateRequest,
  GoogleCacheResponse,
  GoogleCacheUpdateRequest,
  GoogleCacheListResponse,
  GoogleContent,
  GoogleTool,
} from './types.ts';

const CACHE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/cachedContents';

/**
 * Options for creating a cached content entry.
 */
export interface CacheCreateOptions {
  /** API key for authentication */
  apiKey: string;
  /** Model to associate with this cache (e.g., "gemini-3-flash-preview") */
  model: string;
  /** Optional display name for the cache (max 128 chars) */
  displayName?: string;
  /** Content messages to cache */
  contents?: GoogleContent[];
  /** System instruction text to cache */
  systemInstruction?: string;
  /** Tool declarations to cache */
  tools?: GoogleTool[];
  /** Time-to-live duration (e.g., "3600s" for 1 hour) */
  ttl?: string;
  /** Absolute expiration time (RFC 3339 format, alternative to ttl) */
  expireTime?: string;
}

/**
 * Options for listing cached content entries.
 */
export interface CacheListOptions {
  /** API key for authentication */
  apiKey: string;
  /** Maximum number of caches to return per page */
  pageSize?: number;
  /** Token for fetching the next page of results */
  pageToken?: string;
}

/**
 * Creates a new cached content entry.
 *
 * Caches can contain system instructions, conversation content, and tool
 * declarations that are reused across multiple requests. This reduces
 * token costs and processing time for repeated context.
 *
 * @param options - Cache creation options
 * @returns The created cache entry with its name/ID for use in requests
 *
 * @example
 * ```typescript
 * import { google } from '@anthropic/provider-protocol';
 *
 * // Create a cache with system instruction and large context
 * const cache = await google.cache.create({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   model: 'gemini-3-flash-preview',
 *   displayName: 'Code Review Context',
 *   systemInstruction: 'You are an expert code reviewer...',
 *   contents: [
 *     { role: 'user', parts: [{ text: largeCodebaseContent }] }
 *   ],
 *   ttl: '3600s', // 1 hour
 * });
 *
 * // Use the cache in subsequent requests
 * const response = await model.complete({
 *   messages: [userMessage('Review this function')],
 *   params: { cachedContent: cache.name },
 * });
 * ```
 */
export async function create(options: CacheCreateOptions): Promise<GoogleCacheResponse> {
  const {
    apiKey,
    model,
    displayName,
    contents,
    systemInstruction,
    tools,
    ttl,
    expireTime,
  } = options;

  const requestBody: GoogleCacheCreateRequest = {
    model: model.startsWith('models/') ? model : `models/${model}`,
  };

  if (displayName) {
    requestBody.displayName = displayName;
  }

  if (contents && contents.length > 0) {
    requestBody.contents = contents;
  }

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  if (ttl) {
    requestBody.ttl = ttl;
  } else if (expireTime) {
    requestBody.expireTime = expireTime;
  }

  const response = await fetch(`${CACHE_API_BASE}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create cache: ${response.status} ${error}`);
  }

  return response.json() as Promise<GoogleCacheResponse>;
}

/**
 * Retrieves a cached content entry by name.
 *
 * @param name - The cache name (format: "cachedContents/{id}")
 * @param apiKey - API key for authentication
 * @returns The cache entry details
 *
 * @example
 * ```typescript
 * const cache = await google.cache.get('cachedContents/abc123', apiKey);
 * console.log(`Cache expires at: ${cache.expireTime}`);
 * ```
 */
export async function get(name: string, apiKey: string): Promise<GoogleCacheResponse> {
  const cacheName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}`;

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get cache: ${response.status} ${error}`);
  }

  return response.json() as Promise<GoogleCacheResponse>;
}

/**
 * Lists all cached content entries.
 *
 * @param options - List options including API key and pagination
 * @returns Array of cache entries and optional next page token
 *
 * @example
 * ```typescript
 * const { cachedContents, nextPageToken } = await google.cache.list({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   pageSize: 10,
 * });
 *
 * for (const cache of cachedContents ?? []) {
 *   console.log(`${cache.displayName}: ${cache.name}`);
 * }
 * ```
 */
export async function list(options: CacheListOptions): Promise<GoogleCacheListResponse> {
  const { apiKey, pageSize, pageToken } = options;

  const params = new URLSearchParams({ key: apiKey });
  if (pageSize) params.set('pageSize', String(pageSize));
  if (pageToken) params.set('pageToken', pageToken);

  const response = await fetch(`${CACHE_API_BASE}?${params}`, { method: 'GET' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list caches: ${response.status} ${error}`);
  }

  return response.json() as Promise<GoogleCacheListResponse>;
}

/**
 * Updates a cached content entry's expiration time.
 *
 * Only the expiration time can be updated; all other fields
 * (contents, systemInstruction, tools) are immutable after creation.
 *
 * @param name - The cache name (format: "cachedContents/{id}")
 * @param update - The update to apply (ttl or expireTime)
 * @param apiKey - API key for authentication
 * @returns The updated cache entry
 *
 * @example
 * ```typescript
 * // Extend cache expiration by 2 hours
 * const updated = await google.cache.update(
 *   'cachedContents/abc123',
 *   { ttl: '7200s' },
 *   apiKey
 * );
 * ```
 */
export async function update(
  name: string,
  updateRequest: GoogleCacheUpdateRequest,
  apiKey: string
): Promise<GoogleCacheResponse> {
  const cacheName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update cache: ${response.status} ${error}`);
  }

  return response.json() as Promise<GoogleCacheResponse>;
}

/**
 * Deletes a cached content entry.
 *
 * @param name - The cache name (format: "cachedContents/{id}")
 * @param apiKey - API key for authentication
 *
 * @example
 * ```typescript
 * await google.cache.delete('cachedContents/abc123', apiKey);
 * ```
 */
async function deleteCache(name: string, apiKey: string): Promise<void> {
  const cacheName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}`;

  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete cache: ${response.status} ${error}`);
  }
}

/**
 * Cache utilities namespace.
 *
 * Provides functions for creating and managing Google Gemini cached content
 * entries. Use cached content to reduce costs and latency when repeatedly
 * sending the same context (system instructions, large documents, etc.)
 * across multiple requests.
 *
 * @example
 * ```typescript
 * import { google } from '@anthropic/provider-protocol';
 *
 * // Create a cache
 * const cache = await google.cache.create({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   model: 'gemini-3-flash-preview',
 *   systemInstruction: 'You are an expert assistant...',
 *   contents: [{ role: 'user', parts: [{ text: largeDocument }] }],
 *   ttl: '3600s',
 * });
 *
 * // Use cache.name in requests via params.cachedContent
 * const response = await model.complete({
 *   messages: [userMessage('Summarize the document')],
 *   params: { cachedContent: cache.name },
 * });
 *
 * // Manage caches
 * const caches = await google.cache.list({ apiKey });
 * await google.cache.update(cache.name, { ttl: '7200s' }, apiKey);
 * await google.cache.delete(cache.name, apiKey);
 * ```
 */
export const cache = {
  create,
  get,
  list,
  update,
  delete: deleteCache,
};
