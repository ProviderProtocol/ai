/**
 * @fileoverview Vertex AI Gemini caching utilities.
 *
 * Provides functions for creating and managing cached content entries
 * that can be reused across multiple Vertex AI Gemini requests to reduce
 * costs and latency for repeated context.
 *
 * Vertex AI caching requires OAuth authentication (access token) and uses
 * regional endpoints. The cache API is only available for Gemini models.
 *
 * @see {@link https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview Vertex AI Context Caching}
 * @module providers/vertex/cache
 */

import type {
  VertexCacheCreateRequest,
  VertexCacheResponse,
  VertexCacheUpdateRequest,
  VertexCacheListResponse,
  VertexGeminiContent,
  VertexGeminiTool,
  VertexGeminiToolConfig,
} from './types.ts';
import { normalizeHttpError } from '../../http/errors.ts';

/**
 * Options for creating a Vertex AI cached content entry.
 */
export interface VertexCacheCreateOptions {
  /** OAuth access token for authentication */
  accessToken: string;
  /** Google Cloud project ID */
  projectId: string;
  /** Google Cloud region (e.g., 'us-central1') */
  location: string;
  /** Model to associate with this cache (e.g., "gemini-2.5-flash") */
  model: string;
  /** Optional display name for the cache (max 128 chars) */
  displayName?: string;
  /** Content messages to cache */
  contents?: VertexGeminiContent[];
  /** System instruction text to cache */
  systemInstruction?: string;
  /** Tool declarations to cache */
  tools?: VertexGeminiTool[];
  /** Tool configuration to cache */
  toolConfig?: VertexGeminiToolConfig;
  /** Time-to-live duration (e.g., "3600s" for 1 hour) */
  ttl?: string;
  /** Absolute expiration time (RFC 3339 format, alternative to ttl) */
  expireTime?: string;
}

/**
 * Options for listing Vertex AI cached content entries.
 */
export interface VertexCacheListOptions {
  /** OAuth access token for authentication */
  accessToken: string;
  /** Google Cloud project ID */
  projectId: string;
  /** Google Cloud region (e.g., 'us-central1') */
  location: string;
  /** Maximum number of caches to return per page */
  pageSize?: number;
  /** Token for fetching the next page of results */
  pageToken?: string;
}

/**
 * Options for cache operations requiring cache name.
 */
export interface VertexCacheOptions {
  /** OAuth access token for authentication */
  accessToken: string;
  /** Google Cloud project ID */
  projectId: string;
  /** Google Cloud region (e.g., 'us-central1') */
  location: string;
}

/**
 * Builds the Vertex AI cache API base URL.
 * Global location uses the base endpoint, regional uses location-prefixed endpoint.
 */
function buildCacheBaseUrl(projectId: string, location: string): string {
  const baseHost = location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
  return `https://${baseHost}/v1/projects/${projectId}/locations/${location}/cachedContents`;
}

/**
 * Normalizes a cache name to just the ID portion.
 */
