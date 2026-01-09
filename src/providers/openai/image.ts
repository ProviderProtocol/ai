/**
 * @fileoverview OpenAI Image Generation API Handler
 *
 * This module implements the image handler for OpenAI's Image Generation APIs.
 * Supports DALL-E 2, DALL-E 3, and GPT-Image models (gpt-image-1, gpt-image-1.5, etc).
 *
 * @see {@link https://platform.openai.com/docs/api-reference/images OpenAI Images API Reference}
 * @module providers/openai/image
 */

import type { ImageProvider } from '../../types/provider.ts';
import type {
  BoundImageModel,
  ImageRequest,
  ImageEditRequest,
  ImageResponse,
  ImageCapabilities,
  ImageHandler,
  ImageProviderStreamResult,
  ImageStreamEvent,
  GeneratedImage,
} from '../../types/image.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch } from '../../http/fetch.ts';
import { Image } from '../../core/media/Image.ts';

const OPENAI_IMAGES_API_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGES_EDIT_URL = 'https://api.openai.com/v1/images/edits';

/**
 * OpenAI image generation parameters.
 * Passed through unchanged to the API.
 */
export interface OpenAIImageParams {
  /** Number of images to generate (1-10 for GPT Image, 1 for DALL-E 3) */
  n?: number;
  /** Output size (varies by model) */
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792' | '1536x1024' | '1024x1536' | 'auto';
  /** Image quality */
  quality?: 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto';
  /** Style (DALL-E 3 only) */
  style?: 'vivid' | 'natural';
  /** Background transparency (GPT Image only) */
  background?: 'transparent' | 'opaque' | 'auto';
  /** Output format (GPT Image only) */
  output_format?: 'png' | 'jpeg' | 'webp';
  /** Output compression (0-100 for webp/jpeg) */
  output_compression?: number;
  /** Response format */
  response_format?: 'url' | 'b64_json';
  /** Content moderation (GPT Image only) */
  moderation?: 'auto' | 'low';
  /** Enable streaming (GPT Image only) */
  stream?: boolean;
  /** Number of partial images during streaming (0-3) */
  partial_images?: number;
  /** User identifier */
  user?: string;
}

/**
 * OpenAI image generation API response structure.
 */
interface OpenAIImagesResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  usage?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: {
      text_tokens?: number;
      image_tokens?: number;
    };
  };
}

/**
 * Stream event from OpenAI's streaming image generation.
 */
interface OpenAIImageStreamChunk {
  type: string;
  index?: number;
  data?: {
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  };
}

/**
 * Determines capabilities based on model ID.
 */
function getCapabilities(modelId: string): ImageCapabilities {
  const isGptImage = modelId.startsWith('gpt-image');
  const isDalle2 = modelId === 'dall-e-2';

  return {
    generate: true,
    streaming: isGptImage,
    edit: true,
    maxImages: isDalle2 ? 10 : isGptImage ? 10 : 1,
  };
}

/**
 * Creates an image handler for OpenAI's Image Generation API.
 *
 * @returns An image handler configured for OpenAI
 *
 * @example
 * ```typescript
 * const handler = createImageHandler();
 * const model = handler.bind('dall-e-3');
 *
 * const response = await model.generate({
 *   prompt: 'A sunset over mountains',
 *   config: { apiKey: 'sk-...' },
 *   params: { size: '1024x1024', quality: 'hd' }
 * });
 * ```
 */
