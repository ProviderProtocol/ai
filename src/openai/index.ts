/**
 * OpenAI provider for UPP (Unified Provider Protocol)
 *
 * This module exports the OpenAI provider for use with GPT models.
 * Supports both the modern Responses API (default) and the legacy
 * Chat Completions API.
 *
 * @example Basic usage with Responses API (recommended)
 * ```ts
 * import { openai } from '@providerprotocol/ai/openai';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with GPT-4o
 * const model = llm({
 *   model: openai('gpt-4o'),
 *   params: { max_output_tokens: 1000 }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('Explain recursion.');
 * console.log(turn.response.text);
 * ```
 *
 * @example Using Chat Completions API
 * ```ts
 * const legacyModel = llm({
 *   model: openai('gpt-4o', { api: 'completions' }),
 *   params: { max_tokens: 1000 }
 * });
 * ```
 *
 * @example With built-in tools (Responses API only)
 * ```ts
 * import { openai, tools } from '@providerprotocol/ai/openai';
 *
 * const model = llm({
 *   model: openai('gpt-4o'),
 *   params: {
 *     tools: [tools.webSearch(), tools.imageGeneration()]
 *   }
 * });
 * ```
 *
 * @packageDocumentation
 */

export {
  openai,
  tools,
  webSearchTool,
  fileSearchTool,
  codeInterpreterTool,
  computerTool,
  imageGenerationTool,
  mcpTool,
} from '../providers/openai/index.ts';
export type {
  OpenAICompletionsParams,
  OpenAIResponsesParams,
  OpenAIConfig,
  OpenAIAPIMode,
  OpenAIModelOptions,
  OpenAIModelReference,
  OpenAIAudioConfig,
  OpenAIWebSearchOptions,
  OpenAIWebSearchUserLocation,
  OpenAICompletionsWebSearchUserLocation,
  OpenAIBuiltInTool,
  OpenAIWebSearchTool,
  OpenAIFileSearchTool,
  OpenAICodeInterpreterTool,
  OpenAICodeInterpreterContainer,
  OpenAIComputerTool,
  OpenAIComputerEnvironment,
  OpenAIImageGenerationTool,
  OpenAIMcpTool,
  OpenAIMcpServerConfig,
  OpenAIResponsesToolUnion,
  OpenAIConversation,
  OpenAIPromptTemplate,
  OpenAIEmbedParams,
} from '../providers/openai/index.ts';
