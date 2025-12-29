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
 * @param options - Provider configuration
 * @returns Provider function with modalities attached
 */
export function createProvider(options: CreateProviderOptions): Provider {
  // Create the base function
  const fn = function (modelId: string): ModelReference {
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

  const provider = fn as Provider;
  return provider;
}
