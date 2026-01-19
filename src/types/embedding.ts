/**
 * @fileoverview Embedding types for vector embedding generation.
 *
 * Defines the interfaces for configuring and executing embedding operations,
 * including options, instances, requests, responses, and streaming progress.
 *
 * @module types/embedding
 */

import type {
  ProviderConfig,
  BoundEmbeddingModel,
  EmbeddingInput,
  EmbeddingUsage,
  ProviderIdentity,
} from './provider.ts';
import type { Middleware } from './middleware.ts';

/**
 * Input type hints for provider-specific embedding optimization.
 * Some providers optimize embeddings differently for queries vs documents.
 */
export const EmbeddingInputType = {
  /** Input is a document to be stored/indexed */
  Document: 'document',
  /** Input is a query for retrieval/search */
  Query: 'query',
} as const;

export type EmbeddingInputType = (typeof EmbeddingInputType)[keyof typeof EmbeddingInputType];

/**
 * Structural type for embedding model input.
 * Uses structural typing to avoid generic variance issues with Provider generics.
 *
 * @remarks
 * This type mirrors {@link ModelReference} while keeping provider options
 * structurally compatible across providers.
 *
 * @see ModelReference
 */
export interface EmbeddingModelInput {
  readonly modelId: string;
  readonly provider: ProviderIdentity;
  /** Optional provider configuration merged into requests */
  readonly providerConfig?: Partial<ProviderConfig>;
}

/**
 * Options for creating an embedding instance with the embedding() function.
 *
 * @typeParam TParams - Provider-specific parameter type
 *
 * @example
 * ```typescript
 * const options: EmbeddingOptions<OpenAIEmbedParams> = {
 *   model: openai('text-embedding-3-large'),
 *   config: { apiKey: process.env.OPENAI_API_KEY },
 *   params: { dimensions: 1536 }
 * };
 * ```
 */
export interface EmbeddingOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: EmbeddingModelInput;

  /** Provider infrastructure configuration */
  config?: ProviderConfig;

  /** Provider-specific parameters (passed through unchanged) */
  params?: TParams;

  /**
   * Middleware for intercepting and transforming requests and responses.
   *
   * Middleware are executed in array order for request/start hooks,
   * and reverse order for response/end hooks.
   */
  middleware?: Middleware[];
}

/**
 * Options for embed() calls.
 */
export interface EmbedOptions {
  /**
   * Enable chunked processing with progress for large input sets.
   * When true, returns EmbeddingStream instead of Promise.
   */
  chunked?: boolean;

  /** Inputs per batch when chunked (default: provider max) */
  batchSize?: number;

  /** Concurrent batch limit when chunked (default: 1) */
  concurrency?: number;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Hint for embedding optimization (provider-specific) */
  inputType?: EmbeddingInputType;
}

/**
 * Single embedding vector result.
 */
export interface Embedding {
  /** The embedding vector */
  vector: number[];

  /** Vector dimensionality */
  dimensions: number;

  /** Index corresponding to input array position */
  index: number;

  /** Token count for this input (if provider reports) */
  tokens?: number;

  /** Provider-specific per-embedding metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from embed() call.
 */
export interface EmbeddingResult {
  /** Embeddings in same order as inputs */
  embeddings: Embedding[];

  /** Usage statistics */
  usage: EmbeddingUsage;

  /** Provider-specific response metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Progress update when using chunked mode.
 */
export interface EmbeddingProgress {
  /** Embeddings from the latest batch */
  embeddings: Embedding[];

  /** Total embeddings completed so far */
  completed: number;

  /** Total number of inputs */
  total: number;

  /** Percentage complete (0-100) */
  percent: number;
}

/**
 * Async iterable stream with final result accessor.
 * Returned when embed() is called with { chunked: true }.
 */
export interface EmbeddingStream extends AsyncIterable<EmbeddingProgress> {
  /** Promise resolving to complete result after iteration */
  readonly result: Promise<EmbeddingResult>;

  /** Abort the operation */
  abort(): void;
}

/**
 * Embedding instance returned by the embedding() function.
 *
 * @typeParam TParams - Provider-specific parameter type
 *
 * @example
 * ```typescript
 * const embedder = embedding({ model: openai('text-embedding-3-large') });
 *
 * // Single input
 * const result = await embedder.embed('Hello world');
 *
 * // Batch input
 * const batch = await embedder.embed(['doc1', 'doc2', 'doc3']);
 *
 * // Large-scale with progress
 * const stream = embedder.embed(documents, { chunked: true });
 * for await (const progress of stream) {
 *   console.log(`${progress.percent}% complete`);
 * }
 * ```
 */
export interface EmbeddingInstance<TParams = unknown> {
  /**
   * Generate embeddings for one or more inputs.
   *
   * @param input - Single input or array of inputs
   * @param options - Optional embed options
   * @returns Promise<EmbeddingResult> or EmbeddingStream if chunked
   */
  embed(
    input: EmbeddingInput | EmbeddingInput[],
    options?: EmbedOptions & { chunked?: false }
  ): Promise<EmbeddingResult>;
  embed(
    input: EmbeddingInput[],
    options: EmbedOptions & { chunked: true }
  ): EmbeddingStream;
  embed(
    input: EmbeddingInput | EmbeddingInput[],
    options?: EmbedOptions
  ): Promise<EmbeddingResult> | EmbeddingStream;

  /** The bound embedding model */
  readonly model: BoundEmbeddingModel<TParams>;

  /** Current parameters */
  readonly params: TParams | undefined;
}
