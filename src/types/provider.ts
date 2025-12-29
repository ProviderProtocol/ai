import type { UPPError } from './errors.ts';

/**
 * API key strategy interface for managing multiple keys
 */
export interface KeyStrategy {
  /** Get the next API key to use */
  getKey(): string | Promise<string>;
}

/**
 * Retry strategy interface
 */
export interface RetryStrategy {
  /**
   * Called when a request fails with a retryable error.
   * @param error - The error that occurred
   * @param attempt - The attempt number (1 = first retry)
   * @returns Delay in ms before retrying, or null to stop retrying
   */
  onRetry(error: UPPError, attempt: number): number | null | Promise<number | null>;

  /**
   * Called before each request. Can be used to implement pre-emptive rate limiting.
   * Returns delay in ms to wait before making the request, or 0 to proceed immediately.
   */
  beforeRequest?(): number | Promise<number>;

  /**
   * Reset the strategy state (e.g., after a successful request)
   */
  reset?(): void;
}

/**
 * Provider configuration for infrastructure/connection settings
 */
export interface ProviderConfig {
  /**
   * API key - string, async function, or key strategy
   * @example 'sk-xxx'
   * @example () => fetchKeyFromVault()
   * @example new RoundRobinKeys(['sk-1', 'sk-2'])
   */
  apiKey?: string | (() => string | Promise<string>) | KeyStrategy;

  /** Override the base API URL (for proxies, local models) */
  baseUrl?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Custom fetch implementation (for logging, caching, custom TLS) */
  fetch?: typeof fetch;

  /** API version override */
  apiVersion?: string;

  /** Retry strategy for handling failures and rate limits */
  retryStrategy?: RetryStrategy;
}

/**
 * A reference to a model, created by a provider factory
 *
 * @typeParam TOptions - Provider-specific options type
 */
export interface ModelReference<TOptions = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** The provider that created this reference */
  readonly provider: Provider<TOptions>;
}

// Forward declarations for handler types (defined in llm.ts)
// We use 'any' here since the full types are circular
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface LLMHandler<TParams = any> {
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundLLMModel<TParams>;

  /**
   * Internal: Set the parent provider reference.
   * Called by createProvider() after the provider is constructed.
   * This allows bind() to return models with the correct provider reference.
   * @internal
   */
  _setProvider?(provider: LLMProvider<TParams>): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EmbeddingHandler<TParams = any> {
  /** Supported input types */
  readonly supportedInputs: ('text' | 'image')[];
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundEmbeddingModel<TParams>;

  /**
   * Internal: Set the parent provider reference.
   * @internal
   */
  _setProvider?(provider: EmbeddingProvider<TParams>): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ImageHandler<TParams = any> {
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundImageModel<TParams>;

  /**
   * Internal: Set the parent provider reference.
   * @internal
   */
  _setProvider?(provider: ImageProvider<TParams>): void;
}

// Forward declarations for bound models
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BoundLLMModel<TParams = any> {
  readonly modelId: string;
  readonly provider: LLMProvider<TParams>;
  // Methods defined in llm.ts
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BoundEmbeddingModel<TParams = any> {
  readonly modelId: string;
  readonly provider: EmbeddingProvider<TParams>;
  readonly maxBatchSize: number;
  readonly maxInputLength: number;
  readonly dimensions: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BoundImageModel<TParams = any> {
  readonly modelId: string;
  readonly provider: ImageProvider<TParams>;
}

/**
 * A provider factory function with metadata and modality handlers.
 *
 * @typeParam TOptions - Provider-specific options passed to the factory function
 */
export interface Provider<TOptions = unknown> {
  /** Create a model reference, optionally with provider-specific options */
  (modelId: string, options?: TOptions): ModelReference<TOptions>;

  /** Provider name */
  readonly name: string;

  /** Provider version */
  readonly version: string;

  /** Supported modalities */
  readonly modalities: {
    llm?: LLMHandler;
    embedding?: EmbeddingHandler;
    image?: ImageHandler;
  };
}

/**
 * Provider with LLM modality
 *
 * @typeParam TParams - Model-specific parameters type
 * @typeParam TOptions - Provider-specific options type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LLMProvider<TParams = any, TOptions = unknown> = Provider<TOptions> & {
  readonly modalities: { llm: LLMHandler<TParams> };
};

/**
 * Provider with Embedding modality
 *
 * @typeParam TParams - Model-specific parameters type
 * @typeParam TOptions - Provider-specific options type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EmbeddingProvider<TParams = any, TOptions = unknown> = Provider<TOptions> & {
  readonly modalities: { embedding: EmbeddingHandler<TParams> };
};

/**
 * Provider with Image modality
 *
 * @typeParam TParams - Model-specific parameters type
 * @typeParam TOptions - Provider-specific options type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ImageProvider<TParams = any, TOptions = unknown> = Provider<TOptions> & {
  readonly modalities: { image: ImageHandler<TParams> };
};
