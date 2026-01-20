/**
 * @fileoverview Cerebras Provider Factory
 *
 * This module provides the main Cerebras provider implementation for the
 * OpenAI-compatible Chat Completions API. Cerebras offers extremely fast
 * inference with models like Llama, Qwen, and their reasoning models.
 *
 * @module providers/cerebras
 */

import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Configuration options for the Cerebras provider.
 *
 * Currently Cerebras only supports one API endpoint (Chat Completions),
 * so no additional options are needed.
 */
export interface CerebrasProviderOptions {
  // Reserved for future use (e.g., if Cerebras adds multiple API modes)
}

/**
 * The Cerebras provider instance.
 *
 * Use this provider to create model references for Cerebras models like
 * Llama 3.3, Qwen 3, GPT-OSS (reasoning), and other models available on Cerebras.
 *
 * @example Basic usage
 * ```typescript
 * import { cerebras } from './providers/cerebras';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: cerebras('llama-3.3-70b'),
 *   params: { max_completion_tokens: 1000 }
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
 *   model: cerebras('llama-3.3-70b'),
 *   tools: [calculator]
 * });
 *
 * const turn = await model.generate('What is 15 + 27?');
 * ```
 *
 * @example With reasoning
 * ```typescript
 * const model = llm({
 *   model: cerebras('gpt-oss-120b'),
 *   params: {
 *     reasoning_effort: 'high',
 *     reasoning_format: 'parsed'
 *   }
 * });
 *
 * const turn = await model.generate('Solve this complex math problem...');
 * // Reasoning is available in turn.response.metadata.cerebras.reasoning
 * ```
 *
 * @example Available models
 * Production models:
 * - `llama3.1-8b` - Fast Llama 3.1 8B model (~2200 tok/s)
 * - `llama-3.3-70b` - Llama 3.3 70B with tool use (~2100 tok/s)
 * - `qwen-3-32b` - Qwen 3 32B with reasoning support (~2600 tok/s)
 * - `qwen-3-235b-a22b-instruct-2507` - Large Qwen model (~1400 tok/s)
 * - `gpt-oss-120b` - Reasoning model with high performance (~3000 tok/s)
 * - `zai-glm-4.6` - Z.ai GLM model with reasoning (~1000 tok/s)
 * - `zai-glm-4.7` - Z.ai GLM model with reasoning (~1000 tok/s)
 */
export const cerebras = createProvider<CerebrasProviderOptions>({
  name: 'cerebras',
  version: '1.0.0',
  handlers: {
    llm: createLLMHandler(),
  },
});

export type {
  CerebrasLLMParams,
  CerebrasHeaders,
  CerebrasResponseFormat,
  CerebrasMessage,
  CerebrasRequest,
  CerebrasResponse,
  CerebrasStreamChunk,
  CerebrasTool,
  CerebrasToolCall,
  CerebrasToolChoice,
  CerebrasUsage,
  CerebrasTimeInfo,
} from './types.ts';
