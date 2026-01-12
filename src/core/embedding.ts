/**
 * @fileoverview Embedding instance factory for the Universal Provider Protocol.
 *
 * This module provides the core functionality for creating embedding instances
 * that generate vector embeddings from text or other content.
 *
 * @module core/embedding
 */

import type {
  EmbeddingOptions,
  EmbeddingInstance,
  EmbeddingResult,
  EmbeddingProgress,
  EmbeddingStream,
  EmbedOptions,
  Embedding,
} from '../types/embedding.ts';
import type {
  EmbeddingInput,
  BoundEmbeddingModel,
  EmbeddingResponse,
} from '../types/provider.ts';
import { UPPError } from '../types/errors.ts';
import { resolveEmbeddingHandler } from './provider-handlers.ts';
import { toError } from '../utils/error.ts';

/**
 * Creates an embedding instance configured with the specified options.
 *
 * This is the primary factory function for creating embedding instances.
 * It validates provider capabilities, binds the model, and returns an
 * instance with an `embed` method for generating embeddings.
 *
 * @typeParam TParams - Provider-specific parameter type
 * @param options - Configuration options for the embedding instance
 * @returns A configured embedding instance ready for use
 * @throws {UPPError} When the provider does not support the embedding modality
 *
 * @example
 * ```typescript
 * import { embedding } from 'upp';
 * import { openai } from 'upp/openai';
 *
 * const embedder = embedding({
 *   model: openai('text-embedding-3-large'),
 *   params: { dimensions: 1536 }
 * });
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
export function embedding<TParams = unknown>(
  options: EmbeddingOptions<TParams>
): EmbeddingInstance<TParams> {
  const { model: modelRef, config = {}, params } = options;

  const provider = modelRef.provider;
  const handler = resolveEmbeddingHandler<TParams>(provider);
  if (!handler) {
    throw new UPPError(
      `Provider '${provider.name}' does not support embedding modality`,
      'INVALID_REQUEST',
      provider.name,
      'embedding'
    );
  }

  const boundModel = handler.bind(modelRef.modelId);

  function embed(
    input: EmbeddingInput | EmbeddingInput[],
    embedOptions?: EmbedOptions & { chunked?: false }
  ): Promise<EmbeddingResult>;
  function embed(
    input: EmbeddingInput[],
    embedOptions: EmbedOptions & { chunked: true }
  ): EmbeddingStream;
  function embed(
    input: EmbeddingInput | EmbeddingInput[],
    embedOptions?: EmbedOptions
  ): Promise<EmbeddingResult> | EmbeddingStream {
    const inputs = Array.isArray(input) ? input : [input];

    if (embedOptions?.chunked) {
      return createChunkedStream(boundModel, inputs, params, config, embedOptions);
    }

    return executeEmbed(boundModel, inputs, params, config, embedOptions?.signal);
  }

  return {
    model: boundModel,
    params,
    embed,
  };
}

/**
 * Execute single embed request.
 *
 * @param model - Bound embedding model
 * @param inputs - Input batch
 * @param params - Provider-specific params
 * @param config - Provider configuration
 * @param signal - Abort signal
 * @returns Normalized embedding result
 */
async function executeEmbed<TParams>(
  model: BoundEmbeddingModel<TParams>,
  inputs: EmbeddingInput[],
  params: TParams | undefined,
  config: EmbeddingOptions<TParams>['config'],
  signal?: AbortSignal
): Promise<EmbeddingResult> {
  const response = await model.embed({
    inputs,
    params,
    config: config ?? {},
    signal,
  });

  return normalizeResponse(response, model.provider.name);
}

/**
 * Normalize provider response to public EmbeddingResult.
 *
 * @param response - Provider response
 * @param providerName - Provider name for error reporting
 * @returns Normalized embedding result
 */
function normalizeResponse(response: EmbeddingResponse, providerName: string): EmbeddingResult {
  return {
    embeddings: response.embeddings.map((vec, i) => {
      const vector = normalizeVector(vec.vector, providerName);
      return {
        vector,
        dimensions: vector.length,
        index: vec.index ?? i,
        tokens: vec.tokens,
        metadata: vec.metadata,
      };
    }),
    usage: response.usage,
    metadata: response.metadata,
  };
}

