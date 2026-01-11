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
 * Resolver for dynamically selecting LLM handlers based on model options.
 *
 * Used by providers that support multiple API modes (e.g., OpenAI with responses/completions).
 * The resolver eliminates shared mutable state by storing the mode on the ModelReference
 * and resolving the correct handler at request time.
 *
 * @typeParam TOptions - Provider-specific options type
 *
 * @example
 * ```typescript
 * const resolver: LLMHandlerResolver<OpenAIProviderOptions> = {
 *   handlers: {
 *     responses: createResponsesLLMHandler(),
 *     completions: createCompletionsLLMHandler(),
 *   },
 *   defaultMode: 'responses',
 *   getMode: (options) => options?.api ?? 'responses',
 * };
 * ```
 */
export interface LLMHandlerResolver<TOptions = unknown> {
  /** Map of mode identifiers to their corresponding LLM handlers */
  handlers: Record<string, LLMHandler>;
  /** The default mode when options don't specify one */
  defaultMode: string;
  /** Function to extract the mode from provider options */
  getMode: (options: TOptions | undefined) => string;
}

/**
 * Type guard to check if a value is an LLMHandlerResolver.
 */
function isHandlerResolver<TOptions>(
  value: LLMHandler | LLMHandlerResolver<TOptions> | undefined
): value is LLMHandlerResolver<TOptions> {
  return value !== undefined && 'handlers' in value && 'getMode' in value;
}

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
 *   modalities: {
 *     llm: createLLMHandler(),
 *     embedding: createEmbeddingHandler(),
 *   },
 * };
 *
 * // Provider with multiple LLM handlers (API modes)
 * const options: CreateProviderOptions<OpenAIOptions> = {
 *   name: 'openai',
 *   version: '1.0.0',
 *   modalities: {
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
  modalities: {
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

/** Symbol for storing the LLM handler resolver on the modalities object */
const LLM_RESOLVER_KEY = Symbol.for('upp:llm-resolver');

/**
 * Extended modalities interface that includes the internal resolver reference.
 * @internal
 */
export interface ModalitiesWithResolver<TOptions = unknown> {
  llm?: LLMHandler;
  embedding?: EmbeddingHandler;
  image?: ImageHandler;
  [LLM_RESOLVER_KEY]?: LLMHandlerResolver<TOptions>;
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
 *
 * // Provider with multiple LLM handlers (API modes)
 * const openai = createProvider<OpenAIOptions>({
 *   name: 'openai',
 *   version: '1.0.0',
 *   modalities: {
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
  const llmInput = options.modalities.llm;
  const hasResolver = isHandlerResolver<TOptions>(llmInput);
  const defaultLLMHandler = hasResolver ? llmInput.handlers[llmInput.defaultMode] : llmInput;

  // Build modalities object with optional resolver reference
  const modalities: ModalitiesWithResolver<TOptions> = {
    llm: defaultLLMHandler,
    embedding: options.modalities.embedding,
    image: options.modalities.image,
  };

  // Store resolver for later lookup by resolveLLMHandler
  if (hasResolver) {
    modalities[LLM_RESOLVER_KEY] = llmInput;
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
    modalities: {
      value: modalities,
      writable: false,
      configurable: true,
    },
  });

  const provider = fn as Provider<TOptions>;

  // Set provider reference on the default handler
  if (defaultLLMHandler?._setProvider) {
    defaultLLMHandler._setProvider(provider as unknown as LLMProvider);
  }

  // If there's a resolver, set provider on all handlers
  if (hasResolver) {
    for (const handler of Object.values(llmInput.handlers)) {
      handler._setProvider?.(provider as unknown as LLMProvider);
    }
  }

  if (options.modalities.embedding?._setProvider) {
    options.modalities.embedding._setProvider(provider as unknown as EmbeddingProvider);
  }
  if (options.modalities.image?._setProvider) {
    options.modalities.image._setProvider(provider as unknown as ImageProvider);
  }

  return provider;
}

/**
 * Resolves the correct LLM handler based on model reference options.
 *
 * For providers with multiple LLM handlers (e.g., OpenAI with responses/completions APIs),
 * this function determines which handler to use based on the options stored on the
 * ModelReference. This eliminates race conditions from shared mutable state.
 *
 * For providers with a single LLM handler, this simply returns that handler.
 *
 * @typeParam TOptions - Provider-specific options type
 * @param provider - The provider to resolve the handler from
 * @param options - The options from the ModelReference
 * @returns The resolved LLM handler, or undefined if LLM is not supported
 *
 * @example
 * ```typescript
 * const handler = resolveLLMHandler(openai, { api: 'completions' });
 * // Returns the completions handler
 *
 * const handler = resolveLLMHandler(anthropic, undefined);
 * // Returns the single LLM handler
 * ```
 */
export function resolveLLMHandler<TOptions = unknown>(
  provider: Provider<TOptions>,
  options: TOptions | undefined
): LLMHandler | undefined {
  const modalities = provider.modalities as ModalitiesWithResolver<TOptions>;
  const resolver = modalities[LLM_RESOLVER_KEY];

  if (resolver) {
    const mode = resolver.getMode(options);
    return resolver.handlers[mode] ?? modalities.llm;
  }

  return modalities.llm;
}
