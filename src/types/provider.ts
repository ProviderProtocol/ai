/**
 * @fileoverview Provider types for AI service integrations.
 *
 * Defines the interfaces for provider factories, modality handlers,
 * and configuration options for connecting to various AI providers.
 *
 * @module types/provider
 */

import type { UPPError } from './errors.ts';

/**
 * API key strategy interface for managing multiple keys.
 *
 * Implement this interface to provide custom key rotation or
 * selection logic when working with multiple API keys.
 *
 * @example
 * ```typescript
 * class RoundRobinKeys implements KeyStrategy {
 *   private keys: string[];
 *   private index = 0;
 *
 *   constructor(keys: string[]) {
 *     this.keys = keys;
 *   }
 *
 *   getKey(): string {
 *     const key = this.keys[this.index];
 *     this.index = (this.index + 1) % this.keys.length;
 *     return key;
 *   }
 * }
 * ```
 */
export interface KeyStrategy {
  /**
   * Gets the next API key to use for a request.
   *
   * @returns The API key string, or a Promise resolving to it
   */
  getKey(): string | Promise<string>;
}

/**
 * Retry strategy interface for handling request failures.
 *
 * Implement this interface to provide custom retry logic for
 * handling rate limits, transient errors, and other failures.
 *
 * @example
 * ```typescript
 * class ExponentialBackoff implements RetryStrategy {
 *   private maxAttempts = 5;
 *   private baseDelay = 1000;
 *
 *   onRetry(error: UPPError, attempt: number): number | null {
 *     if (attempt > this.maxAttempts) return null;
 *     if (error.code !== 'RATE_LIMITED') return null;
 *     return this.baseDelay * Math.pow(2, attempt - 1);
 *   }
 * }
 * ```
 */
export interface RetryStrategy {
  /**
   * Called when a request fails with a retryable error.
   *
   * @param error - The error that occurred
   * @param attempt - The attempt number (1 = first retry)
   * @returns Delay in ms before retrying, or null to stop retrying
   */
  onRetry(error: UPPError, attempt: number): number | null | Promise<number | null>;

  /**
   * Called before each request. Can be used to implement pre-emptive rate limiting.
   *
   * @returns Delay in ms to wait before making the request, or 0 to proceed immediately
   */
  beforeRequest?(): number | Promise<number>;

  /**
   * Reset the strategy state (e.g., after a successful request).
   */
  reset?(): void;
}

/**
 * Provider configuration for infrastructure and connection settings.
 *
 * These settings control how requests are made to the provider's API,
 * including authentication, timeouts, and retry behavior.
 *
 * @example
 * ```typescript
 * const config: ProviderConfig = {
 *   apiKey: process.env.OPENAI_API_KEY,
 *   timeout: 30000,
 *   retryStrategy: new ExponentialBackoff()
 * };
 *
 * // Or with a key strategy for key rotation
 * const config: ProviderConfig = {
 *   apiKey: new RoundRobinKeys(['sk-1', 'sk-2', 'sk-3']),
 *   baseUrl: 'https://custom-proxy.example.com'
 * };
 * ```
 */
export interface ProviderConfig {
  /**
   * API key for authentication.
   * Can be a string, async function, or KeyStrategy for advanced use cases.
   */
  apiKey?: string | (() => string | Promise<string>) | KeyStrategy;

  /** Override the base API URL (for proxies, local models) */
  baseUrl?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Custom fetch implementation (for logging, caching, custom TLS) */
  fetch?: typeof fetch;

  /** API version override (provider-specific) */
  apiVersion?: string;

  /** Retry strategy for handling failures and rate limits */
  retryStrategy?: RetryStrategy;

  /**
   * Custom headers to include in API requests.
   *
   * Use this to pass provider-specific headers such as:
   * - Anthropic: `anthropic-beta` for beta features
   * - OpenAI: `OpenAI-Organization`, `OpenAI-Project`
   * - OpenRouter: `HTTP-Referer`, `X-Title` for attribution
   * - Ollama: Proxy authentication headers
   *
   * @example
   * ```typescript
   * const config: ProviderConfig = {
   *   headers: { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' }
   * };
   * ```
   */
  headers?: Record<string, string | undefined>;
}

