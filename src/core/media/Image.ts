/**
 * @fileoverview Image content handling for the Universal Provider Protocol.
 *
 * Provides a unified Image class for working with images across different sources
 * (file paths, URLs, raw bytes, base64). Supports conversion between formats and
 * integration with UPP message content blocks.
 *
 * @module core/media/Image
 */

import type { ImageSource, ImageBlock } from '../../types/content.ts';

/**
 * Detects the MIME type of an image based on its file extension.
 *
 * Supports common web image formats: JPEG, PNG, GIF, WebP, SVG, BMP, ICO.
 * Returns 'application/octet-stream' for unknown extensions.
 *
 * @param path - File path or filename with extension
 * @returns The detected MIME type string
 */
function detectMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Detects the MIME type of an image from its URL.
 *
 * Extracts the pathname from the URL and delegates to `detectMimeType`.
 * Returns 'application/octet-stream' if the URL cannot be parsed.
 *
 * @param url - Full URL pointing to an image
 * @returns The detected MIME type string
 */
function detectMimeTypeFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return detectMimeType(pathname);
  } catch {
    return 'application/octet-stream';
  }
}

/**
 * Represents an image that can be used in UPP messages.
 *
 * Images can be created from various sources (files, URLs, bytes, base64) and
 * converted to different formats as needed by providers. The class provides
 * a unified interface regardless of the underlying source type.
 *
 * @example
 * ```typescript
 * // Load from file
 * const fileImage = await Image.fromPath('./photo.jpg');
 *
 * // Reference by URL
 * const urlImage = Image.fromUrl('https://example.com/image.png');
 *
 * // From raw bytes
 * const bytesImage = Image.fromBytes(uint8Array, 'image/png');
 *
 * // Use in a message
 * const message = new UserMessage([image.toBlock()]);
 * ```
 */
export class Image {
  /** The underlying image source (bytes, base64, or URL) */
  readonly source: ImageSource;
  /** MIME type of the image (e.g., 'image/jpeg', 'image/png') */
  readonly mimeType: string;
  /** Image width in pixels, if known */
  readonly width?: number;
  /** Image height in pixels, if known */
  readonly height?: number;

  private constructor(
    source: ImageSource,
    mimeType: string,
    width?: number,
    height?: number
  ) {
    this.source = source;
    this.mimeType = mimeType;
    this.width = width;
    this.height = height;
  }

  /**
   * Whether this image has data loaded in memory.
   *
   * Returns `false` for URL-sourced images that reference external resources.
   * These must be fetched before their data can be accessed.
   */
  get hasData(): boolean {
    return this.source.type !== 'url';
  }

  /**
   * Converts the image to a base64-encoded string.
   *
   * @returns The image data as a base64 string
   * @throws {Error} When the source is a URL (data must be fetched first)
   */
  toBase64(): string {
    if (this.source.type === 'base64') {
      return this.source.data;
    }

    if (this.source.type === 'bytes') {
      return btoa(
        Array.from(this.source.data)
          .map((b) => String.fromCharCode(b))
          .join('')
      );
    }

    throw new Error('Cannot convert URL image to base64. Fetch the image first.');
  }

  /**
   * Converts the image to a data URL suitable for embedding in HTML or CSS.
   *
   * @returns A data URL in the format `data:{mimeType};base64,{data}`
   * @throws {Error} When the source is a URL (data must be fetched first)
   */
  toDataUrl(): string {
    const base64 = this.toBase64();
    return `data:${this.mimeType};base64,${base64}`;
  }

  /**
   * Gets the image data as raw bytes.
   *
   * @returns The image data as a Uint8Array
   * @throws {Error} When the source is a URL (data must be fetched first)
   */
  toBytes(): Uint8Array {
    if (this.source.type === 'bytes') {
      return this.source.data;
    }

    if (this.source.type === 'base64') {
      const binaryString = atob(this.source.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }

    throw new Error('Cannot get bytes from URL image. Fetch the image first.');
  }

  /**
   * Gets the URL for URL-sourced images.
   *
   * @returns The image URL
   * @throws {Error} When the source is not a URL
   */
  toUrl(): string {
    if (this.source.type === 'url') {
      return this.source.url;
    }

    throw new Error('This image does not have a URL source.');
  }

  /**
   * Converts this Image to an ImageBlock for use in UPP messages.
   *
   * @returns An ImageBlock that can be included in message content arrays
   */
  toBlock(): ImageBlock {
    return {
      type: 'image',
      source: this.source,
      mimeType: this.mimeType,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Creates an Image by reading a file from disk.
   *
   * The file is read into memory as bytes. MIME type is automatically
   * detected from the file extension.
   *
   * @param path - Path to the image file
   * @returns Promise resolving to an Image with the file contents
   *
   * @example
   * ```typescript
   * const image = await Image.fromPath('./photos/vacation.jpg');
   * ```
   */
  static async fromPath(path: string): Promise<Image> {
    // Dynamic import to avoid bundling fs in browser builds
    const { readFile } = await import('node:fs/promises');
    const data = await readFile(path);
    const mimeType = detectMimeType(path);

    return new Image(
      { type: 'bytes', data: new Uint8Array(data) },
      mimeType
    );
  }

  /**
   * Creates an Image from a URL reference.
   *
   * The URL is stored as a reference and not fetched. Providers will handle
   * URL-to-data conversion if needed. MIME type is detected from the URL
   * path if not provided.
   *
   * @param url - URL pointing to the image
   * @param mimeType - Optional MIME type override
   * @returns An Image referencing the URL
   *
   * @example
   * ```typescript
   * const image = Image.fromUrl('https://example.com/logo.png');
   * ```
   */
  static fromUrl(url: string, mimeType?: string): Image {
    const detected = mimeType || detectMimeTypeFromUrl(url);
    return new Image({ type: 'url', url }, detected);
  }

  /**
   * Creates an Image from raw byte data.
   *
   * @param data - The image data as a Uint8Array
   * @param mimeType - The MIME type of the image
   * @returns An Image containing the byte data
   *
   * @example
   * ```typescript
   * const image = Image.fromBytes(pngData, 'image/png');
   * ```
   */
  static fromBytes(data: Uint8Array, mimeType: string): Image {
    return new Image({ type: 'bytes', data }, mimeType);
  }

  /**
   * Creates an Image from a base64-encoded string.
   *
   * @param base64 - The base64-encoded image data (without data URL prefix)
   * @param mimeType - The MIME type of the image
   * @returns An Image containing the base64 data
   *
   * @example
   * ```typescript
   * const image = Image.fromBase64(base64String, 'image/jpeg');
   * ```
   */
  static fromBase64(base64: string, mimeType: string): Image {
    return new Image({ type: 'base64', data: base64 }, mimeType);
  }

  /**
   * Creates an Image from an existing ImageBlock.
   *
   * Useful for converting content blocks received from providers back
   * into Image instances for further processing.
   *
   * @param block - An ImageBlock from message content
   * @returns An Image with the block's source and metadata
   */
  static fromBlock(block: ImageBlock): Image {
    return new Image(
      block.source,
      block.mimeType,
      block.width,
      block.height
    );
  }
}
