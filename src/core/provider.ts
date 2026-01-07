/**
 * @fileoverview Base provider interface and factory for the Universal Provider Protocol.
 *
 * This module provides the foundation for creating AI providers that conform to the
 * UPP specification. Providers are callable functions that create model references
 * and expose modality handlers (LLM, embedding, image).
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

/**
 * Configuration options for creating a new provider.
 *
 * @example
 * ```typescript
 * const options: CreateProviderOptions = {
 *   name: 'my-provider',
 *   version: '1.0.0',
 *   modalities: {
 *     llm: createLLMHandler(),
 *     embedding: createEmbeddingHandler(),
 *   },
 * };
 * ```
 */
export interface CreateProviderOptions {
  /** Unique identifier for the provider */
  name: string;
  /** Semantic version string for the provider implementation */
  version: string;
  /** Handlers for supported modalities (LLM, embedding, image generation) */
  modalities: {
    /** Handler for language model completions */
    llm?: LLMHandler;
    /** Handler for text embeddings */
    embedding?: EmbeddingHandler;
    /** Handler for image generation */
    image?: ImageHandler;
  };
}

/**
 * Creates a provider factory function with attached modality handlers.
 *
 * The returned provider is a callable function that creates model references
 * when invoked with a model ID. It also exposes `name`, `version`, and
 * `modalities` properties for introspection.
 *
 * @typeParam TOptions - Provider-specific options type (defaults to unknown)
 * @param options - Provider configuration including name, version, and handlers
 * @returns A callable Provider with modalities attached
 *
 * @example
 * ```typescript
 * // Create a basic provider
 * const anthropic = createProvider({
 *   name: 'anthropic',
 *   version: '1.0.0',
 *   modalities: { llm: createLLMHandler() },
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
 *   modalities: { llm: handler },
 * });
 * ```
 */
export function createProvider<TOptions = unknown>(
  options: CreateProviderOptions
): Provider<TOptions> {
  const fn = function (modelId: string, _options?: TOptions): ModelReference<TOptions> {
    return { modelId, provider };
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
    modalities: {
      value: options.modalities,
      writable: false,
      configurable: true,
    },
  });

  const provider = fn as Provider<TOptions>;

  if (options.modalities.llm?._setProvider) {
    options.modalities.llm._setProvider(provider as unknown as LLMProvider);
  }
  if (options.modalities.embedding?._setProvider) {
    options.modalities.embedding._setProvider(provider as unknown as EmbeddingProvider);
  }
  if (options.modalities.image?._setProvider) {
    options.modalities.image._setProvider(provider as unknown as ImageProvider);
  }

  return provider;
}
