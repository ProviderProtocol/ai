import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';
import { createEmbeddingHandler } from './embed.ts';
import { cache } from './cache.ts';

const baseProvider = createProvider({
  name: 'google',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
  },
});

/**
 * Google Gemini provider for the Unified Provider Protocol (UPP).
 *
 * Provides access to Google's Gemini family of large language models through
 * a standardized interface. Supports text generation, multimodal inputs
 * (images, video, audio), tool/function calling, and structured output.
 *
 * @example
 * ```typescript
 * import { google } from './providers/google';
 *
 * // Create a model instance
 * const gemini = google.llm.bind('gemini-1.5-pro');
 *
 * // Simple completion
 * const response = await gemini.complete({
 *   messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello!' }] }],
 *   config: { apiKey: process.env.GOOGLE_API_KEY },
 * });
 *
 * // Streaming completion
 * const stream = gemini.stream({
 *   messages: [{ role: 'user', content: [{ type: 'text', text: 'Tell me a story' }] }],
 *   config: { apiKey: process.env.GOOGLE_API_KEY },
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === 'text_delta') {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 *
 * @example Caching
 * ```typescript
 * // Create a cache for repeated context
 * const cacheEntry = await google.cache.create({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   model: 'gemini-3-flash-preview',
 *   systemInstruction: 'You are an expert code reviewer...',
 *   contents: [{ role: 'user', parts: [{ text: largeCodebase }] }],
 *   ttl: '3600s',
 * });
 *
 * // Use cache in requests
 * const response = await gemini.complete({
 *   messages: [userMessage('Review this function')],
 *   config: { apiKey: process.env.GOOGLE_API_KEY },
 *   params: { cachedContent: cacheEntry.name },
 * });
 *
 * // Manage caches
 * await google.cache.update(cacheEntry.name, { ttl: '7200s' }, apiKey);
 * await google.cache.delete(cacheEntry.name, apiKey);
 * ```
 *
 * @see {@link GoogleLLMParams} for provider-specific configuration options
 * @see {@link cache} for caching utilities
 */
export const google = Object.assign(baseProvider, { cache });

export { cache } from './cache.ts';
export { tools } from './types.ts';
export type { CacheCreateOptions, CacheListOptions } from './cache.ts';
export type {
  GoogleLLMParams,
  GoogleCacheCreateRequest,
  GoogleCacheResponse,
  GoogleCacheUpdateRequest,
  GoogleCacheListResponse,
  GoogleHeaders,
  GoogleBuiltInTool,
  GoogleSearchTool,
  GoogleCodeExecutionTool,
  GoogleUrlContextTool,
  GoogleMapsTool,
  GoogleFileSearchTool,
  GoogleToolConfig,
  GoogleGroundingMetadata,
  GoogleCodeExecutionResult,
} from './types.ts';

export type { GoogleEmbedParams, GoogleTaskType } from './embed.ts';