function extractCacheId(name: string): string {
  // Handle full resource names: projects/.../locations/.../cachedContents/xxx
  const match = name.match(/cachedContents\/([^/]+)$/);
  if (match?.[1]) {
    return match[1];
  }
  // Already just an ID
  return name;
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
 * import { vertex } from '@providerprotocol/ai/vertex';
 *
 * // Create a cache with system instruction and large context
 * const cache = await vertex.cache.create({
 *   accessToken: process.env.GOOGLE_ACCESS_TOKEN,
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   model: 'gemini-2.5-flash',
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
export async function create(options: VertexCacheCreateOptions): Promise<VertexCacheResponse> {
  const {
    accessToken,
    projectId,
    location,
    model,
    displayName,
    contents,
    systemInstruction,
    tools,
    toolConfig,
    ttl,
    expireTime,
  } = options;

  const baseUrl = buildCacheBaseUrl(projectId, location);

  // Build the model resource name
  const modelName = model.includes('/')
    ? model
    : `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;

  const requestBody: VertexCacheCreateRequest = {
    model: modelName,
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

  if (toolConfig) {
    requestBody.toolConfig = toolConfig;
  }

  if (ttl) {
    requestBody.ttl = ttl;
  } else if (expireTime) {
    requestBody.expireTime = expireTime;
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw await normalizeHttpError(response, 'vertex', 'llm');
  }

  return response.json() as Promise<VertexCacheResponse>;
}

/**
 * Retrieves a cached content entry by name.
 *
 * @param name - The cache name (format: "projects/.../cachedContents/{id}" or just "{id}")
 * @param options - Authentication and project options
 * @returns The cache entry details
 *
 * @example
 * ```typescript
 * const cache = await vertex.cache.get('abc123xyz', {
 *   accessToken,
 *   projectId: 'my-project',
 *   location: 'us-central1',
 * });
 * console.log(`Cache expires at: ${cache.expireTime}`);
 * ```
 */
export async function get(name: string, options: VertexCacheOptions): Promise<VertexCacheResponse> {
  const { accessToken, projectId, location } = options;
  const cacheId = extractCacheId(name);
  const url = `${buildCacheBaseUrl(projectId, location)}/${cacheId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw await normalizeHttpError(response, 'vertex', 'llm');
  }

  return response.json() as Promise<VertexCacheResponse>;
}

/**
 * Lists all cached content entries.
 *
 * @param options - List options including authentication and pagination
 * @returns Array of cache entries and optional next page token
 *
 * @example
 * ```typescript
 * const { cachedContents, nextPageToken } = await vertex.cache.list({
 *   accessToken,
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   pageSize: 10,
 * });
 *
 * for (const cache of cachedContents ?? []) {
 *   console.log(`${cache.displayName}: ${cache.name}`);
 * }
 * ```
 */
export async function list(options: VertexCacheListOptions): Promise<VertexCacheListResponse> {
  const { accessToken, projectId, location, pageSize, pageToken } = options;

  const baseUrl = buildCacheBaseUrl(projectId, location);
  const params = new URLSearchParams();
  if (pageSize) params.set('pageSize', String(pageSize));
  if (pageToken) params.set('pageToken', pageToken);

  const url = params.toString() ? `${baseUrl}?${params}` : baseUrl;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw await normalizeHttpError(response, 'vertex', 'llm');
  }

  return response.json() as Promise<VertexCacheListResponse>;
}

/**
 * Updates a cached content entry's expiration time.
 *
 * Only the expiration time can be updated; all other fields
 * (contents, systemInstruction, tools) are immutable after creation.
 *
 * @param name - The cache name (format: "projects/.../cachedContents/{id}" or just "{id}")
 * @param update - The update to apply (ttl or expireTime)
 * @param options - Authentication and project options
 * @returns The updated cache entry
 *
 * @example
 * ```typescript
 * // Extend cache expiration by 2 hours
 * const updated = await vertex.cache.update(
 *   'abc123xyz',
 *   { ttl: '7200s' },
 *   { accessToken, projectId: 'my-project', location: 'us-central1' }
 * );
 * ```
 */
export async function update(
  name: string,
  updateRequest: VertexCacheUpdateRequest,
  options: VertexCacheOptions
): Promise<VertexCacheResponse> {
  const { accessToken, projectId, location } = options;
  const cacheId = extractCacheId(name);
  const url = `${buildCacheBaseUrl(projectId, location)}/${cacheId}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(updateRequest),
  });

  if (!response.ok) {
    throw await normalizeHttpError(response, 'vertex', 'llm');
  }

  return response.json() as Promise<VertexCacheResponse>;
}

/**
 * Deletes a cached content entry.
 *
 * @param name - The cache name (format: "projects/.../cachedContents/{id}" or just "{id}")
 * @param options - Authentication and project options
 *
 * @example
 * ```typescript
 * await vertex.cache.delete('abc123xyz', {
 *   accessToken,
 *   projectId: 'my-project',
 *   location: 'us-central1',
 * });
 * ```
 */
async function deleteCache(name: string, options: VertexCacheOptions): Promise<void> {
  const { accessToken, projectId, location } = options;
  const cacheId = extractCacheId(name);
  const url = `${buildCacheBaseUrl(projectId, location)}/${cacheId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw await normalizeHttpError(response, 'vertex', 'llm');
  }
}

/**
 * Cache utilities namespace.
 *
 * Provides functions for creating and managing Vertex AI Gemini cached content
 * entries. Use cached content to reduce costs and latency when repeatedly
 * sending the same context (system instructions, large documents, etc.)
 * across multiple requests.
 *
 * Vertex AI caching provides up to 90% discount on cached tokens and works
 * with all Gemini 2.5+ and 3.x models.
 *
 * @example
 * ```typescript
 * import { vertex } from '@providerprotocol/ai/vertex';
 *
 * const cacheOptions = {
 *   accessToken: process.env.GOOGLE_ACCESS_TOKEN,
 *   projectId: 'my-project',
 *   location: 'us-central1',
 * };
 *
 * // Create a cache
 * const cache = await vertex.cache.create({
 *   ...cacheOptions,
 *   model: 'gemini-2.5-flash',
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
 * const caches = await vertex.cache.list(cacheOptions);
 * await vertex.cache.update(cache.name, { ttl: '7200s' }, cacheOptions);
 * await vertex.cache.delete(cache.name, cacheOptions);
 * ```
 */
export const cache = {
  create,
  get,
  list,
  update,
  delete: deleteCache,
};