export function createImageHandler(): ImageHandler<OpenAIImageParams> {
  let providerRef: ImageProvider<OpenAIImageParams> | null = null;

  return {
    _setProvider(provider: ImageProvider<OpenAIImageParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundImageModel<OpenAIImageParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'openai',
          'image'
        );
      }

      const capabilities = getCapabilities(modelId);

      const model: BoundImageModel<OpenAIImageParams> = {
        modelId,
        capabilities,

        get provider(): ImageProvider<OpenAIImageParams> {
          return providerRef!;
        },

        async generate(request: ImageRequest<OpenAIImageParams>): Promise<ImageResponse> {
          return executeGenerate(modelId, request);
        },

        async edit(request: ImageEditRequest<OpenAIImageParams>): Promise<ImageResponse> {
          return executeEdit(modelId, request);
        },
      };

      if (capabilities.streaming) {
        model.stream = function (request: ImageRequest<OpenAIImageParams>): ImageProviderStreamResult {
          return executeStream(modelId, request);
        };
      }

      return model;
    },
  };
}

/**
 * Execute a non-streaming image generation request.
 */
async function executeGenerate(
  modelId: string,
  request: ImageRequest<OpenAIImageParams>
): Promise<ImageResponse> {
  const apiKey = await resolveApiKey(
    request.config,
    'OPENAI_API_KEY',
    'openai',
    'image'
  );

  const baseUrl = request.config.baseUrl
    ? `${request.config.baseUrl.replace(/\/$/, '')}/v1/images/generations`
    : OPENAI_IMAGES_API_URL;

  const body: Record<string, unknown> = {
    model: modelId,
    prompt: request.prompt,
  };

  if (request.params) {
    const { n, size, quality, style, background, output_format, output_compression, response_format, moderation, user } = request.params;
    if (n !== undefined) body.n = n;
    if (size !== undefined) body.size = size;
    if (quality !== undefined) body.quality = quality;
    if (style !== undefined) body.style = style;
    if (background !== undefined) body.background = background;
    if (output_format !== undefined) body.output_format = output_format;
    if (output_compression !== undefined) body.output_compression = output_compression;
    if (response_format !== undefined) body.response_format = response_format;
    if (moderation !== undefined) body.moderation = moderation;
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
  }, request.config, 'openai', 'image');

  const data = await response.json() as OpenAIImagesResponse;

  return transformResponse(data);
}

/**
 * Execute an image edit request.
 */
async function executeEdit(
  modelId: string,
  request: ImageEditRequest<OpenAIImageParams>
): Promise<ImageResponse> {
  const apiKey = await resolveApiKey(
    request.config,
    'OPENAI_API_KEY',
    'openai',
    'image'
  );

  const baseUrl = request.config.baseUrl
    ? `${request.config.baseUrl.replace(/\/$/, '')}/v1/images/edits`
    : OPENAI_IMAGES_EDIT_URL;

  const formData = new FormData();
  formData.append('model', modelId);
  formData.append('prompt', request.prompt);

  const imageBytes = request.image.toBytes();
  const imageBlob = new Blob([imageBytes], { type: request.image.mimeType });
  formData.append('image', imageBlob, 'image.png');

  if (request.mask) {
    const maskBytes = request.mask.toBytes();
    const maskBlob = new Blob([maskBytes], { type: request.mask.mimeType });
    formData.append('mask', maskBlob, 'mask.png');
  }

  if (request.params) {
    const { n, size, response_format, user } = request.params;
    if (n !== undefined) formData.append('n', String(n));
    if (size !== undefined) formData.append('size', size);
    if (response_format !== undefined) formData.append('response_format', response_format);
    if (user !== undefined) formData.append('user', user);
  }

  const headers: Record<string, string> = {
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
    body: formData,
    signal: request.signal,
  }, request.config, 'openai', 'image');

  const data = await response.json() as OpenAIImagesResponse;

  return transformResponse(data);
}

/**
 * Execute a streaming image generation request.
 */
