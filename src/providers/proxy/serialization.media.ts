/**
 * @fileoverview Media serialization utilities for proxy transport.
 *
 * Handles converting embedding inputs and image results/events to/from JSON
 * for HTTP transport. These are pure functions with no side effects.
 *
 * @module providers/proxy/serialization.media
 */

import type { ImageSource, ImageBlock } from '../../types/content.ts';
import type { EmbeddingInput } from '../../types/provider.ts';
import type {
  ImageStreamEvent,
  GeneratedImage,
  ImageResponse,
  ImageResult,
  ImageUsage,
} from '../../types/image.ts';
import { Image } from '../../core/media/Image.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';

export type SerializedImageSource =
  | { type: 'base64'; data: string }
  | { type: 'url'; url: string }
  | { type: 'bytes'; data: number[] | string };

export interface SerializedImage {
  source: SerializedImageSource;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface SerializedGeneratedImage {
  image: SerializedImage;
  metadata?: Record<string, unknown>;
}

export interface SerializedImageResponse {
  images: SerializedGeneratedImage[];
  metadata?: Record<string, unknown>;
  usage?: ImageUsage;
}

export type SerializedImageStreamEvent =
  | { type: 'preview'; image: SerializedImage; index: number; metadata?: Record<string, unknown> }
  | { type: 'complete'; image: SerializedGeneratedImage; index: number };

export type SerializedEmbeddingInput =
  | string
  | { type: 'text'; text: string }
  | { type: 'image'; source: SerializedImageSource; mimeType: string };

/**
 * Serialize an EmbeddingInput for JSON transport.
 */
export function serializeEmbeddingInput(input: EmbeddingInput): SerializedEmbeddingInput {
  if (typeof input === 'string') {
    return input;
  }

  if (input.type === 'text') {
    return { type: 'text', text: input.text };
  }

  if (input.type === 'image') {
    const source = serializeUnknownImageSource(input.source, input.mimeType);
    return { type: 'image', source, mimeType: input.mimeType };
  }

  throw new UPPError(
    'Unsupported embedding input type',
    ErrorCode.InvalidRequest,
    'proxy',
    ModalityType.Embedding
  );
}

/**
 * Deserialize an EmbeddingInput from JSON transport.
 */
export function deserializeEmbeddingInput(input: SerializedEmbeddingInput): EmbeddingInput {
  if (typeof input === 'string') {
    return input;
  }

  if (input.type === 'text') {
    return { type: 'text', text: input.text };
  }

  if (input.type === 'image') {
    return {
      type: 'image',
      mimeType: input.mimeType,
      source: deserializeImageSource(input.source),
    };
  }

  throw new UPPError(
    'Unsupported embedding input type',
    ErrorCode.InvalidResponse,
    'proxy',
    ModalityType.Embedding
  );
}

/**
 * Serialize an Image for JSON transport.
 */
export function serializeImage(image: Image): SerializedImage {
  const block = image.toBlock();
  return {
    source: serializeImageSource(block.source),
    mimeType: block.mimeType,
    width: block.width,
    height: block.height,
  };
}

/**
 * Deserialize an Image from JSON transport.
 */
export function deserializeImage(image: SerializedImage): Image {
  const block: ImageBlock = {
    type: 'image',
    source: deserializeImageSource(image.source),
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
  };
  return Image.fromBlock(block);
}

/**
 * Serialize a GeneratedImage for JSON transport.
 */
export function serializeGeneratedImage(image: GeneratedImage): SerializedGeneratedImage {
  return {
    image: serializeImage(image.image),
    metadata: image.metadata,
  };
}

/**
 * Deserialize a GeneratedImage from JSON transport.
 */
export function deserializeGeneratedImage(image: SerializedGeneratedImage): GeneratedImage {
  return {
    image: deserializeImage(image.image),
    metadata: image.metadata,
  };
}

/**
 * Serialize an ImageResult or ImageResponse for JSON transport.
 */
export function serializeImageResult(
  result: ImageResult | ImageResponse
): SerializedImageResponse {
  return {
    images: result.images.map(serializeGeneratedImage),
    metadata: result.metadata,
    usage: result.usage,
  };
}

/**
 * Deserialize an ImageResponse from JSON transport.
 */
export function deserializeImageResponse(
  response: SerializedImageResponse
): ImageResponse {
  if (!response || typeof response !== 'object' || !Array.isArray(response.images)) {
    throw new UPPError(
      'Invalid image response',
      ErrorCode.InvalidResponse,
      'proxy',
      ModalityType.Image
    );
  }

  return {
    images: response.images.map(deserializeGeneratedImage),
    metadata: response.metadata,
    usage: response.usage,
  };
}

/**
 * Serialize an ImageStreamEvent for JSON transport.
 */
export function serializeImageStreamEvent(
  event: ImageStreamEvent
): SerializedImageStreamEvent {
  if (event.type === 'preview') {
    return {
      type: 'preview',
      index: event.index,
      image: serializeImage(event.image),
      metadata: event.metadata,
    };
  }

  return {
    type: 'complete',
    index: event.index,
    image: serializeGeneratedImage(event.image),
  };
}

/**
 * Deserialize an ImageStreamEvent from JSON transport.
 */
export function deserializeImageStreamEvent(
  event: SerializedImageStreamEvent
): ImageStreamEvent {
  if (event.type === 'preview') {
    return {
      type: 'preview',
      index: event.index,
      image: deserializeImage(event.image),
      metadata: event.metadata,
    };
  }

  return {
    type: 'complete',
    index: event.index,
    image: deserializeGeneratedImage(event.image),
  };
}

type ImageSourceLike = ImageSource | SerializedImageSource;

function serializeImageSource(source: ImageSourceLike): SerializedImageSource {
  if (source.type === 'base64') {
    return { type: 'base64', data: source.data };
  }
  if (source.type === 'url') {
    return { type: 'url', url: source.url };
  }
  if (typeof source.data === 'string') {
    return { type: 'base64', data: source.data };
  }
  if (source.data instanceof Uint8Array) {
    return { type: 'base64', data: bytesToBase64(source.data) };
  }
  return { type: 'base64', data: bytesToBase64(Uint8Array.from(source.data)) };
}

function serializeUnknownImageSource(
  source: unknown,
  mimeType: string
): SerializedImageSource {
  if (source instanceof Image) {
    return serializeImage(source).source;
  }

  if (isImageSource(source)) {
    return serializeImageSource(source);
  }

  if (typeof source === 'string') {
    return { type: 'base64', data: source };
  }

  throw new UPPError(
    `Unsupported image source for ${mimeType}`,
    ErrorCode.InvalidRequest,
    'proxy',
    ModalityType.Embedding
  );
}

function deserializeImageSource(source: SerializedImageSource): ImageSource {
  if (source.type === 'base64') {
    return { type: 'base64', data: source.data };
  }
  if (source.type === 'url') {
    return { type: 'url', url: source.url };
  }
  return { type: 'bytes', data: coerceBytes(source.data) };
}

function isImageSource(value: unknown): value is ImageSource {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const source = value as Record<string, unknown>;
  if (source.type === 'base64') {
    return typeof source.data === 'string';
  }
  if (source.type === 'url') {
    return typeof source.url === 'string';
  }
  if (source.type === 'bytes') {
    return source.data instanceof Uint8Array || Array.isArray(source.data) || typeof source.data === 'string';
  }
  return false;
}

function coerceBytes(data: number[] | string): Uint8Array {
  if (typeof data === 'string') {
    return base64ToBytes(data);
  }
  return Uint8Array.from(data);
}

function bytesToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  return Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
}
