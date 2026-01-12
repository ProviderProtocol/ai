/**
 * @fileoverview Internal handler registry and resolver utilities.
 *
 * @module core/provider-handlers
 */

import type {
  ProviderIdentity,
  LLMHandler,
  EmbeddingHandler,
  ImageHandler,
} from '../types/provider.ts';

/**
 * Resolver for dynamically selecting LLM handlers based on model options.
 *
 * Used by providers that support multiple API modes (e.g., OpenAI with responses/completions).
 * The resolver eliminates shared mutable state by storing the mode on the ModelReference
 * and resolving the correct handler at request time.
 *
 * @typeParam TOptions - Provider-specific options type
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
export function isHandlerResolver<TOptions>(
  value: LLMHandler | LLMHandlerResolver<TOptions> | undefined
): value is LLMHandlerResolver<TOptions> {
  return value !== undefined && 'handlers' in value && 'getMode' in value;
}

type ProviderHandlers<TOptions = unknown> = {
  llm?: LLMHandler;
  embedding?: EmbeddingHandler;
  image?: ImageHandler;
  llmResolver?: LLMHandlerResolver<TOptions>;
};

const providerHandlers = new WeakMap<object, ProviderHandlers<unknown>>();

/**
 * Registers handler implementations for a provider.
 */
export function registerProviderHandlers<TOptions>(
  provider: ProviderIdentity,
  handlers: ProviderHandlers<TOptions>
): void {
  providerHandlers.set(provider as object, handlers as ProviderHandlers<unknown>);
}

function getProviderHandlers<TOptions>(
  provider: ProviderIdentity
): ProviderHandlers<TOptions> | undefined {
  return providerHandlers.get(provider as object) as ProviderHandlers<TOptions> | undefined;
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
 * @internal
 */
export function resolveLLMHandler<TOptions = unknown>(
  provider: ProviderIdentity,
  options: TOptions | undefined
): LLMHandler | undefined {
  const handlers = getProviderHandlers(provider);
  const resolver = handlers?.llmResolver;

  if (resolver) {
    const mode = resolver.getMode(options);
    return resolver.handlers[mode] ?? handlers?.llm;
  }

  return handlers?.llm;
}

/**
 * Resolves the embedding handler for a provider, if supported.
 *
 * @internal
 */
export function resolveEmbeddingHandler<TParams = unknown>(
  provider: ProviderIdentity
): EmbeddingHandler<TParams> | undefined {
  const handlers = getProviderHandlers(provider);
  return handlers?.embedding as EmbeddingHandler<TParams> | undefined;
}

/**
 * Resolves the image handler for a provider, if supported.
 *
 * @internal
 */
export function resolveImageHandler<TParams = unknown>(
  provider: ProviderIdentity
): ImageHandler<TParams> | undefined {
  const handlers = getProviderHandlers(provider);
  return handlers?.image as ImageHandler<TParams> | undefined;
}
