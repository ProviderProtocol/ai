/**
 * Moonshot provider for UPP (Unified Provider Protocol)
 *
 * This module exports the Moonshot provider for use with Kimi K2.5 and other
 * models available through Moonshot AI's inference platform.
 *
 * @example
 * ```ts
 * import { moonshot } from '@providerprotocol/ai/moonshot';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with Kimi K2.5
 * const model = llm({
 *   model: moonshot('kimi-k2.5'),
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

export { moonshot, tools } from '../providers/moonshot/index.ts';
export type { MoonshotProviderOptions } from '../providers/moonshot/index.ts';
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
} from '../providers/moonshot/types.ts';
