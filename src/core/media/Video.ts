/**
 * @fileoverview Video content handling for the Universal Provider Protocol.
 *
 * Provides a unified Video class for working with video across different sources
 * (file paths, raw bytes, base64). Supports conversion between formats and
 * integration with UPP message content blocks.
 *
 * @module core/media/Video
 */

import type { VideoBlock } from '../../types/content.ts';

/**
 * Represents a video file that can be used in UPP messages.
 *
 * Video can be created from various sources (files, bytes, base64) and
 * converted to different formats as needed by providers. The class provides
 * a unified interface regardless of the underlying source type.
 *
 * Note: Providers have size limits for inline video data. Google Gemini
 * limits inline data to 20MB per request. For larger files, consider using
 * provider-specific file upload APIs.
 *
 * @example
 * ```typescript
 * // Load from file
 * const fileVideo = await Video.fromPath('./clip.mp4');
 *
 * // From raw bytes
 * const bytesVideo = Video.fromBytes(uint8Array, 'video/webm');
 *
 * // Use in a message
 * const message = new UserMessage([video.toBlock()]);
 * ```
 */
export class Video {
  /** The video data as raw bytes */
  readonly data: Uint8Array;
  /** MIME type of the video (e.g., 'video/mp4', 'video/webm') */
  readonly mimeType: string;
  /** Duration in seconds, if known */
  readonly duration?: number;
  /** Video width in pixels, if known */
  readonly width?: number;
  /** Video height in pixels, if known */
  readonly height?: number;

  private constructor(
    data: Uint8Array,
    mimeType: string,
    options?: { duration?: number; width?: number; height?: number }
  ) {
    this.data = data;
    this.mimeType = mimeType;
    this.duration = options?.duration;
    this.width = options?.width;
    this.height = options?.height;
  }

  /**
   * Gets the size of the video data in bytes.
   */
  get size(): number {
    return this.data.length;
  }

  /**
   * Converts the video to a base64-encoded string.
   *
   * @returns The video data as a base64 string
   */
  toBase64(): string {
    return btoa(
      Array.from(this.data)
        .map((b) => String.fromCharCode(b))
        .join('')
    );
  }

  /**
   * Converts the video to a data URL suitable for embedding.
   *
   * @returns A data URL in the format `data:{mimeType};base64,{data}`
   */
  toDataUrl(): string {
    const base64 = this.toBase64();
    return `data:${this.mimeType};base64,${base64}`;
  }

  /**
   * Gets the video data as raw bytes.
   *
   * @returns The video data as a Uint8Array
   */
  toBytes(): Uint8Array {
    return this.data;
  }

  /**
   * Converts this Video to a VideoBlock for use in UPP messages.
   *
   * @returns A VideoBlock that can be included in message content arrays
   */
  toBlock(): VideoBlock {
    return {
      type: 'video',
      data: this.data,
      mimeType: this.mimeType,
      duration: this.duration,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Creates a Video by reading a file from disk.
   *
   * The file is read into memory as bytes. MIME type is automatically
   * detected from the file extension.
   *
   * @param path - Path to the video file
   * @param options - Optional metadata (duration, width, height)
   * @returns Promise resolving to a Video with the file contents
   *
   * @example
   * ```typescript
   * const video = await Video.fromPath('./clips/demo.mp4');
   * const videoWithMeta = await Video.fromPath('./clip.mp4', { duration: 30, width: 1920, height: 1080 });
   * ```
   */
  static async fromPath(
    path: string,
    options?: { duration?: number; width?: number; height?: number }
  ): Promise<Video> {
    const file = Bun.file(path);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`Video file not found at path: ${path}`);
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read video file at path: ${path}. ${message}`);
    }

    if (arrayBuffer.byteLength === 0) {
      throw new Error(`Video file is empty at path: ${path}`);
    }

    const mimeType = detectMimeType(path);

    return new Video(
      new Uint8Array(arrayBuffer),
      mimeType,
      options
    );
  }

  /**
   * Creates a Video from raw byte data.
   *
   * @param data - The video data as a Uint8Array
   * @param mimeType - The MIME type of the video
   * @param options - Optional metadata (duration, width, height)
   * @returns A Video containing the byte data
   *
   * @example
   * ```typescript
   * const video = Video.fromBytes(mp4Data, 'video/mp4');
   * const videoWithMeta = Video.fromBytes(data, 'video/mp4', { duration: 60 });
   * ```
   */
  static fromBytes(
    data: Uint8Array,
    mimeType: string,
    options?: { duration?: number; width?: number; height?: number }
  ): Video {
    return new Video(data, mimeType, options);
  }

  /**
   * Creates a Video from a base64-encoded string.
   *
   * @param base64 - The base64-encoded video data (without data URL prefix)
   * @param mimeType - The MIME type of the video
   * @param options - Optional metadata (duration, width, height)
   * @returns A Video containing the decoded data
   *
   * @example
   * ```typescript
   * const video = Video.fromBase64(base64String, 'video/mp4');
   * ```
   */
  static fromBase64(
    base64: string,
    mimeType: string,
    options?: { duration?: number; width?: number; height?: number }
  ): Video {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Video(bytes, mimeType, options);
  }

  /**
   * Creates a Video from an existing VideoBlock.
   *
   * Useful for converting content blocks received from providers back
   * into Video instances for further processing.
   *
   * @param block - A VideoBlock from message content
   * @returns A Video with the block's data and metadata
   */
  static fromBlock(block: VideoBlock): Video {
    return new Video(
      block.data,
      block.mimeType,
      {
        duration: block.duration,
        width: block.width,
        height: block.height,
      }
    );
  }
}

/**
 * Detects the MIME type of a video file based on its file extension.
 *
 * Supports common video formats: MP4, WebM, OGV, MOV, AVI, MPEG, WMV, 3GPP, FLV.
 * Returns 'application/octet-stream' for unknown extensions.
 *
 * Note: Provider support varies. Google Gemini supports MP4, MPEG, MOV, AVI,
 * WMV, MPEGPS, FLV, 3GPP, and WebM. MKV is NOT supported by Google.
 *
 * @param path - File path or filename with extension
 * @returns The detected MIME type string
 */
function detectMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'ogv':
    case 'ogg':
      return 'video/ogg';
    case 'mov':
      return 'video/quicktime';
    case 'avi':
      return 'video/x-msvideo';
    case 'mpeg':
    case 'mpg':
      return 'video/mpeg';
    case 'wmv':
      return 'video/x-ms-wmv';
    case '3gp':
    case '3gpp':
      return 'video/3gpp';
    case 'flv':
      return 'video/x-flv';
    default:
      return 'application/octet-stream';
  }
}
