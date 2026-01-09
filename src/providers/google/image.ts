/**
 * @fileoverview Google Imagen Image Generation API Handler
 *
 * This module implements the image handler for Google's Imagen API via Google AI.
 * Supports Imagen 3 and 4 models through the Gemini API.
 *
 * @see {@link https://ai.google.dev/gemini-api/docs/imagen Imagen API Reference}
 * @module providers/google/image
 */

import type { ImageProvider } from '../../types/provider.ts';
import type {
  BoundImageModel,
  ImageRequest,
  ImageResponse,
  ImageCapabilities,
  ImageHandler,
  GeneratedImage,
} from '../../types/image.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch } from '../../http/fetch.ts';
import { Image } from '../../core/media/Image.ts';

const GOOGLE_AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google Imagen generation parameters.
 * Passed through unchanged to the API.
 */
export interface GoogleImagenParams {
  /** Number of images to generate (1-4) */
  sampleCount?: number;
  /** Image size: '1K' (1024px) or '2K' (2048px) */
  imageSize?: '1K' | '2K';
  /** Aspect ratio */
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  /** Person generation setting */
  personGeneration?: 'dont_allow' | 'allow_adult' | 'allow_all';
  /** Safety filter level */
  safetyFilterLevel?: 'block_low_and_above' | 'block_medium_and_above' | 'block_only_high' | 'block_none';
  /** Add invisible SynthID watermark (default: true) */
  addWatermark?: boolean;
  /**
   * Negative prompt to exclude concepts.
   * @deprecated Not supported on Imagen 3.0-002+ and Imagen 4 models. Will be ignored.
   */
  negativePrompt?: string;
}

/**
 * Google Imagen API response structure.
 */
interface GoogleImagenResponse {
  predictions?: Array<{
    bytesBase64Encoded: string;
    mimeType?: string;
  }>;
}

/**
 * Determines capabilities based on model ID.
 */
function getCapabilities(): ImageCapabilities {
  return {
    generate: true,
    streaming: false,
    edit: false,
    maxImages: 4,
  };
}

/**
 * Creates an image handler for Google's Imagen API.
 *
 * @returns An image handler configured for Google Imagen
 *
 * @example
 * ```typescript
 * const handler = createImageHandler();
 * const model = handler.bind('imagen-4.0-generate-001');
 *
 * const response = await model.generate({
 *   prompt: 'A sunset over mountains',
 *   config: { apiKey: '...' },
 *   params: { aspectRatio: '16:9', sampleCount: 4 }
 * });
 * ```
 */
export function createImageHandler(): ImageHandler<GoogleImagenParams> {
  let providerRef: ImageProvider<GoogleImagenParams> | null = null;

  return {
    _setProvider(provider: ImageProvider<GoogleImagenParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundImageModel<GoogleImagenParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'google',
          'image'
        );
      }

      const capabilities = getCapabilities();

      const model: BoundImageModel<GoogleImagenParams> = {
        modelId,
        capabilities,

        get provider(): ImageProvider<GoogleImagenParams> {
          return providerRef!;
        },

        async generate(request: ImageRequest<GoogleImagenParams>): Promise<ImageResponse> {
          return executeGenerate(modelId, request);
        },
      };

      return model;
    },
  };
}

/**
 * Execute a non-streaming image generation request.
 */
async function executeGenerate(
  modelId: string,
  request: ImageRequest<GoogleImagenParams>
): Promise<ImageResponse> {
  const apiKey = await resolveApiKey(
    request.config,
    'GOOGLE_API_KEY',
    'google',
    'image'
  );

  const baseUrl = request.config.baseUrl?.replace(/\/$/, '') ?? GOOGLE_AI_BASE_URL;
  const url = `${baseUrl}/models/${modelId}:predict`;

  const body: Record<string, unknown> = {
    instances: [{
      prompt: request.prompt,
    }],
    parameters: buildParameters(request.params),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };

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
  }, request.config, 'google', 'image');

  const data = await response.json() as GoogleImagenResponse;

  return transformResponse(data);
}

/**
 * Build parameters object for the API.
 */
function buildParameters(params?: GoogleImagenParams): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  if (!params) return parameters;

  if (params.sampleCount !== undefined) parameters.sampleCount = params.sampleCount;
  if (params.imageSize !== undefined) parameters.imageSize = params.imageSize;
  if (params.aspectRatio !== undefined) parameters.aspectRatio = params.aspectRatio;
  if (params.personGeneration !== undefined) parameters.personGeneration = params.personGeneration;
  if (params.safetyFilterLevel !== undefined) parameters.safetyFilterLevel = params.safetyFilterLevel;
  if (params.addWatermark !== undefined) parameters.addWatermark = params.addWatermark;
  if (params.negativePrompt !== undefined) parameters.negativePrompt = params.negativePrompt;

  return parameters;
}

/**
 * Transform Google response to ImageResponse.
 */
function transformResponse(data: GoogleImagenResponse): ImageResponse {
  if (!data.predictions || data.predictions.length === 0) {
    throw new UPPError(
      'No images in response',
      'PROVIDER_ERROR',
      'google',
      'image'
    );
  }

  const images: GeneratedImage[] = data.predictions.map((prediction) => {
    const mimeType = prediction.mimeType ?? 'image/png';
    const image = Image.fromBase64(prediction.bytesBase64Encoded, mimeType);
    return { image };
  });

  return {
    images,
    usage: {
      imagesGenerated: images.length,
    },
  };
}