/**
 * A reference to a model, created by a provider factory.
 *
 * Model references are lightweight objects that identify a model
 * and its provider, used as input to the llm() function.
 *
 * @typeParam TOptions - Provider-specific options type
 *
 * @example
 * ```typescript
 * const model = openai('gpt-4');
 * console.log(model.modelId); // 'gpt-4'
 * console.log(model.provider.name); // 'openai'
 * ```
 */
export interface ModelReference<TOptions = unknown> {
  /** The model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  readonly modelId: string;

  /** The provider that created this reference */
  readonly provider: Provider<TOptions>;

  /**
   * Optional provider-specific configuration that gets merged into request config.
   *
   * This allows providers to store options set at model reference creation time
   * (e.g., `anthropic('model', { betas: [...] })`) that should be applied to all requests.
   * The `llm()` factory will merge these into the request config, with explicit config
   * values taking precedence.
   */
  readonly providerConfig?: Partial<ProviderConfig>;

  /**
   * The original options passed when creating this model reference.
   *
   * Used by providers with multiple LLM handlers (e.g., OpenAI with responses/completions APIs)
   * to resolve the correct handler at request time, avoiding race conditions from shared state.
   */
  readonly options?: TOptions;
}

/**
 * LLM handler interface for providers.
 *
 * Implemented by providers to enable language model capabilities.
 *
 * @typeParam TParams - Provider-specific parameter type
 * @internal
 */
export interface LLMHandler<TParams = unknown> {
  /**
   * Binds a model ID to create an executable model instance.
   *
   * @param modelId - The model identifier to bind
   * @returns A bound LLM model ready for inference
   */
  bind(modelId: string): BoundLLMModel<TParams>;

  /**
   * Sets the parent provider reference.
   * Called by createProvider() after the provider is constructed.
   *
   * @param provider - The parent provider
   * @internal
   */
  _setProvider?(provider: LLMProvider<TParams>): void;
}

/**
 * Embedding handler interface for providers.
 *
 * Implemented by providers to enable embedding capabilities.
 *
 * @typeParam TParams - Provider-specific parameter type
 * @internal
 */
export interface EmbeddingHandler<TParams = unknown> {
  /** Supported input types for embeddings */
  readonly supportedInputs: ('text' | 'image')[];

  /**
   * Binds a model ID to create an executable embedding model.
   *
   * @param modelId - The model identifier to bind
   * @returns A bound embedding model ready for use
   */
  bind(modelId: string): BoundEmbeddingModel<TParams>;

  /**
   * Sets the parent provider reference.
   *
   * @param provider - The parent provider
   * @internal
   */
  _setProvider?(provider: EmbeddingProvider<TParams>): void;
}

/**
 * Image handler interface for providers.
 *
 * Implemented by providers to enable image generation capabilities.
 *
 * @typeParam TParams - Provider-specific parameter type
 * @internal
 */
export interface ImageHandler<TParams = unknown> {
  /**
   * Binds a model ID to create an executable image model.
   *
   * @param modelId - The model identifier to bind
   * @returns A bound image model ready for generation
   */
  bind(modelId: string): BoundImageModel<TParams>;

  /**
   * Sets the parent provider reference.
   *
   * @param provider - The parent provider
   * @internal
   */
  _setProvider?(provider: ImageProvider<TParams>): void;
}

/**
 * Bound LLM model interface (forward declaration).
 *
 * Full definition is in llm.ts to avoid circular dependencies.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface BoundLLMModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Reference to the parent provider */
  readonly provider: LLMProvider<TParams>;
}

/**
 * Bound embedding model interface.
 *
 * Represents an embedding model bound to a specific model ID,
 * ready to generate embeddings.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface BoundEmbeddingModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Reference to the parent provider */
  readonly provider: EmbeddingProvider<TParams>;

  /** Maximum number of inputs per batch request */
  readonly maxBatchSize: number;

  /** Maximum length of input text in tokens */
  readonly maxInputLength: number;

  /** Output embedding dimensions */
  readonly dimensions: number;

  /**
   * Execute embedding request.
   *
   * @param request - The embedding request
   * @returns Promise resolving to embedding response
   */
  embed(request: EmbeddingRequest<TParams>): Promise<EmbeddingResponse>;
}

