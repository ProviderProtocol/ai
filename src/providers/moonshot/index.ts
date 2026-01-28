/**
 * @fileoverview Moonshot Provider Factory
 *
 * This module provides the main Moonshot provider implementation for the
 * OpenAI-compatible Chat Completions API.
 *
 * @module providers/moonshot
 */

import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Configuration options for the Moonshot provider.
 *
 * Currently Moonshot only supports one API endpoint (Chat Completions),
 * so no additional options are needed.
 */
export interface MoonshotProviderOptions {
  // Reserved for future use
}

/**
 * The Moonshot provider instance.
 *
 * Use this provider to create model references for Moonshot models like
 * Kimi K2.5 and other models available on the Moonshot AI platform.
 *
 * @example Basic usage
 * ```typescript
 * import { moonshot } from './providers/moonshot';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: moonshot('kimi-k2.5'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example With streaming
 * ```typescript
 * const stream = model.stream('Tell me a story');
 *
 * for await (const event of stream) {
 *   if (event.type === StreamEventType.TextDelta) {
 *     process.stdout.write(event.delta.text ?? '');
 *   }
 * }
 *
 * const turn = await stream.turn;
 * console.log('Tokens used:', turn.usage.totalTokens);
 * ```
 *
 * @example With thinking mode (default for K2.5)
 * ```typescript
 * const model = llm({
 *   model: moonshot('kimi-k2.5'),
 *   params: {
 *     max_tokens: 2000,
 *     temperature: 1.0,  // Recommended for thinking mode
 *     thinking: { type: 'enabled' }  // Default
 *   }
 * });
 *
 * // Response includes reasoning_content in metadata
 * const turn = await model.generate('Solve this step by step: 2x + 5 = 13');
 * ```
 *
 * @example With instant mode (disabled thinking)
 * ```typescript
 * const model = llm({
 *   model: moonshot('kimi-k2.5'),
 *   params: {
 *     max_tokens: 1000,
 *     temperature: 0.6,  // Recommended for instant mode
 *     thinking: { type: 'disabled' }
 *   }
 * });
 * ```
 *
 * @example With vision (image input)
 * ```typescript
 * import { Image } from './core/media/Image';
 *
 * const image = await Image.fromPath('./photo.png');
 * const turn = await model.generate([
 *   image.toBlock(),
 *   { type: 'text', text: 'Describe this image' }
 * ]);
 * ```
 *
 * @example Available models
 * Production models:
 * - `kimi-k2.5` - Latest K2.5 with 256K context, vision, thinking mode
 *
 * Environment variables:
 * - `MOONSHOT_API_KEY` - Primary API key
 * - `KIMI_API_KEY` - Fallback API key
 */
export const moonshot = createProvider<MoonshotProviderOptions>({
  name: 'moonshot',
  version: '1.0.0',
  handlers: {
    llm: createLLMHandler(),
  },
});

export { tools } from './types.ts';
export type {
  MoonshotLLMParams,
  MoonshotHeaders,
  MoonshotResponseFormat,
  MoonshotMessage,
  MoonshotRequest,
  MoonshotResponse,
  MoonshotStreamChunk,
  MoonshotTool,
  MoonshotToolCall,
  MoonshotToolChoice,
  MoonshotUsage,
  MoonshotThinkingConfig,
} from './types.ts';
