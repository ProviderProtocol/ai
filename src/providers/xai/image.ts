/**
 * @fileoverview xAI Image Generation API Handler
 *
 * This module implements the image handler for xAI's Image Generation API (Aurora).
 * Supports the grok-2-image-1212 model.
 *
 * @see {@link https://docs.x.ai/docs/image-generation xAI Image Generation Reference}
 * @module providers/xai/image
 */

import type { ImageProvider, ImageHandler } from '../../types/provider.ts';
import type {
  BoundImageModel,
  ImageRequest,
  ImageResponse,
  ImageCapabilities,
  GeneratedImage,
} from '../../types/image.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch } from '../../http/fetch.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { Image } from '../../core/media/Image.ts';

const XAI_IMAGES_API_URL = 'https://api.x.ai/v1/images/generations';

/**
 * xAI image generation parameters.
 * Passed through unchanged to the API.
 *
 * Note: xAI does NOT support negative_prompt or seed parameters.
 */
export interface XAIImageParams {
  /** Number of images to generate (1-10) */
  n?: number;
  /** Response format */
  response_format?: 'url' | 'b64_json';
  /** User identifier */
  user?: string;
}

/**
 * xAI image generation API response structure.
 */
interface XAIImagesResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

/**
 * Determines capabilities based on model ID.
 */
function getCapabilities(modelId: string): ImageCapabilities {
  return {
    generate: true,
    streaming: false,
    edit: false,
    maxImages: 10,
  };
}

/**
 * Transform xAI response to ImageResponse.
 */
function transformResponse(data: XAIImagesResponse): ImageResponse {
  const images: GeneratedImage[] = data.data.map((item) => {
    let image: Image;
    if (item.b64_json) {
      image = Image.fromBase64(item.b64_json, 'image/jpeg');
    } else if (item.url) {
      image = Image.fromUrl(item.url, 'image/jpeg');
    } else {
      throw new UPPError(
        'No image data in response',
        ErrorCode.ProviderError,
        'xai',
        ModalityType.Image
      );
    }

    return {
      image,
      metadata: item.revised_prompt
        ? { xai: { revised_prompt: item.revised_prompt } }
        : undefined,
    };
  });

  return {
    images,
    usage: {
      imagesGenerated: images.length,
    },
  };
}

/**
 * Execute a non-streaming image generation request.
 */
async function executeGenerate(
  modelId: string,
  request: ImageRequest<XAIImageParams>
): Promise<ImageResponse> {
  const apiKey = await resolveApiKey(
    request.config,
    'XAI_API_KEY',
    'xai',
    'image'
  );

  const baseUrl = request.config.baseUrl
    ? `${request.config.baseUrl.replace(/\/$/, '')}/v1/images/generations`
    : XAI_IMAGES_API_URL;

  const body: Record<string, unknown> = {
    model: modelId,
    prompt: request.prompt,
  };

  if (request.params) {
    const { n, response_format, user } = request.params;
    if (n !== undefined) body.n = n;
    if (response_format !== undefined) body.response_format = response_format;
    if (user !== undefined) body.user = user;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

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
  }, request.config, 'xai', 'image');

  const data = await parseJsonResponse<XAIImagesResponse>(response, 'xai', 'image');

  return transformResponse(data);
}

/**
 * Creates an image handler for xAI's Image Generation API.
 *
 * @returns An image handler configured for xAI
 *
 * @example
 * ```typescript
 * const handler = createImageHandler();
 * const model = handler.bind('grok-2-image-1212');
 *
 * const response = await model.generate({
 *   prompt: 'A sunset over mountains',
 *   config: { apiKey: 'xai-...' },
 *   params: { n: 1 }
 * });
 * ```
 */
export function createImageHandler(): ImageHandler<XAIImageParams> {
  let providerRef: ImageProvider<XAIImageParams> | null = null;

  return {
    _setProvider(provider: ImageProvider<XAIImageParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundImageModel<XAIImageParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          ErrorCode.InvalidRequest,
          'xai',
          ModalityType.Image
        );
      }

      const capabilities = getCapabilities(modelId);

      const model: BoundImageModel<XAIImageParams> = {
        modelId,
        capabilities,

        get provider(): ImageProvider<XAIImageParams> {
          return providerRef!;
        },

        async generate(request: ImageRequest<XAIImageParams>): Promise<ImageResponse> {
          return executeGenerate(modelId, request);
        },
      };

      return model;
    },
  };
}
