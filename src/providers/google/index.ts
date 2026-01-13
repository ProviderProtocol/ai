import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';
import { createEmbeddingHandler } from './embed.ts';
import { createImageHandler } from './image.ts';
import { cache } from './cache.ts';

const baseProvider = createProvider({
  name: 'google',
  version: '1.0.0',
  handlers: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
    image: createImageHandler(),
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
 * import { llm } from './core/llm';
 * import { StreamEventType } from './types/stream';
 *
 * const gemini = llm({
 *   model: google('gemini-1.5-pro'),
 *   config: { apiKey: process.env.GOOGLE_API_KEY },
 * });
 *
 * const turn = await gemini.generate('Hello!');
 * console.log(turn.response.text);
 *
 * const stream = gemini.stream('Tell me a story');
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text ?? '');
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
 * const cachedModel = llm({
 *   model: google('gemini-3-flash-preview'),
 *   config: { apiKey: process.env.GOOGLE_API_KEY },
 *   params: { cachedContent: cacheEntry.name },
 * });
 *
 * const response = await cachedModel.generate('Review this function');
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
  GoogleResponseModality,
  GoogleImageConfig,
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

export type { GoogleImagenParams } from './image.ts';
