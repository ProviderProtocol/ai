/**
 * @fileoverview xAI Provider Factory
 *
 * This module provides the main xAI provider implementation that supports three
 * API modes: Chat Completions (default, OpenAI-compatible), Responses (stateful),
 * and Messages (Anthropic-compatible).
 *
 * @module providers/xai
 */

import type { Provider } from '../../types/provider.ts';
import { createProvider, type LLMHandlerResolver } from '../../core/provider.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createMessagesLLMHandler } from './llm.messages.ts';
import { createImageHandler, type XAIImageParams } from './image.ts';
import type { XAIAPIMode } from './types.ts';

/**
 * Configuration options for creating xAI model references.
 */
export interface XAIProviderOptions {
  /**
   * The API mode to use for this model.
   *
   * - `'completions'`: Chat Completions API (OpenAI-compatible, default, recommended)
   * - `'responses'`: Responses API (OpenAI Responses-compatible, supports stateful conversations)
   * - `'messages'`: Messages API (Anthropic-compatible, for easy migration from Anthropic)
   *
   * @default 'completions'
   */
  api?: XAIAPIMode;
}

/**
 * Type alias for the xAI provider with its options.
 */
export type XAIProvider = Provider<XAIProviderOptions>;

/**
 * xAI provider
 *
 * Supports three API modes:
 * - Chat Completions API (default, OpenAI-compatible)
 * - Responses API (stateful, OpenAI Responses-compatible)
 * - Messages API (Anthropic-compatible)
 *
 * xAI's Grok models support:
 * - Real-time search via Live Search API (deprecated Dec 2025) or Agent Tools API
 * - Reasoning with `reasoning_effort` parameter (for Grok 3 Mini)
 * - Tool/function calling
 * - Image input
 * - Streaming responses
 * - Structured output (JSON mode)
 *
 * @example
 * ```ts
 * import { xai } from './providers/xai';
 * import { llm } from './core/llm';
 *
 * // Using Chat Completions API (default, recommended)
 * const model = llm({
 *   model: xai('grok-4'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Using Responses API (stateful conversations)
 * const statefulModel = llm({
 *   model: xai('grok-4', { api: 'responses' }),
 *   params: {
 *     max_output_tokens: 1000,
 *     store: true, // Enable stateful storage
 *   }
 * });
 *
 * // Continue a previous conversation
 * const continuedModel = llm({
 *   model: xai('grok-4', { api: 'responses' }),
 *   params: {
 *     previous_response_id: 'resp_123...',
 *   }
 * });
 *
 * // Using Messages API (Anthropic-compatible)
 * const anthropicModel = llm({
 *   model: xai('grok-4', { api: 'messages' }),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Using reasoning effort (Grok 3 Mini only)
 * const reasoningModel = llm({
 *   model: xai('grok-3-mini'),
 *   params: {
 *     max_tokens: 1000,
 *     reasoning_effort: 'high', // 'low' or 'high'
 *   }
 * });
 *
 * // Using Live Search (deprecated Dec 2025)
 * const searchModel = llm({
 *   model: xai('grok-4'),
 *   params: {
 *     max_tokens: 1000,
 *     search_parameters: {
 *       mode: 'auto',
 *       sources: ['web', 'x', 'news'],
 *     }
 *   }
 * });
 *
 * // Generate
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 */
export const xai = createProvider<XAIProviderOptions>({
  name: 'xai',
  version: '1.0.0',
  modalities: {
    llm: {
      handlers: {
        completions: createCompletionsLLMHandler(),
        responses: createResponsesLLMHandler(),
        messages: createMessagesLLMHandler(),
      },
      defaultMode: 'completions',
      getMode: (options) => options?.api ?? 'completions',
    } satisfies LLMHandlerResolver<XAIProviderOptions>,
    image: createImageHandler(),
  },
});

// Re-export tools and types
export { tools } from './types.ts';
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
} from './types.ts';

export type { XAIImageParams } from './image.ts';
