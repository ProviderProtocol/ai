/**
 * @fileoverview OpenRouter Embeddings API Handler
 *
 * This module implements the embedding handler for OpenRouter's embeddings API.
 * OpenRouter provides access to multiple embedding providers through an OpenAI-compatible endpoint.
 *
 * @see {@link https://openrouter.ai/docs/api/reference/embeddings OpenRouter Embeddings API Reference}
 * @module providers/openrouter/embed
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

/** Base URL for OpenRouter's Embeddings API endpoint */
const OPENROUTER_EMBEDDINGS_API_URL = 'https://openrouter.ai/api/v1/embeddings';

/**
 * OpenRouter embedding parameters.
 * Passed through unchanged to the API.
 */
export interface OpenRouterEmbedParams {
  /** Output dimensions (model-dependent) */
  dimensions?: number;
  /** Encoding format: 'float' or 'base64' */
  encoding_format?: 'float' | 'base64';
  /** A unique identifier representing your end-user */
  user?: string;
  /** Input type hint for some models */
  input_type?: string;
}

/**
 * OpenRouter embeddings API response structure (OpenAI-compatible).
 */
interface OpenRouterEmbeddingsResponse {
  id: string;
  object: 'list';
  data: Array<{
    index: number;
    embedding: number[] | string;
    type: 'embedding';
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
    cost?: number;
  };
}

/**
 * Get default dimensions for a model.
 */
function getDefaultDimensions(modelId: string): number {
  if (modelId.includes('text-embedding-3-large')) {
    return 3072;
  }
  if (modelId.includes('text-embedding-3-small') || modelId.includes('ada-002')) {
    return 1536;
  }
  if (modelId.includes('gemini-embedding')) {
    return 3072;
  }
  return 1536;
}

/**
 * Creates an embedding handler for OpenRouter's Embeddings API.
 *
 * @returns An embedding handler configured for OpenRouter
 *
 * @example
 * ```typescript
 * const handler = createEmbeddingHandler();
 * const model = handler.bind('openai/text-embedding-3-large');
 *
 * const response = await model.embed({
 *   inputs: ['Hello world'],
 *   config: { apiKey: 'sk-or-...' }
 * });
 * ```
 */
export function createEmbeddingHandler(): EmbeddingHandler<OpenRouterEmbedParams> {
  let providerRef: EmbeddingProvider<OpenRouterEmbedParams> | null = null;

  return {
    supportedInputs: ['text'],

    _setProvider(provider: EmbeddingProvider<OpenRouterEmbedParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundEmbeddingModel<OpenRouterEmbedParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'openrouter',
          'embedding'
        );
      }

      const model: BoundEmbeddingModel<OpenRouterEmbedParams> = {
        modelId,
        maxBatchSize: 2048,
        maxInputLength: 8191,
        dimensions: getDefaultDimensions(modelId),

        get provider(): EmbeddingProvider<OpenRouterEmbedParams> {
          return providerRef!;
        },

        async embed(request: EmbeddingRequest<OpenRouterEmbedParams>): Promise<EmbeddingResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'OPENROUTER_API_KEY',
            'openrouter',
            'embedding'
          );

          const baseUrl = request.config.baseUrl ?? OPENROUTER_EMBEDDINGS_API_URL;

          // Transform inputs to strings
          const inputTexts = request.inputs.map((input) => {
            if (typeof input === 'string') {
              return input;
            }
            if ('text' in input) {
              return input.text;
            }
            throw new UPPError(
              'OpenRouter embeddings only support text input',
              'INVALID_REQUEST',
              'openrouter',
              'embedding'
            );
          });

          // Build request body - params pass through unchanged
          const body: Record<string, unknown> = {
            model: modelId,
            input: inputTexts,
          };

          // Pass through OpenRouter-specific params
          if (request.params?.dimensions !== undefined) {
            body.dimensions = request.params.dimensions;
          }
          if (request.params?.encoding_format !== undefined) {
            body.encoding_format = request.params.encoding_format;
          }
          if (request.params?.user !== undefined) {
            body.user = request.params.user;
          }
          if (request.params?.input_type !== undefined) {
            body.input_type = request.params.input_type;
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
          }, request.config, 'openrouter', 'embedding');

          const data = await response.json() as OpenRouterEmbeddingsResponse;

          // Return EmbeddingResponse - vector is floats or base64 string
          return {
            embeddings: data.data.map((d) => ({
              vector: d.embedding,
              index: d.index,
            })),
            usage: { totalTokens: data.usage.total_tokens },
            metadata: data.usage.cost !== undefined ? { cost: data.usage.cost } : undefined,
          };
        },
      };

      return model;
    },
  };
}