/**
 * Normalize vector from floats or base64 string to number array.
 *
 * @param vector - Float vector or base64 string
 * @param providerName - Provider name for error reporting
 * @returns Normalized float array
 */
function normalizeVector(vector: number[] | string, providerName: string): number[] {
  if (Array.isArray(vector)) {
    return vector;
  }
  return decodeBase64(vector, providerName);
}

/**
 * Decode base64-encoded float32 array.
 *
 * @param b64 - Base64-encoded float32 buffer
 * @param providerName - Provider name for error reporting
 * @returns Decoded float array
 */
function decodeBase64(b64: string, providerName: string): number[] {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const floats = new Float32Array(bytes.buffer);
    return Array.from(floats);
  } catch (error) {
    const cause = error instanceof Error ? error : new Error('Failed to decode base64 vector');
    throw new UPPError(
      'Invalid base64 embedding vector',
      'INVALID_RESPONSE',
      providerName,
      'embedding',
      undefined,
      cause
    );
  }
}

/**
 * Create chunked stream for large input sets.
 *
 * @param model - Bound embedding model
 * @param inputs - All embedding inputs
 * @param params - Provider-specific params
 * @param config - Provider configuration
 * @param options - Chunked stream options
 * @returns Embedding stream with progress updates
 */
function createChunkedStream<TParams>(
  model: BoundEmbeddingModel<TParams>,
  inputs: EmbeddingInput[],
  params: TParams | undefined,
  config: EmbeddingOptions<TParams>['config'],
  options: EmbedOptions
): EmbeddingStream {
  const abortController = new AbortController();
  const batchSize = options.batchSize ?? model.maxBatchSize;
  const concurrency = options.concurrency ?? 1;

  let resolveResult: (result: EmbeddingResult) => void;
  let rejectResult: (error: Error) => void;
  let settled = false;
  const resultPromise = new Promise<EmbeddingResult>((resolve, reject) => {
    resolveResult = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    rejectResult = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
  });

  const cancelError = () => new UPPError(
    'Embedding cancelled',
    'CANCELLED',
    model.provider.name,
    'embedding'
  );

  const onAbort = () => {
    rejectResult(cancelError());
  };

  abortController.signal.addEventListener('abort', onAbort, { once: true });
  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  async function* generate(): AsyncGenerator<EmbeddingProgress> {
    const total = inputs.length;
    const allEmbeddings: Embedding[] = [];
    let totalTokens = 0;

    const batches: EmbeddingInput[][] = [];
    for (let i = 0; i < inputs.length; i += batchSize) {
      batches.push(inputs.slice(i, i + batchSize));
    }

    try {
      for (let i = 0; i < batches.length; i += concurrency) {
        if (abortController.signal.aborted || options.signal?.aborted) {
          throw cancelError();
        }

        const chunk = batches.slice(i, i + concurrency);
        const responses = await Promise.all(
          chunk.map((batch) =>
            model.embed({
              inputs: batch,
              params,
              config: config ?? {},
              signal: abortController.signal,
            })
          )
        );

        const batchEmbeddings: Embedding[] = [];
        for (const response of responses) {
          for (const vec of response.embeddings) {
            const vector = normalizeVector(vec.vector, model.provider.name);
            const emb: Embedding = {
              vector,
              dimensions: vector.length,
              index: allEmbeddings.length + batchEmbeddings.length,
              tokens: vec.tokens,
              metadata: vec.metadata,
            };
            batchEmbeddings.push(emb);
          }
          totalTokens += response.usage.totalTokens;
        }

        allEmbeddings.push(...batchEmbeddings);

        yield {
          embeddings: batchEmbeddings,
          completed: allEmbeddings.length,
          total,
          percent: (allEmbeddings.length / total) * 100,
        };
      }

      resolveResult({
        embeddings: allEmbeddings,
        usage: { totalTokens },
      });
    } catch (error) {
      const err = toError(error);
      rejectResult(err);
      throw err;
    }
  }

  const generator = generate();

  return {
    [Symbol.asyncIterator]: () => generator,
    result: resultPromise,
    abort: () => abortController.abort(),
  };
}
