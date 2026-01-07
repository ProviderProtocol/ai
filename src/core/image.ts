import { readFile } from 'node:fs/promises';
import type { ImageSource, ImageBlock } from '../types/content.ts';

/**
 * Image class for handling images in UPP
 */
export class Image {
  readonly source: ImageSource;
  readonly mimeType: string;
  readonly width?: number;
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
   * Check if this image has data loaded (false for URL sources)
   */
  get hasData(): boolean {
    return this.source.type !== 'url';
  }

  /**
   * Convert to base64 string (throws if source is URL)
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
   * Convert to data URL (throws if source is URL)
   */
  toDataUrl(): string {
    const base64 = this.toBase64();
    return `data:${this.mimeType};base64,${base64}`;
  }

  /**
   * Get raw bytes (throws if source is URL)
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
   * Get the URL (only for URL sources)
   */
  toUrl(): string {
    if (this.source.type === 'url') {
      return this.source.url;
    }

    throw new Error('This image does not have a URL source.');
  }

  /**
   * Convert to ImageBlock for use in messages
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
   * Create from file path (reads file into memory)
   */
  static async fromPath(path: string): Promise<Image> {
    const data = await readFile(path);
    const mimeType = detectMimeType(path);

    return new Image(
      { type: 'bytes', data: new Uint8Array(data) },
      mimeType
    );
  }

  /**
   * Create from URL reference (does not fetch - providers handle URL conversion)
   */
  static fromUrl(url: string, mimeType?: string): Image {
    const detected = mimeType || detectMimeTypeFromUrl(url);
    return new Image({ type: 'url', url }, detected);
  }

  /**
   * Create from raw bytes
   */
  static fromBytes(data: Uint8Array, mimeType: string): Image {
    return new Image({ type: 'bytes', data }, mimeType);
  }

  /**
   * Create from base64 string
   */
  static fromBase64(base64: string, mimeType: string): Image {
    return new Image({ type: 'base64', data: base64 }, mimeType);
  }

  /**
   * Create from an existing ImageBlock
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

/**
 * Detect MIME type from file extension
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
 * Detect MIME type from URL
 */
function detectMimeTypeFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return detectMimeType(pathname);
  } catch {
    return 'application/octet-stream';
  }
}
