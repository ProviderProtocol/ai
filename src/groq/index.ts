/**
 * Groq provider for UPP (Unified Provider Protocol)
 *
 * This module exports the Groq provider for use with Llama, Gemma, and other
 * models available through Groq's inference platform.
 *
 * @example
 * ```ts
 * import { groq } from '@providerprotocol/ai/groq';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with Llama
 * const model = llm({
 *   model: groq('llama-3.3-70b-versatile'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('What is the meaning of life?');
 * console.log(turn.response.text);
 * ```
 *
 * @packageDocumentation
 */

export { groq } from '../providers/groq/index.ts';
export type { GroqProviderOptions } from '../providers/groq/index.ts';
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
} from '../providers/groq/types.ts';
