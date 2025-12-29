import type {
  Provider,
  ModelReference,
  LLMHandler,
  EmbeddingHandler,
  ImageHandler,
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
  return provider;
}
