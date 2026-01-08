/**
 * xAI provider for UPP (Unified Provider Protocol)
 *
 * This module exports the xAI provider for use with the Grok family of models.
 * xAI's APIs are compatible with both OpenAI and Anthropic SDKs.
 *
 * @example
 * ```ts
 * import { xai } from '@providerprotocol/ai/xai';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with Grok
 * const model = llm({
 *   model: xai('grok-4'),
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

export { xai, tools } from '../providers/xai/index.ts';
export type {
  XAIProviderOptions,
  XAIProvider,
} from '../providers/xai/index.ts';
export type {
  XAICompletionsParams,
  XAIResponsesParams,
  XAIMessagesParams,
  XAIConfig,
  XAIAPIMode,
  XAIModelOptions,
  XAIModelReference,
  XAISearchParameters,
  XAIAgentTool,
  XAIHeaders,
  XAIBuiltInTool,
  XAIWebSearchTool,
  XAIXSearchTool,
  XAICodeExecutionTool,
  XAIFileSearchTool,
  XAIMcpTool,
  XAIServerSideToolUsage,
} from '../providers/xai/types.ts';
