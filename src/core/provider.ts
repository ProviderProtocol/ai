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
 * Options for creating a provider
 */
export interface CreateProviderOptions {
  name: string;
  version: string;
  modalities: {
    llm?: LLMHandler;
    embedding?: EmbeddingHandler;
    image?: ImageHandler;
  };
}

/**
 * Create a provider factory function
 *
 * @typeParam TOptions - Provider-specific options type (defaults to unknown)
 * @param options - Provider configuration
 * @returns Provider function with modalities attached
 *
 * @example
 * ```ts
 * // Basic provider without options
 * const anthropic = createProvider({
 *   name: 'anthropic',
 *   version: '1.0.0',
 *   modalities: { llm: createLLMHandler() },
 * });
 *
 * // Provider with custom options (typically needs custom factory)
 * interface MyProviderOptions { api?: 'v1' | 'v2' }
 * const myProvider = createProvider<MyProviderOptions>({
 *   name: 'my-provider',
 *   version: '1.0.0',
 *   modalities: { llm: createLLMHandler() },
 * });
 * ```
 */
export function createProvider<TOptions = unknown>(
  options: CreateProviderOptions
): Provider<TOptions> {
  // Create the base function that accepts optional provider-specific options
  const fn = function (modelId: string, _options?: TOptions): ModelReference<TOptions> {
    return { modelId, provider };
  };

  // Define properties, including overriding the read-only 'name' property
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

  // Inject provider reference into handlers so bind() can return
  // models with the correct provider reference (spec compliance)
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
