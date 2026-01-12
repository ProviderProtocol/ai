/**
 * @fileoverview Base provider interface and factory for the Universal Provider Protocol.
 *
 * This module provides the foundation for creating AI providers that conform to the
 * UPP specification. Providers are callable functions that create model references
 * and register internal handlers for LLM, embedding, and image modalities.
 *
 * @module core/provider
 */

import type {
  Provider,
  ModelReference,
  LLMHandler,
  EmbeddingHandler,
  ImageHandler,
  LLMProvider,
  EmbeddingProvider,
  ImageProvider,
} from '../types/provider.ts';
import type { LLMHandlerResolver } from './provider-handlers.ts';
import { isHandlerResolver, registerProviderHandlers } from './provider-handlers.ts';


/**
 * Configuration options for creating a new provider.
 *
 * @typeParam TOptions - Provider-specific options type
 *
 * @example
 * ```typescript
 * // Simple provider with single handler
 * const options: CreateProviderOptions = {
 *   name: 'my-provider',
 *   version: '1.0.0',
 *   handlers: {
 *     llm: createLLMHandler(),
 *     embedding: createEmbeddingHandler(),
 *   },
 * };
 *
 * // Provider with multiple LLM handlers (API modes)
 * const options: CreateProviderOptions<OpenAIOptions> = {
 *   name: 'openai',
 *   version: '1.0.0',
 *   handlers: {
 *     llm: {
 *       handlers: { responses: handler1, completions: handler2 },
 *       defaultMode: 'responses',
 *       getMode: (opts) => opts?.api ?? 'responses',
 *     },
 *   },
 * };
 * ```
 */
export interface CreateProviderOptions<TOptions = unknown> {
  /** Unique identifier for the provider */
  name: string;
  /** Semantic version string for the provider implementation */
  version: string;
  /** Handlers for supported modalities (LLM, embedding, image generation) */
  handlers: {
    /** Handler for language model completions, or resolver for multi-handler providers */
    llm?: LLMHandler | LLMHandlerResolver<TOptions>;
    /** Handler for text embeddings */
    embedding?: EmbeddingHandler;
    /** Handler for image generation */
    image?: ImageHandler;
  };
  /**
   * Custom function to create model references from options.
   * Use this to map provider options to providerConfig (e.g., betas to headers).
   */
  createModelReference?: (
    modelId: string,
    options: TOptions | undefined,
    provider: Provider<TOptions>
  ) => ModelReference<TOptions>;
}


/**
 * Creates a provider factory function with registered modality handlers.
 *
 * The returned provider is a callable function that creates model references
 * when invoked with a model ID. It exposes `name` and `version` metadata.
 *
 * @typeParam TOptions - Provider-specific options type (defaults to unknown)
 * @param options - Provider configuration including name, version, and handlers
 * @returns A callable Provider with handlers registered internally
 *
 * @example
 * ```typescript
 * // Create a basic provider
 * const anthropic = createProvider({
 *   name: 'anthropic',
 *   version: '1.0.0',
 *   handlers: { llm: createLLMHandler() },
 * });
 *
 * // Use the provider to create a model reference
 * const model = anthropic('claude-sonnet-4-20250514');
 *
 * // Provider with custom options type
 * interface MyOptions { apiVersion?: 'v1' | 'v2' }
 * const myProvider = createProvider<MyOptions>({
 *   name: 'my-provider',
 *   version: '1.0.0',
 *   handlers: { llm: handler },
 * });
 *
 * // Provider with multiple LLM handlers (API modes)
 * const openai = createProvider<OpenAIOptions>({
 *   name: 'openai',
 *   version: '1.0.0',
 *   handlers: {
 *     llm: {
 *       handlers: { responses: responsesHandler, completions: completionsHandler },
 *       defaultMode: 'responses',
 *       getMode: (opts) => opts?.api ?? 'responses',
 *     },
 *   },
 * });
 * ```
 */
export function createProvider<TOptions = unknown>(
  options: CreateProviderOptions<TOptions>
): Provider<TOptions> {
  // Resolve the default LLM handler for capabilities/bind
  const llmInput = options.handlers.llm;
  const hasResolver = isHandlerResolver<TOptions>(llmInput);
  const defaultLLMHandler = hasResolver ? llmInput.handlers[llmInput.defaultMode] : llmInput;

  if (hasResolver && !defaultLLMHandler) {
    throw new Error(
      `Provider '${options.name}' LLM resolver defaultMode '${llmInput.defaultMode}' has no handler`
    );
  }

  // Create the factory function
  const fn = function (modelId: string, modelOptions?: TOptions): ModelReference<TOptions> {
    if (options.createModelReference) {
      return options.createModelReference(modelId, modelOptions, provider);
    }
    // Default: store options on the reference for handler resolution
    return { modelId, provider, options: modelOptions };
  };

  Object.defineProperties(fn, {
    name: {
      value: options.name,
      writable: false,
      configurable: true,
    },
    version: {
      value: options.version,
      writable: false,
      configurable: true,
    },
  });

  const provider = fn as Provider<TOptions>;

  // If there's a resolver, set provider on all handlers
  if (hasResolver) {
    for (const handler of Object.values(llmInput.handlers)) {
      handler._setProvider?.(provider as unknown as LLMProvider);
    }
  } else if (defaultLLMHandler?._setProvider) {
    defaultLLMHandler._setProvider(provider as unknown as LLMProvider);
  }

  if (options.handlers.embedding?._setProvider) {
    options.handlers.embedding._setProvider(provider as unknown as EmbeddingProvider);
  }
  if (options.handlers.image?._setProvider) {
    options.handlers.image._setProvider(provider as unknown as ImageProvider);
  }

  registerProviderHandlers(provider, {
    llm: defaultLLMHandler,
    embedding: options.handlers.embedding,
    image: options.handlers.image,
    ...(hasResolver ? { llmResolver: llmInput } : {}),
  });

  return provider;
}
