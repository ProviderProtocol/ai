/**
 * @fileoverview Content block types for multimodal messages.
 *
 * Defines the various content block types that can be included in
 * user and assistant messages, supporting text, images, audio, video,
 * and arbitrary binary data.
 *
 * @module types/content
 */

/**
 * Content block type constants.
 *
 * Use these constants instead of raw strings for type-safe content handling:
 *
 * @example
 * ```typescript
 * import { ContentBlockType } from 'upp';
 *
 * if (block.type === ContentBlockType.Text) {
 *   console.log(block.text);
 * } else if (block.type === ContentBlockType.Image) {
 *   console.log(block.mimeType);
 * }
 * ```
 */
export const ContentBlockType = {
  /** Text content */
  Text: 'text',
  /** Image content */
  Image: 'image',
  /** Audio content */
  Audio: 'audio',
  /** Video content */
  Video: 'video',
  /** Binary/arbitrary data content */
  Binary: 'binary',
} as const;

/**
 * Content block type discriminator union.
 *
 * This type is derived from {@link ContentBlockType} constants.
 */
export type ContentBlockType = (typeof ContentBlockType)[keyof typeof ContentBlockType];

/**
 * Image source type constants.
 *
 * @example
 * ```typescript
 * import { ImageSourceType } from 'upp';
 *
 * if (source.type === ImageSourceType.Base64) {
 *   // Handle base64 encoded image
 * } else if (source.type === ImageSourceType.Url) {
 *   // Handle URL reference
 * }
 * ```
 */
export const ImageSourceType = {
  /** Base64-encoded image data */
  Base64: 'base64',
  /** URL reference to image */
  Url: 'url',
  /** Raw bytes image data */
  Bytes: 'bytes',
} as const;

/**
 * Image source type discriminator union.
 *
 * This type is derived from {@link ImageSourceType} constants.
 */
export type ImageSourceType = (typeof ImageSourceType)[keyof typeof ImageSourceType];

/**
 * Image source variants for ImageBlock.
 *
 * Images can be provided as base64-encoded strings, URLs, or raw bytes.
 *
 * @example
 * ```typescript
 * // Base64 encoded image
 * const base64Source: ImageSource = {
 *   type: 'base64',
 *   data: 'iVBORw0KGgo...'
 * };
 *
 * // URL reference
 * const urlSource: ImageSource = {
 *   type: 'url',
 *   url: 'https://example.com/image.png'
 * };
 *
 * // Raw bytes
 * const bytesSource: ImageSource = {
 *   type: 'bytes',
 *   data: new Uint8Array([...])
 * };
 * ```
 */
export type ImageSource =
  | { type: 'base64'; data: string }
  | { type: 'url'; url: string }
  | { type: 'bytes'; data: Uint8Array };

/**
 * Text content block.
 *
 * The most common content block type, containing plain text content.
 *
 * @example
 * ```typescript
 * const textBlock: TextBlock = {
 *   type: 'text',
 *   text: 'Hello, world!'
 * };
 * ```
 */
export interface TextBlock {
  /** Discriminator for text blocks */
  type: 'text';

  /** The text content */
  text: string;
}

/**
 * Image content block.
 *
 * Contains an image with its source data and metadata.
 *
 * @example
 * ```typescript
 * const imageBlock: ImageBlock = {
 *   type: 'image',
 *   source: { type: 'url', url: 'https://example.com/photo.jpg' },
 *   mimeType: 'image/jpeg',
 *   width: 1920,
 *   height: 1080
 * };
 * ```
 */
export interface ImageBlock {
  /** Discriminator for image blocks */
  type: 'image';

  /** The image data source */
  source: ImageSource;

  /** MIME type of the image (e.g., 'image/png', 'image/jpeg') */
  mimeType: string;

  /** Image width in pixels */
  width?: number;

  /** Image height in pixels */
  height?: number;
}

/**
 * Audio content block.
 *
 * Contains audio data with its metadata.
 *
 * @example
 * ```typescript
 * const audioBlock: AudioBlock = {
 *   type: 'audio',
 *   data: audioBytes,
 *   mimeType: 'audio/mp3',
 *   duration: 120.5
 * };
 * ```
 */
export interface AudioBlock {
  /** Discriminator for audio blocks */
  type: 'audio';

  /** Raw audio data */
  data: Uint8Array;

