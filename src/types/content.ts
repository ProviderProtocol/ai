/**
 * Content block types for messages
 */

/**
 * Image source types
 */
export type ImageSource =
  | { type: 'base64'; data: string }
  | { type: 'url'; url: string }
  | { type: 'bytes'; data: Uint8Array };

/**
 * Text content block
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/**
 * Image content block
 */
export interface ImageBlock {
  type: 'image';
  source: ImageSource;
  mimeType: string;
  width?: number;
  height?: number;
}

/**
 * Audio content block
 */
export interface AudioBlock {
  type: 'audio';
  data: Uint8Array;
  mimeType: string;
  duration?: number;
}

/**
 * Video content block
 */
export interface VideoBlock {
  type: 'video';
  data: Uint8Array;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
}

/**
 * Binary content block for arbitrary data
 */
export interface BinaryBlock {
  type: 'binary';
  data: Uint8Array;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

/**
 * All content block types
 */
export type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | BinaryBlock;

/**
 * Content types allowed in user messages
 */
export type UserContent =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | BinaryBlock;

/**
 * Content types allowed in assistant messages
 */
export type AssistantContent =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock;

/**
 * Helper to create a text block
 */
export function text(content: string): TextBlock {
  return { type: 'text', text: content };
}

/**
 * Type guard for TextBlock
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

/**
 * Type guard for ImageBlock
 */
export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image';
}

/**
 * Type guard for AudioBlock
 */
export function isAudioBlock(block: ContentBlock): block is AudioBlock {
  return block.type === 'audio';
}

/**
 * Type guard for VideoBlock
 */
export function isVideoBlock(block: ContentBlock): block is VideoBlock {
  return block.type === 'video';
}

/**
 * Type guard for BinaryBlock
 */
export function isBinaryBlock(block: ContentBlock): block is BinaryBlock {
  return block.type === 'binary';
}
