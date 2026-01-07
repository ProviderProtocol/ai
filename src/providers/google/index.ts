import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

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
 * @see {@link GoogleLLMParams} for provider-specific configuration options
 */
export const google = createProvider({
  name: 'google',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

export type { GoogleLLMParams } from './types.ts';