  /** MIME type of the audio (e.g., 'audio/mp3', 'audio/wav') */
  mimeType: string;

  /** Duration in seconds */
  duration?: number;
}

/**
 * Video content block.
 *
 * Contains video data with its metadata.
 *
 * @example
 * ```typescript
 * const videoBlock: VideoBlock = {
 *   type: 'video',
 *   data: videoBytes,
 *   mimeType: 'video/mp4',
 *   duration: 30,
 *   width: 1920,
 *   height: 1080
 * };
 * ```
 */
export interface VideoBlock {
  /** Discriminator for video blocks */
  type: 'video';

  /** Raw video data */
  data: Uint8Array;

  /** MIME type of the video (e.g., 'video/mp4', 'video/webm') */
  mimeType: string;

  /** Duration in seconds */
  duration?: number;

  /** Video width in pixels */
  width?: number;

  /** Video height in pixels */
  height?: number;
}

/**
 * Binary content block for arbitrary data.
 *
 * A generic block type for data that doesn't fit other categories.
 *
 * @example
 * ```typescript
 * const binaryBlock: BinaryBlock = {
 *   type: 'binary',
 *   data: pdfBytes,
 *   mimeType: 'application/pdf',
 *   metadata: { filename: 'document.pdf', pages: 10 }
 * };
 * ```
 */
export interface BinaryBlock {
  /** Discriminator for binary blocks */
  type: 'binary';

  /** Raw binary data */
  data: Uint8Array;

  /** MIME type of the data */
  mimeType: string;

  /** Additional metadata about the binary content */
  metadata?: Record<string, unknown>;
}

/**
 * Union of all content block types.
 *
 * Used when a function or property can accept any type of content block.
 */
export type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | BinaryBlock;

/**
 * Content types allowed in user messages.
 *
 * Users can send any type of content block including binary data.
 */
export type UserContent =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | BinaryBlock;

/**
 * Content types allowed in assistant messages.
 *
 * Assistants can generate text and media but not arbitrary binary data.
 */
export type AssistantContent =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock;

/**
 * Creates a text content block from a string.
 *
 * @param content - The text content
 * @returns A TextBlock containing the provided text
 *
 * @example
 * ```typescript
 * const block = text('Hello, world!');
 * // { type: 'text', text: 'Hello, world!' }
 * ```
 */
export function text(content: string): TextBlock {
  return { type: ContentBlockType.Text, text: content };
}

/**
 * Type guard for TextBlock.
 *
 * @param block - The content block to check
 * @returns True if the block is a TextBlock
 *
 * @example
 * ```typescript
 * if (isTextBlock(block)) {
 *   console.log(block.text);
 * }
 * ```
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === ContentBlockType.Text;
}

/**
 * Type guard for ImageBlock.
 *
 * @param block - The content block to check
 * @returns True if the block is an ImageBlock
 *
 * @example
 * ```typescript
 * if (isImageBlock(block)) {
 *   console.log(block.mimeType, block.width, block.height);
 * }
 * ```
 */
export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === ContentBlockType.Image;
}

/**
 * Type guard for AudioBlock.
 *
 * @param block - The content block to check
 * @returns True if the block is an AudioBlock
 *
 * @example
 * ```typescript
 * if (isAudioBlock(block)) {
 *   console.log(block.mimeType, block.duration);
 * }
 * ```
 */
export function isAudioBlock(block: ContentBlock): block is AudioBlock {
  return block.type === ContentBlockType.Audio;
}

/**
 * Type guard for VideoBlock.
 *
 * @param block - The content block to check
 * @returns True if the block is a VideoBlock
 *
 * @example
 * ```typescript
 * if (isVideoBlock(block)) {
 *   console.log(block.mimeType, block.duration);
 * }
 * ```
 */
export function isVideoBlock(block: ContentBlock): block is VideoBlock {
  return block.type === ContentBlockType.Video;
}

/**
 * Type guard for BinaryBlock.
 *
 * @param block - The content block to check
 * @returns True if the block is a BinaryBlock
 *
 * @example
 * ```typescript
 * if (isBinaryBlock(block)) {
 *   console.log(block.mimeType, block.metadata);
 * }
 * ```
 */
export function isBinaryBlock(block: ContentBlock): block is BinaryBlock {
  return block.type === ContentBlockType.Binary;
}
