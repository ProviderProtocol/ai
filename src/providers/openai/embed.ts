/**
 * @fileoverview OpenAI Embeddings API Handler
 *
 * This module implements the embedding handler for OpenAI's embeddings API.
 * Supports text-embedding-3-small, text-embedding-3-large, and text-embedding-ada-002 models.
 *
 * @see {@link https://platform.openai.com/docs/api-reference/embeddings OpenAI Embeddings API Reference}
 * @module providers/openai/embed
 */

import type {
  EmbeddingHandler,
  BoundEmbeddingModel,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingProvider,
} from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch } from '../../http/fetch.ts';

/** Base URL for OpenAI's Embeddings API endpoint */
const OPENAI_EMBEDDINGS_API_URL = 'https://api.openai.com/v1/embeddings';

/**
 * OpenAI embedding parameters.
 * Passed through unchanged to the API.
 */
export interface OpenAIEmbedParams {
  /** Output dimensions (text-embedding-3 models only) */
  dimensions?: number;
  /** Encoding format: 'float' or 'base64' */
  encoding_format?: 'float' | 'base64';
  /** A unique identifier representing your end-user */
  user?: string;
}

/**
 * OpenAI embeddings API response structure.
 */
interface OpenAIEmbeddingsResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[] | string;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Get default dimensions for a model.
 */
function getDefaultDimensions(modelId: string): number {
  if (modelId.includes('3-large')) {
    return 3072;
  }
  if (modelId.includes('3-small') || modelId.includes('ada-002')) {
    return 1536;
  }
  return 1536;
}

/**
 * Creates an embedding handler for OpenAI's Embeddings API.
 *
 * @returns An embedding handler configured for OpenAI
 *
 * @example
 * ```typescript
 * const handler = createEmbeddingHandler();
 * const model = handler.bind('text-embedding-3-large');
 *
 * const response = await model.embed({
 *   inputs: ['Hello world'],
 *   config: { apiKey: 'sk-...' }
 * });
 * ```
 */
export function createEmbeddingHandler(): EmbeddingHandler<OpenAIEmbedParams> {
  let providerRef: EmbeddingProvider<OpenAIEmbedParams> | null = null;

  return {
    supportedInputs: ['text'],

    _setProvider(provider: EmbeddingProvider<OpenAIEmbedParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundEmbeddingModel<OpenAIEmbedParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'openai',
          'embedding'
        );
      }

      const model: BoundEmbeddingModel<OpenAIEmbedParams> = {
        modelId,
        maxBatchSize: 2048,
        maxInputLength: 8191,
        dimensions: getDefaultDimensions(modelId),

        get provider(): EmbeddingProvider<OpenAIEmbedParams> {
          return providerRef!;
        },

        async embed(request: EmbeddingRequest<OpenAIEmbedParams>): Promise<EmbeddingResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENAI_API_KEY',
            'openai',
            'embedding'
          );

          const baseUrl = request.config.baseUrl ?? OPENAI_EMBEDDINGS_API_URL;

          // Transform inputs to strings
          const inputTexts = request.inputs.map((input) => {
            if (typeof input === 'string') {
              return input;
            }
            if ('text' in input) {
              return input.text;
            }
            throw new UPPError(
              'OpenAI embeddings only support text input',
              'INVALID_REQUEST',
              'openai',
              'embedding'
            );
          });

          // Build request body - params pass through unchanged
          const body: Record<string, unknown> = {
            model: modelId,
            input: inputTexts,
          };

          // Pass through OpenAI-specific params
          if (request.params?.dimensions !== undefined) {
            body.dimensions = request.params.dimensions;
          }
          if (request.params?.encoding_format !== undefined) {
            body.encoding_format = request.params.encoding_format;
          }
          if (request.params?.user !== undefined) {
            body.user = request.params.user;
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          };

          // Merge custom headers
          if (request.config.headers) {
            for (const [key, value] of Object.entries(request.config.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }
          }

          const response = await doFetch(baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: request.signal,
          }, request.config, 'openai', 'embedding');

          const data = await response.json() as OpenAIEmbeddingsResponse;

          // Return EmbeddingResponse - vector is floats or base64 string
          return {
            embeddings: data.data.map((d) => ({
              vector: d.embedding,
              index: d.index,
            })),
            usage: { totalTokens: data.usage.total_tokens },
          };
        },
      };

      return model;
    },
  };
}
