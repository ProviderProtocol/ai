/**
 * @fileoverview Unified Provider Protocol (UPP) - A unified interface for AI model inference
 *
 * UPP provides a consistent API for interacting with multiple AI providers including
 * Anthropic, OpenAI, Google, Ollama, OpenRouter, and xAI. The library handles provider-specific
 * transformations, streaming, tool execution, and error handling.
 *
 * @example Basic usage
 * ```typescript
 * import { llm, anthropic } from '@providerprotocol/ai';
 *
 * const model = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Streaming
 * ```typescript
 * for await (const event of model.stream('Tell me a story')) {
 *   if (event.type === 'text') {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 *
 * @module @providerprotocol/ai
 * @packageDocumentation
 */

/** LLM instance factory for creating model-bound inference functions */
export { llm } from './core/llm.ts';

/** Factory for creating custom providers */
export { createProvider } from './core/provider.ts';

/** Image content wrapper for multimodal inputs */
export { Image } from './core/image.ts';

import { llm } from './core/llm.ts';

/**
 * UPP namespace object providing alternative import style.
 *
 * @example
 * ```typescript
 * import { ai } from '@providerprotocol/ai';
 *
 * const model = ai.llm({
 *   model: openai('gpt-4o'),
 *   params: { max_tokens: 1000 }
 * });
 * ```
 */
export const ai = {
  /** LLM instance factory */
  llm,
};

export * from './types/index.ts';

export {
  RoundRobinKeys,
  WeightedKeys,
  DynamicKey,
  ExponentialBackoff,
  LinearBackoff,
  NoRetry,
  TokenBucket,
  RetryAfterStrategy,
} from './http/index.ts';
