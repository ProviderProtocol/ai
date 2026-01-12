/**
 * @fileoverview OpenAI Provider Factory
 *
 * This module provides the main OpenAI provider implementation that supports both
 * the modern Responses API (default) and the legacy Chat Completions API.
 *
 * @module providers/openai
 */

import { createProvider } from '../../core/provider.ts';
import type { LLMHandlerResolver } from '../../core/provider-handlers.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createEmbeddingHandler, type OpenAIEmbedParams } from './embed.ts';
import { createImageHandler, type OpenAIImageParams } from './image.ts';

/**
 * Configuration options for the OpenAI provider.
 *
 * Controls which underlying OpenAI API endpoint is used when making requests.
 * The Responses API is the modern, recommended approach while the Chat Completions
 * API provides backward compatibility with existing integrations.
 */
export interface OpenAIProviderOptions {
  /**
   * Which API endpoint to use for requests.
   *
   * - `'responses'` - Modern Responses API (default, recommended). Supports built-in
   *   tools like web search, image generation, file search, and code interpreter.
   * - `'completions'` - Legacy Chat Completions API. Standard chat completion endpoint
   *   with function calling support.
   *
   * @default 'responses'
   */
  api?: 'responses' | 'completions';
}

/**
 * The OpenAI provider instance.
 *
 * Supports both the modern Responses API (default) and the legacy Chat Completions API.
 * Use this provider to create model references for OpenAI models like GPT-4o, GPT-4 Turbo,
 * and the o1 series.
 *
 * @example Basic usage with Responses API (recommended)
 * ```typescript
 * import { openai } from './providers/openai';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: openai('gpt-4o'),
 *   params: { max_output_tokens: 1000 }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Using Chat Completions API
 * ```typescript
 * const legacyModel = llm({
 *   model: openai('gpt-4o', { api: 'completions' }),
 *   params: { max_tokens: 1000 }
 * });
 * ```
 *
 * @example With built-in tools (Responses API only)
 * ```typescript
 * import { openai, tools } from './providers/openai';
 *
 * const model = llm({
 *   model: openai('gpt-4o'),
 *   params: {
 *     tools: [tools.webSearch(), tools.imageGeneration()]
 *   }
 * });
 * ```
 */
export const openai = createProvider<OpenAIProviderOptions>({
  name: 'openai',
  version: '1.0.0',
  handlers: {
    llm: {
      handlers: {
        responses: createResponsesLLMHandler(),
        completions: createCompletionsLLMHandler(),
      },
      defaultMode: 'responses',
      getMode: (options) => options?.api ?? 'responses',
    } satisfies LLMHandlerResolver<OpenAIProviderOptions>,
    embedding: createEmbeddingHandler(),
    image: createImageHandler(),
  },
});

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
} from './types.ts';

export {
  tools,
  webSearchTool,
  fileSearchTool,
  codeInterpreterTool,
  computerTool,
  imageGenerationTool,
  mcpTool,
} from './types.ts';

export type { OpenAIHeaders } from './types.ts';

export type { OpenAIEmbedParams } from './embed.ts';

export type { OpenAIImageParams } from './image.ts';
