/**
 * @fileoverview OpenAI Provider Factory
 *
 * This module provides the main OpenAI provider implementation that supports both
 * the modern Responses API (default) and the legacy Chat Completions API.
 *
 * @example
 * ```typescript
 * import { openai } from './providers/openai';
 * import { llm } from './core/llm';
 *
 * // Using the modern Responses API (default)
 * const model = llm({
 *   model: openai('gpt-4o'),
 *   params: { max_output_tokens: 1000 }
 * });
 *
 * // Using the legacy Chat Completions API
 * const legacyModel = llm({
 *   model: openai('gpt-4o', { api: 'completions' }),
 *   params: { max_tokens: 1000 }
 * });
 * ```
 *
 * @module providers/openai
 */

import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
  EmbeddingHandler,
  EmbeddingProvider,
} from '../../types/provider.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createEmbeddingHandler, type OpenAIEmbedParams } from './embed.ts';
import type { OpenAICompletionsParams, OpenAIResponsesParams } from './types.ts';

/**
 * Union type for the LLM handler that supports both API modes.
 * Used internally for the dynamic handler selection based on API mode.
 */
type OpenAILLMParamsUnion = OpenAICompletionsParams | OpenAIResponsesParams;

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
 * OpenAI provider interface with configurable API mode.
 *
 * The provider is callable as a function to create model references, and also
 * exposes metadata about the provider and its supported modalities.
 *
 * @example Creating model references
 * ```typescript
 * // Using the modern Responses API (default, recommended)
 * const model = openai('gpt-4o');
 *
 * // Using the legacy Chat Completions API
 * const legacyModel = openai('gpt-4o', { api: 'completions' });
 *
 * // Explicit Responses API selection
 * const responsesModel = openai('gpt-4o', { api: 'responses' });
 * ```
 *
 * @see {@link OpenAIProviderOptions} for available configuration options
 * @see {@link OpenAIResponsesParams} for Responses API parameters
 * @see {@link OpenAICompletionsParams} for Chat Completions API parameters
 */
export interface OpenAIProvider extends Provider<OpenAIProviderOptions> {
  /**
   * Creates a model reference for the specified OpenAI model.
   *
   * @param modelId - The OpenAI model identifier (e.g., 'gpt-4o', 'gpt-4-turbo', 'o1-preview', 'gpt-4o-mini')
   * @param options - Optional provider configuration including API mode selection
   * @returns A model reference that can be used with the LLM core functions
   *
   * @example
   * ```typescript
   * const gpt4o = openai('gpt-4o');
   * const gpt4turbo = openai('gpt-4-turbo', { api: 'completions' });
   * ```
   */
  (modelId: string, options?: OpenAIProviderOptions): ModelReference<OpenAIProviderOptions>;

  /**
   * The provider identifier.
   * Always returns `'openai'` for this provider.
   */
  readonly name: 'openai';

  /**
   * The provider version following semantic versioning.
   */
  readonly version: string;

  /**
   * Supported modalities and their handlers.
   * Supports LLM and Embedding modalities.
   */
  readonly modalities: {
    /** The LLM handler for text generation and chat completion */
    llm: LLMHandler<OpenAILLMParamsUnion>;
    /** The embedding handler for text embeddings */
    embedding: EmbeddingHandler<OpenAIEmbedParams>;
  };
}

/**
 * Factory function that creates and configures the OpenAI provider instance.
 *
 * This function initializes both the Responses API and Chat Completions API handlers,
 * sets up dynamic handler selection based on the API mode, and injects provider
 * references for spec compliance.
 *
 * @returns A fully configured OpenAI provider instance
 * @internal
 */
function createOpenAIProvider(): OpenAIProvider {
  let currentApiMode: 'responses' | 'completions' = 'responses';

  const responsesHandler = createResponsesLLMHandler();
  const completionsHandler = createCompletionsLLMHandler();
  const embeddingHandler = createEmbeddingHandler();

  const fn = function (
    modelId: string,
    options?: OpenAIProviderOptions
  ): ModelReference<OpenAIProviderOptions> {
    const apiMode = options?.api ?? 'responses';
    currentApiMode = apiMode;
    return { modelId, provider };
  };

  const modalities = {
    get llm(): LLMHandler<OpenAILLMParamsUnion> {
      return currentApiMode === 'completions'
        ? (completionsHandler as unknown as LLMHandler<OpenAILLMParamsUnion>)
        : (responsesHandler as unknown as LLMHandler<OpenAILLMParamsUnion>);
    },
    embedding: embeddingHandler,
  };

  Object.defineProperties(fn, {
    name: {
      value: 'openai',
      writable: false,
      configurable: true,
    },
    version: {
      value: '1.0.0',
      writable: false,
      configurable: true,
    },
    modalities: {
      value: modalities,
      writable: false,
      configurable: true,
    },
  });

  const provider = fn as OpenAIProvider;

  responsesHandler._setProvider?.(provider as unknown as LLMProvider<OpenAIResponsesParams>);
  completionsHandler._setProvider?.(provider as unknown as LLMProvider<OpenAICompletionsParams>);
  embeddingHandler._setProvider?.(provider as unknown as EmbeddingProvider<OpenAIEmbedParams>);

  return provider;
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
export const openai = createOpenAIProvider();

// Re-export types
export type {
  OpenAICompletionsParams,
  OpenAIResponsesParams,
  OpenAIConfig,
  OpenAIAPIMode,
  OpenAIModelOptions,
  OpenAIModelReference,
  // Audio and web search types
  OpenAIAudioConfig,
  OpenAIWebSearchOptions,
  OpenAIWebSearchUserLocation,
  OpenAICompletionsWebSearchUserLocation,
  // Built-in tool types
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
  // Conversation and prompt types
  OpenAIConversation,
  OpenAIPromptTemplate,
} from './types.ts';

// Re-export tool helper constructors
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
