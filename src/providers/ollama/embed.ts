/**
 * @fileoverview Ollama Embeddings API Handler
 *
 * This module implements the embedding handler for Ollama's local embeddings API.
 * Supports various embedding models including nomic-embed-text, mxbai-embed-large,
 * qwen3-embedding, and others.
 *
 * @see {@link https://github.com/ollama/ollama/blob/main/docs/api.md#embeddings Ollama Embeddings API Reference}
 * @module providers/ollama/embed
 */

import type {
  EmbeddingHandler,
  BoundEmbeddingModel,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingProvider,
} from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { doFetch } from '../../http/fetch.ts';
import { parseJsonResponse } from '../../http/json.ts';

/** Default URL for Ollama's local API */
const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

/**
 * Ollama embedding parameters.
 * Passed through to the API.
 */
export interface OllamaEmbedParams {
  /** Truncates the end of each input to fit within context length (default: true) */
  truncate?: boolean;
  /** Controls how long the model stays loaded in memory (e.g., '5m', '1h') */
  keep_alive?: string;
  /** Additional model options */
  options?: Record<string, unknown>;
}

/**
 * Ollama embeddings API response structure.
 */
interface OllamaEmbeddingsResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

/**
 * Creates an embedding handler for Ollama's local Embeddings API.
 *
 * @returns An embedding handler configured for Ollama
 *
 * @example
 * ```typescript
 * const handler = createEmbeddingHandler();
 * const model = handler.bind('nomic-embed-text');
 *
 * const response = await model.embed({
 *   inputs: ['Hello world'],
 *   config: { baseUrl: 'http://localhost:11434' }
 * });
 * ```
 */
export function createEmbeddingHandler(): EmbeddingHandler<OllamaEmbedParams> {
  let providerRef: EmbeddingProvider<OllamaEmbedParams> | null = null;

  return {
    supportedInputs: ['text'],

    _setProvider(provider: EmbeddingProvider<OllamaEmbedParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundEmbeddingModel<OllamaEmbedParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'ollama',
          ModalityType.Embedding
        );
      }

      const model: BoundEmbeddingModel<OllamaEmbedParams> = {
        modelId,
        maxBatchSize: 512,
        maxInputLength: 8192,
        dimensions: 768, // Varies by model

        get provider(): EmbeddingProvider<OllamaEmbedParams> {
          return providerRef!;
        },

        async embed(request: EmbeddingRequest<OllamaEmbedParams>): Promise<EmbeddingResponse> {
          const baseUrl = request.config.baseUrl ?? OLLAMA_DEFAULT_URL;

          // Transform inputs to strings
          const inputTexts = request.inputs.map((input) => {
            if (typeof input === 'string') {
              return input;
            }
            if ('text' in input) {
              return input.text;
            }
            throw new UPPError(
              'Ollama embeddings only support text input',
              ErrorCode.InvalidRequest,
              'ollama',
              ModalityType.Embedding
            );
          });

          // Build request body
          const body: Record<string, unknown> = {
            model: modelId,
            input: inputTexts,
          };

          // Pass through Ollama-specific params
          if (request.params?.truncate !== undefined) {
            body.truncate = request.params.truncate;
          }
          if (request.params?.keep_alive !== undefined) {
            body.keep_alive = request.params.keep_alive;
          }
          if (request.params?.options !== undefined) {
            body.options = request.params.options;
          }

          const url = `${baseUrl}/api/embed`;

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
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
            body: JSON.stringify(body),
            signal: request.signal,
          }, request.config, 'ollama', 'embedding');

          const data = await parseJsonResponse<OllamaEmbeddingsResponse>(response, 'ollama', 'embedding');

          // Return EmbeddingResponse
          return {
            embeddings: data.embeddings.map((vec, index) => ({
              vector: vec,
              index,
            })),
            usage: {
              totalTokens: data.prompt_eval_count ?? 0,
            },
            // Response metadata namespaced under provider (Spec 15.4)
            metadata: {
              ollama: {
                totalDuration: data.total_duration,
                loadDuration: data.load_duration,
              },
            },
          };
        },
      };

      return model;
    },
  };
}
