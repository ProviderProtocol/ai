/**
 * @fileoverview Groq Provider Factory
 *
 * This module provides the main Groq provider implementation for the
 * OpenAI-compatible Chat Completions API.
 *
 * @module providers/groq
 */

import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Configuration options for the Groq provider.
 *
 * Currently Groq only supports one API endpoint (Chat Completions),
 * so no additional options are needed.
 */
export interface GroqProviderOptions {
  // Reserved for future use (e.g., if Groq adds multiple API modes)
}

/**
 * The Groq provider instance.
 *
 * Use this provider to create model references for Groq models like
 * Llama 3.3, Llama 3.1, Gemma 2, and other models available on Groq.
 *
 * @example Basic usage
 * ```typescript
 * import { groq } from './providers/groq';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: groq('llama-3.3-70b-versatile'),
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
 * @example With tools
 * ```typescript
 * const calculator = {
 *   name: 'calculate',
 *   description: 'Calculate a math expression',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       expression: { type: 'string' }
 *     },
 *     required: ['expression']
 *   },
 *   run: async (params: { expression: string }) => {
 *     return eval(params.expression);
 *   }
 * };
 *
 * const model = llm({
 *   model: groq('llama-3.3-70b-versatile'),
 *   tools: [calculator]
 * });
 *
 * const turn = await model.generate('What is 15 + 27?');
 * ```
 *
 * @example Available models
 * Production models:
 * - `llama-3.3-70b-versatile` - Versatile model with tool use support
 * - `llama-3.1-8b-instant` - Fast, efficient model
 * - `llama-guard-4-12b` - Content moderation model
 * - `gemma2-9b-it` - Google's Gemma 2 model
 *
 * Preview models:
 * - `meta-llama/llama-4-scout-17b-16e-instruct` - Vision + tool use
 * - `qwen/qwen3-32b` - Qwen 3 model
 */
export const groq = createProvider<GroqProviderOptions>({
  name: 'groq',
  version: '1.0.0',
  handlers: {
    llm: createLLMHandler(),
  },
});

export type {
  GroqLLMParams,
  GroqHeaders,
  GroqResponseFormat,
  GroqMessage,
  GroqRequest,
  GroqResponse,
  GroqStreamChunk,
  GroqTool,
  GroqToolCall,
  GroqToolChoice,
  GroqUsage,
  GroqSearchSettings,
  GroqDocument,
  GroqCitationOptions,
} from './types.ts';
