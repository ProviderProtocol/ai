/**
 * Cerebras provider for UPP (Unified Provider Protocol)
 *
 * This module exports the Cerebras provider for use with Llama, Qwen, GPT-OSS,
 * and other models available through Cerebras's ultra-fast inference platform.
 *
 * @example
 * ```ts
 * import { cerebras } from '@providerprotocol/ai/cerebras';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with Llama
 * const model = llm({
 *   model: cerebras('llama-3.3-70b'),
 *   params: { max_completion_tokens: 1000 }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('What is the meaning of life?');
 * console.log(turn.response.text);
 * ```
 *
 * @example With reasoning
 * ```ts
 * // Use GPT-OSS with reasoning support
 * const model = llm({
 *   model: cerebras('gpt-oss-120b'),
 *   params: {
 *     reasoning_effort: 'high',
 *     reasoning_format: 'parsed'
 *   }
 * });
 *
 * const turn = await model.generate('Solve this complex problem...');
 * // Reasoning available in turn.response.metadata.cerebras.reasoning
 * ```
 *
 * @packageDocumentation
 */

export { cerebras } from '../providers/cerebras/index.ts';
export type { CerebrasProviderOptions } from '../providers/cerebras/index.ts';
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
} from '../providers/cerebras/types.ts';
