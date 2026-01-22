/**
 * @fileoverview Audio content handling for the Universal Provider Protocol.
 *
 * Provides a unified Audio class for working with audio across different sources
 * (file paths, raw bytes, base64). Supports conversion between formats and
 * integration with UPP message content blocks.
 *
 * @module core/media/Audio
 */

import type { AudioBlock } from '../../types/content.ts';

/**
 * Detects the MIME type of an audio file based on its file extension.
 *
 * Supports common audio formats: MP3, WAV, OGG, FLAC, AAC, M4A, WebM.
 * Returns 'application/octet-stream' for unknown extensions.
 *
 * Note: Provider support varies. Google Gemini supports MP3, WAV, AIFF, AAC,
 * OGG Vorbis, and FLAC. Opus is NOT supported by Google.
 *
 * @param path - File path or filename with extension
 * @returns The detected MIME type string
 */
function detectMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'mp3':
      return 'audio/mp3';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'm4a':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'aiff':
    case 'aif':
      return 'audio/aiff';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Represents an audio file that can be used in UPP messages.
 *
 * Audio can be created from various sources (files, bytes, base64) and
 * converted to different formats as needed by providers. The class provides
 * a unified interface regardless of the underlying source type.
 *
 * Note: Providers have size limits for inline audio data. Google Gemini
 * limits inline data to 20MB per request. For larger files, consider using
 * provider-specific file upload APIs.
 *
 * @example
 * ```typescript
 * // Load from file
 * const fileAudio = await Audio.fromPath('./recording.mp3');
 *
 * // From raw bytes
 * const bytesAudio = Audio.fromBytes(uint8Array, 'audio/wav');
 *
 * // Use in a message
 * const message = new UserMessage([audio.toBlock()]);
 * ```
 */
export class Audio {
  /** The audio data as raw bytes */
  readonly data: Uint8Array;
  /** MIME type of the audio (e.g., 'audio/mp3', 'audio/wav') */
  readonly mimeType: string;
  /** Duration in seconds, if known */
  readonly duration?: number;

  private constructor(
    data: Uint8Array,
    mimeType: string,
    duration?: number
  ) {
    this.data = data;
    this.mimeType = mimeType;
    this.duration = duration;
  }

  /**
   * Gets the size of the audio data in bytes.
   */
  get size(): number {
    return this.data.length;
  }

  /**
   * Converts the audio to a base64-encoded string.
   *
   * @returns The audio data as a base64 string
   */
  toBase64(): string {
    return btoa(
      Array.from(this.data)
        .map((b) => String.fromCharCode(b))
        .join('')
    );
  }

  /**
   * Converts the audio to a data URL suitable for embedding.
   *
   * @returns A data URL in the format `data:{mimeType};base64,{data}`
   */
  toDataUrl(): string {
    const base64 = this.toBase64();
    return `data:${this.mimeType};base64,${base64}`;
  }

  /**
   * Gets the audio data as raw bytes.
   *
   * @returns The audio data as a Uint8Array
   */
  toBytes(): Uint8Array {
    return this.data;
  }

  /**
   * Converts this Audio to an AudioBlock for use in UPP messages.
   *
   * @returns An AudioBlock that can be included in message content arrays
   */
  toBlock(): AudioBlock {
    return {
      type: 'audio',
      data: this.data,
      mimeType: this.mimeType,
      duration: this.duration,
    };
  }

  /**
   * Creates an Audio by reading a file from disk.
   *
   * The file is read into memory as bytes. MIME type is automatically
   * detected from the file extension.
   *
   * @param path - Path to the audio file
   * @param duration - Optional duration in seconds
   * @returns Promise resolving to an Audio with the file contents
   *
   * @example
   * ```typescript
   * const audio = await Audio.fromPath('./recordings/interview.mp3');
   * ```
   */
  static async fromPath(path: string, duration?: number): Promise<Audio> {
    const file = Bun.file(path);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`Audio file not found at path: ${path}`);
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read audio file at path: ${path}. ${message}`);
    }

    if (arrayBuffer.byteLength === 0) {
      throw new Error(`Audio file is empty at path: ${path}`);
    }

    const mimeType = detectMimeType(path);

    return new Audio(
      new Uint8Array(arrayBuffer),
      mimeType,
      duration
    );
  }

  /**
   * Creates an Audio from raw byte data.
   *
   * @param data - The audio data as a Uint8Array
   * @param mimeType - The MIME type of the audio
   * @param duration - Optional duration in seconds
   * @returns An Audio containing the byte data
   *
   * @example
   * ```typescript
   * const audio = Audio.fromBytes(wavData, 'audio/wav');
   * ```
   */
  static fromBytes(data: Uint8Array, mimeType: string, duration?: number): Audio {
    return new Audio(data, mimeType, duration);
  }

  /**
   * Creates an Audio from a base64-encoded string.
   *
   * @param base64 - The base64-encoded audio data (without data URL prefix)
   * @param mimeType - The MIME type of the audio
   * @param duration - Optional duration in seconds
   * @returns An Audio containing the decoded data
   *
   * @example
   * ```typescript
   * const audio = Audio.fromBase64(base64String, 'audio/mp3');
   * ```
   */
  static fromBase64(base64: string, mimeType: string, duration?: number): Audio {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Audio(bytes, mimeType, duration);
  }

  /**
   * Creates an Audio from an existing AudioBlock.
   *
   * Useful for converting content blocks received from providers back
   * into Audio instances for further processing.
   *
   * @param block - An AudioBlock from message content
   * @returns An Audio with the block's data and metadata
   */
  static fromBlock(block: AudioBlock): Audio {
    return new Audio(
      block.data,
      block.mimeType,
      block.duration
    );
  }
}
