/**
 * @fileoverview Google Gemini Embeddings API Handler
 *
 * This module implements the embedding handler for Google's Gemini embeddings API.
 * Supports gemini-embedding-001 and text-embedding-004 models.
 *
 * @see {@link https://ai.google.dev/gemini-api/docs/embeddings Google Embeddings API Reference}
 * @module providers/google/embed
 */

import type {
  EmbeddingHandler,
  BoundEmbeddingModel,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingProvider,
} from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch } from '../../http/fetch.ts';
import { parseJsonResponse } from '../../http/json.ts';

/** Base URL for Google's Gemini API */
const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google task types for embedding optimization.
 */
export type GoogleTaskType =
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING'
  | 'QUESTION_ANSWERING'
  | 'FACT_VERIFICATION'
  | 'CODE_RETRIEVAL_QUERY'
  | 'TASK_TYPE_UNSPECIFIED';

/**
 * Google embedding parameters.
 * Passed through unchanged to the API.
 */
export interface GoogleEmbedParams {
  /** Task type for optimization */
  taskType?: GoogleTaskType;
  /** Document title (for RETRIEVAL_DOCUMENT taskType) */
  title?: string;
  /** Output dimensionality */
  outputDimensionality?: number;
  /** Whether to automatically truncate inputs exceeding token limits (default: true) */
  autoTruncate?: boolean;
}

/**
 * Google embeddings API response structure.
 */
interface GoogleEmbeddingsResponse {
  embeddings: Array<{
    values: number[];
    statistics?: {
      truncated?: boolean;
      tokenCount?: number;
    };
  }>;
}

/**
 * Creates an embedding handler for Google's Gemini Embeddings API.
 *
 * @returns An embedding handler configured for Google
 *
 * @example
 * ```typescript
 * const handler = createEmbeddingHandler();
 * const model = handler.bind('gemini-embedding-001');
 *
 * const response = await model.embed({
 *   inputs: ['Hello world'],
 *   params: { taskType: 'RETRIEVAL_DOCUMENT' },
 *   config: { apiKey: 'AIza...' }
 * });
 * ```
 */
export function createEmbeddingHandler(): EmbeddingHandler<GoogleEmbedParams> {
  let providerRef: EmbeddingProvider<GoogleEmbedParams> | null = null;

  return {
    supportedInputs: ['text'],

    _setProvider(provider: EmbeddingProvider<GoogleEmbedParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundEmbeddingModel<GoogleEmbedParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'google',
          ModalityType.Embedding
        );
      }

      const model: BoundEmbeddingModel<GoogleEmbedParams> = {
        modelId,
        maxBatchSize: 100,
        maxInputLength: 2048,
        dimensions: 3072,

        get provider(): EmbeddingProvider<GoogleEmbedParams> {
          return providerRef!;
        },

        async embed(request: EmbeddingRequest<GoogleEmbedParams>): Promise<EmbeddingResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'GOOGLE_API_KEY',
            'google',
            'embedding'
          );

          const baseUrl = request.config.baseUrl ?? GOOGLE_API_URL;

          // Transform inputs to Google's format
          const requests = request.inputs.map((input) => {
            const text = typeof input === 'string' ? input : ('text' in input ? input.text : '');

            if (!text) {
              throw new UPPError(
                'Google embeddings only support text input',
                ErrorCode.InvalidRequest,
                'google',
                ModalityType.Embedding
              );
            }

            const embedRequest: Record<string, unknown> = {
              ...request.params,
              model: `models/${modelId}`,
              content: { parts: [{ text }] },
            };

            return embedRequest;
          });

          const url = `${baseUrl}/models/${modelId}:batchEmbedContents`;

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          };

          // Merge custom headers
          if (request.config.headers) {
            for (const [key, value] of Object.entries(request.config.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }
          }

          const response = await doFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ requests }),
            signal: request.signal,
          }, request.config, 'google', 'embedding');

          const data = await parseJsonResponse<GoogleEmbeddingsResponse>(response, 'google', 'embedding');

          // Calculate total tokens
          let totalTokens = 0;
          for (const emb of data.embeddings) {
            totalTokens += emb.statistics?.tokenCount ?? 0;
          }

          // Return EmbeddingResponse - preserve ALL metadata
          return {
            embeddings: data.embeddings.map((e, index) => ({
              vector: e.values,
              index,
              tokens: e.statistics?.tokenCount,
              // Per-embedding metadata (NOT redacted)
              metadata: e.statistics ? {
                truncated: e.statistics.truncated,
              } : undefined,
            })),
            usage: { totalTokens },
          };
        },
      };

      return model;
    },
  };
}