/**
 * Request passed to provider's embed method.
 * @internal
 */
export interface EmbeddingRequest<TParams = unknown> {
  /** Inputs to embed */
  inputs: EmbeddingInput[];
  /** Provider-specific parameters (passed through unchanged) */
  params?: TParams;
  /** Provider infrastructure config */
  config: ProviderConfig;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Response from provider's embed method.
 * @internal
 */
export interface EmbeddingResponse {
  /** Embedding vectors */
  embeddings: EmbeddingVector[];
  /** Aggregate usage */
  usage: EmbeddingUsage;
  /** Provider-specific response metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Single vector from provider response.
 * @internal
 */
export interface EmbeddingVector {
  /** The embedding vector (floats or base64 string) */
  vector: number[] | string;
  /** Index in input array */
  index: number;
  /** Token count for this input */
  tokens?: number;
  /** Provider-specific per-embedding metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Usage statistics for embedding operations.
 */
export interface EmbeddingUsage {
  /** Total tokens processed */
  totalTokens: number;
}

/**
 * Valid input types for embedding.
 */
export type EmbeddingInput = string | { type: 'text'; text: string } | { type: 'image'; source: unknown; mimeType: string };

/**
 * Bound image model interface.
 *
 * Represents an image generation model bound to a specific model ID.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface BoundImageModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Reference to the parent provider */
  readonly provider: ImageProvider<TParams>;
}

/**
 * Provider factory function with metadata and modality handlers.
 *
 * The Provider interface represents a callable function that creates
 * model references, along with metadata and modality-specific handlers.
 *
 * @typeParam TOptions - Provider-specific options passed to the factory
 *
 * @example
 * ```typescript
 * // Using a provider
 * const model = openai('gpt-4', { temperature: 0.7 });
 *
 * // Accessing provider metadata
 * console.log(openai.name); // 'openai'
 * console.log(openai.version); // '1.0.0'
 * ```
 *
 * @remarks
 * Modality handlers are low-level and may not reflect per-model options.
 * Prefer the `llm()`, `embedding()`, or `image()` factories for normal usage.
 */
export interface Provider<TOptions = unknown> {
  /**
   * Creates a model reference with optional provider-specific options.
   *
   * @param modelId - The model identifier
   * @param options - Provider-specific options
   * @returns A model reference for use with llm() or other functions
   */
  (modelId: string, options?: TOptions): ModelReference<TOptions>;

  /** Provider name (e.g., 'openai', 'anthropic') */
  readonly name: string;

  /** Provider version string */
  readonly version: string;

  /**
   * Supported modalities and their handlers.
   *
   * @remarks
   * These handlers are low-level and primarily intended for internal use.
   * Prefer the higher-level factories (`llm()`, `embedding()`, `image()`) for
   * request execution and per-model option handling.
   */
  readonly modalities: {
    llm?: LLMHandler;
    embedding?: EmbeddingHandler;
    image?: ImageHandler;
  };
}

/**
 * Provider with LLM modality support.
 *
 * Type alias for providers that support language model inference.
 *
 * @typeParam TParams - Model-specific parameters type
 * @typeParam TOptions - Provider-specific options type
 */
export type LLMProvider<TParams = unknown, TOptions = unknown> = Provider<TOptions> & {
  readonly modalities: { llm: LLMHandler<TParams> };
};

/**
 * Provider with Embedding modality support.
 *
 * Type alias for providers that support embedding generation.
 *
 * @typeParam TParams - Model-specific parameters type
 * @typeParam TOptions - Provider-specific options type
 */
export type EmbeddingProvider<TParams = unknown, TOptions = unknown> = Provider<TOptions> & {
  readonly modalities: { embedding: EmbeddingHandler<TParams> };
};

/**
 * Provider with Image modality support.
 *
 * Type alias for providers that support image generation.
 *
 * @typeParam TParams - Model-specific parameters type
 * @typeParam TOptions - Provider-specific options type
 */
export type ImageProvider<TParams = unknown, TOptions = unknown> = Provider<TOptions> & {
  readonly modalities: { image: ImageHandler<TParams> };
};
