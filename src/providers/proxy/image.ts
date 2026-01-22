/**
 * @fileoverview Proxy image handler implementation.
 *
 * Transports PP image generation requests over HTTP to a backend server.
 * Supports generate, edit, and streaming operations via SSE.
 *
 * @module providers/proxy/image
 */

import type {
  BoundImageModel,
  ImageRequest,
  ImageEditRequest,
  ImageResponse,
  ImageProviderStreamResult,
  ImageStreamEvent,
  ImageCapabilities,
} from '../../types/image.ts';
import type { ImageProvider, ImageHandler } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { ProxyImageParams, ProxyProviderOptions } from './types.ts';
import { mergeHeaders } from './headers.ts';
import {
  serializeImage,
  deserializeImageResponse,
  deserializeImageStreamEvent,
  type SerializedImageResponse,
  type SerializedImageStreamEvent,
} from './serialization.media.ts';

const PROXY_IMAGE_CAPABILITIES: ImageCapabilities = {
  generate: true,
  streaming: true,
  edit: true,
};

interface ProxyImageRequestBody {
  model: string;
  prompt: string;
  params?: ProxyImageParams;
  image?: ReturnType<typeof serializeImage>;
  mask?: ReturnType<typeof serializeImage>;
}

function buildImageRequestBody(
  modelId: string,
  request: ImageRequest<ProxyImageParams>
): ProxyImageRequestBody {
  return {
    model: modelId,
    prompt: request.prompt,
    params: request.params,
  };
}

function buildImageEditRequestBody(
  modelId: string,
  request: ImageEditRequest<ProxyImageParams>
): ProxyImageRequestBody {
  return {
    model: modelId,
    prompt: request.prompt,
    params: request.params,
    image: serializeImage(request.image),
    mask: request.mask ? serializeImage(request.mask) : undefined,
  };
}

function isImageResponsePayload(
  payload: SerializedImageStreamEvent | SerializedImageResponse
): payload is SerializedImageResponse {
  return !!payload
    && typeof payload === 'object'
    && 'images' in payload
    && Array.isArray((payload as SerializedImageResponse).images);
}

async function executeImageRequest(
  endpoint: string,
  body: ProxyImageRequestBody,
  request: ImageRequest<ProxyImageParams> | ImageEditRequest<ProxyImageParams>,
  defaultHeaders: Record<string, string>
): Promise<ImageResponse> {
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
    'image'
  );

  const data = await parseJsonResponse<SerializedImageResponse>(
    response,
    'proxy',
    'image'
  );

  return deserializeImageResponse(data);
}

function executeImageStream(
  endpoint: string,
  body: ProxyImageRequestBody,
  request: ImageRequest<ProxyImageParams>,
  defaultHeaders: Record<string, string>
): ImageProviderStreamResult {
  const headers = mergeHeaders(request.config.headers, defaultHeaders);

  let resolveResponse: (value: ImageResponse) => void;
  let rejectResponse: (error: Error) => void;
  let responseSettled = false;
  const responsePromise = new Promise<ImageResponse>((resolve, reject) => {
    resolveResponse = (value) => {
      if (!responseSettled) {
        responseSettled = true;
        resolve(value);
      }
    };
    rejectResponse = (error) => {
      if (!responseSettled) {
        responseSettled = true;
        reject(error);
      }
    };
  });

  const generator = async function* generator(): AsyncGenerator<ImageStreamEvent> {
    try {
      const response = await doStreamFetch(
        endpoint,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: request.signal,
        },
        request.config,
        'proxy',
        'image'
      );

      if (!response.ok) {
        throw await normalizeHttpError(response, 'proxy', 'image');
      }

      if (!response.body) {
        throw new UPPError(
          'Response body is null',
          ErrorCode.ProviderError,
          'proxy',
          ModalityType.Image
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;

          if (line.startsWith('data:')) {
            let data = line.slice(5);
            if (data.startsWith(' ')) {
              data = data.slice(1);
            }
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as SerializedImageStreamEvent | SerializedImageResponse;
              if (isImageResponsePayload(parsed)) {
                resolveResponse(deserializeImageResponse(parsed));
              } else {
                yield deserializeImageStreamEvent(parsed);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      const remaining = decoder.decode();
      if (remaining) {
        buffer += remaining;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;
          if (line.startsWith('data:')) {
            let data = line.slice(5);
            if (data.startsWith(' ')) {
              data = data.slice(1);
            }
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as SerializedImageStreamEvent | SerializedImageResponse;
              if (isImageResponsePayload(parsed)) {
                resolveResponse(deserializeImageResponse(parsed));
              } else {
                yield deserializeImageStreamEvent(parsed);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      if (!responseSettled) {
        rejectResponse(new UPPError(
          'Stream ended without final response',
          ErrorCode.InvalidResponse,
          'proxy',
          ModalityType.Image
        ));
      }
    } catch (error) {
      rejectResponse(toError(error));
      throw error;
    }
  };

  return {
    [Symbol.asyncIterator]: generator,
    response: responsePromise,
  };
}

/**
 * Creates a proxy image handler.
 *
 * Supports full ProviderConfig options including retry strategies, timeouts,
 * custom headers, and custom fetch implementations. This allows client-side
 * retry logic for network failures to the proxy server.
 *
 * @param options - Proxy configuration options
 * @returns An image handler that transports requests over HTTP
 */
export function createImageHandler(
  options: ProxyProviderOptions
): ImageHandler<ProxyImageParams> {
  const { endpoint, headers: defaultHeaders = {} } = options;

  let providerRef: ImageProvider<ProxyImageParams> | null = null;

  return {
    _setProvider(provider: ImageProvider<ProxyImageParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundImageModel<ProxyImageParams> {
      const provider = providerRef;
      if (!provider) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'proxy',
          ModalityType.Image
        );
      }

      const model: BoundImageModel<ProxyImageParams> = {
        modelId,
        capabilities: PROXY_IMAGE_CAPABILITIES,

        get provider(): ImageProvider<ProxyImageParams> {
          return provider;
        },

        async generate(request: ImageRequest<ProxyImageParams>): Promise<ImageResponse> {
          const body = buildImageRequestBody(modelId, request);
          return executeImageRequest(endpoint, body, request, defaultHeaders);
        },

        async edit(request: ImageEditRequest<ProxyImageParams>): Promise<ImageResponse> {
          const body = buildImageEditRequestBody(modelId, request);
          return executeImageRequest(endpoint, body, request, defaultHeaders);
        },
      };

      model.stream = function stream(
        request: ImageRequest<ProxyImageParams>
      ): ImageProviderStreamResult {
        const body = buildImageRequestBody(modelId, request);
        return executeImageStream(endpoint, body, request, defaultHeaders);
      };

      return model;
    },
  };
}
