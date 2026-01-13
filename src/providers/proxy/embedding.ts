/**
 * @fileoverview Proxy embedding handler implementation.
 *
 * Transports PP embedding requests over HTTP to a backend server.
 * The proxy is a pure transport layer - PP types go in, PP types come out.
 *
 * @module providers/proxy/embedding
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
import type { ProxyEmbeddingParams, ProxyProviderOptions } from './types.ts';
import { mergeHeaders } from './headers.ts';
import { serializeEmbeddingInput } from './serialization.media.ts';

const DEFAULT_MAX_BATCH_SIZE = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_INPUT_LENGTH = Number.MAX_SAFE_INTEGER;
const DEFAULT_DIMENSIONS = 0;

interface ProxyEmbeddingVector {
  vector: number[] | string;
  index?: number;
  tokens?: number;
  metadata?: Record<string, unknown>;
  dimensions?: number;
}

interface ProxyEmbeddingResponsePayload {
  embeddings: ProxyEmbeddingVector[];
  usage?: {
    totalTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Creates a proxy embedding handler.
 *
 * Supports full ProviderConfig options including retry strategies, timeouts,
 * custom headers, and custom fetch implementations. This allows client-side
 * retry logic for network failures to the proxy server.
 *
 * @param options - Proxy configuration options
 * @returns An embedding handler that transports requests over HTTP
 */
export function createEmbeddingHandler(
  options: ProxyProviderOptions
): EmbeddingHandler<ProxyEmbeddingParams> {
  const { endpoint, headers: defaultHeaders = {} } = options;

  let providerRef: EmbeddingProvider<ProxyEmbeddingParams> | null = null;

  return {
    supportedInputs: ['text', 'image'],

    _setProvider(provider: EmbeddingProvider<ProxyEmbeddingParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundEmbeddingModel<ProxyEmbeddingParams> {
      const provider = providerRef;
      if (!provider) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'proxy',
          ModalityType.Embedding
        );
      }

      const model: BoundEmbeddingModel<ProxyEmbeddingParams> = {
        modelId,
        maxBatchSize: DEFAULT_MAX_BATCH_SIZE,
        maxInputLength: DEFAULT_MAX_INPUT_LENGTH,
        dimensions: DEFAULT_DIMENSIONS,

        get provider(): EmbeddingProvider<ProxyEmbeddingParams> {
          return provider;
        },

        async embed(
          request: EmbeddingRequest<ProxyEmbeddingParams>
        ): Promise<EmbeddingResponse> {
          const body = {
            model: modelId,
            inputs: request.inputs.map(serializeEmbeddingInput),
            params: request.params,
          };

          const headers = mergeHeaders(request.config.headers, defaultHeaders);

          const response = await doFetch(
            endpoint,
            {
              method: 'POST',
              headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'proxy',
            'embedding'
          );

          const data = await parseJsonResponse<ProxyEmbeddingResponsePayload>(
            response,
            'proxy',
            'embedding'
          );

          return normalizeEmbeddingResponse(data);
        },
      };

      return model;
    },
  };
}

function normalizeEmbeddingResponse(
  data: ProxyEmbeddingResponsePayload
): EmbeddingResponse {
  if (!data || typeof data !== 'object' || !Array.isArray(data.embeddings)) {
    throw new UPPError(
      'Invalid embedding response',
      ErrorCode.InvalidResponse,
      'proxy',
      ModalityType.Embedding
    );
  }

  const embeddings = data.embeddings.map((embedding, index) => {
    if (!embedding || typeof embedding !== 'object') {
      throw new UPPError(
        'Invalid embedding entry',
        ErrorCode.InvalidResponse,
        'proxy',
        ModalityType.Embedding
      );
    }

    const vector = embedding.vector;
    if (!Array.isArray(vector) && typeof vector !== 'string') {
      throw new UPPError(
        'Invalid embedding vector',
        ErrorCode.InvalidResponse,
        'proxy',
        ModalityType.Embedding
      );
    }

    const resolvedIndex = typeof embedding.index === 'number' ? embedding.index : index;
    const tokens = typeof embedding.tokens === 'number' ? embedding.tokens : undefined;

    return {
      vector,
      index: resolvedIndex,
      tokens,
      metadata: embedding.metadata,
    };
  });

  const totalTokens = typeof data.usage?.totalTokens === 'number'
    ? data.usage.totalTokens
    : 0;

  return {
    embeddings,
    usage: { totalTokens },
    metadata: data.metadata,
  };
}