function executeStream(
  modelId: string,
  request: ImageRequest<OpenAIImageParams>
): ImageProviderStreamResult {
  const abortController = new AbortController();

  let resolveResponse: (response: ImageResponse) => void;
  let rejectResponse: (error: Error) => void;
  const responsePromise = new Promise<ImageResponse>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  async function* generateStream(): AsyncGenerator<ImageStreamEvent, void, unknown> {
    try {
      const apiKey = await resolveApiKey(
        request.config,
        'OPENAI_API_KEY',
        'openai',
        'image'
      );

      const baseUrl = request.config.baseUrl
        ? `${request.config.baseUrl.replace(/\/$/, '')}/v1/images/generations`
        : OPENAI_IMAGES_API_URL;

      const body: Record<string, unknown> = {
        model: modelId,
        prompt: request.prompt,
        stream: true,
      };

      if (request.params) {
        const { n, size, quality, background, output_format, partial_images, moderation, user } = request.params;
        if (n !== undefined) body.n = n;
        if (size !== undefined) body.size = size;
        if (quality !== undefined) body.quality = quality;
        if (background !== undefined) body.background = background;
        if (output_format !== undefined) body.output_format = output_format;
        if (partial_images !== undefined) body.partial_images = partial_images;
        if (moderation !== undefined) body.moderation = moderation;
        if (user !== undefined) body.user = user;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      };

      if (request.config.headers) {
        for (const [key, value] of Object.entries(request.config.headers)) {
          if (value !== undefined) {
            headers[key] = value;
          }
        }
      }

      const mergedSignal = request.signal
        ? AbortSignal.any([abortController.signal, request.signal])
        : abortController.signal;

      const response = await doFetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: mergedSignal,
      }, request.config, 'openai', 'image');

      const reader = response.body?.getReader();
      if (!reader) {
        throw new UPPError(
          'No response body for streaming',
          'PROVIDER_ERROR',
          'openai',
          'image'
        );
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const generatedImages: GeneratedImage[] = [];
      let responseMetadata: Record<string, unknown> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const chunk = JSON.parse(data) as OpenAIImageStreamChunk;

              if (chunk.type === 'image_generation.partial_image' && chunk.data?.b64_json) {
                const previewImage = Image.fromBase64(chunk.data.b64_json, 'image/png');
                yield {
                  type: 'preview',
                  image: previewImage,
                  index: chunk.index ?? 0,
                };
              } else if (chunk.type === 'image_generation.completed' && chunk.data) {
                const image = chunk.data.b64_json
                  ? Image.fromBase64(chunk.data.b64_json, 'image/png')
                  : Image.fromUrl(chunk.data.url ?? '', 'image/png');

                const genImage: GeneratedImage = {
                  image,
                  metadata: chunk.data.revised_prompt
                    ? { revised_prompt: chunk.data.revised_prompt }
                    : undefined,
                };

                generatedImages.push(genImage);

                yield {
                  type: 'complete',
                  image: genImage,
                  index: chunk.index ?? generatedImages.length - 1,
                };
              } else if (chunk.type === 'response.done') {
                responseMetadata = chunk.data as unknown as Record<string, unknown>;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }

      resolveResponse({
        images: generatedImages,
        metadata: responseMetadata,
        usage: {
          imagesGenerated: generatedImages.length,
        },
      });
    } catch (error) {
      rejectResponse(error as Error);
      throw error;
    }
  }

  const generator = generateStream();

  return {
    [Symbol.asyncIterator]: () => generator,
    response: responsePromise,
  };
}

/**
 * Transform OpenAI response to ImageResponse.
 */
function transformResponse(data: OpenAIImagesResponse): ImageResponse {
  const images: GeneratedImage[] = data.data.map((item) => {
    let image: Image;
    if (item.b64_json) {
      image = Image.fromBase64(item.b64_json, 'image/png');
    } else if (item.url) {
      image = Image.fromUrl(item.url, 'image/png');
    } else {
      throw new UPPError(
        'No image data in response',
        'PROVIDER_ERROR',
        'openai',
        'image'
      );
    }

    return {
      image,
      metadata: item.revised_prompt ? { revised_prompt: item.revised_prompt } : undefined,
    };
  });

  return {
    images,
    usage: data.usage ? {
      imagesGenerated: images.length,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    } : {
      imagesGenerated: images.length,
    },
  };
}
