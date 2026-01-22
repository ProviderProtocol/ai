/**
 * @fileoverview Document content handling for the Universal Provider Protocol.
 *
 * Provides a unified Document class for working with documents across different sources
 * (file paths, URLs, raw text, base64). Supports PDF and plain text documents with
 * integration into UPP message content blocks.
 *
 * @module core/media/Document
 */

import type { DocumentSource, DocumentBlock } from '../../types/content.ts';

/**
 * Detects the MIME type of a document based on its file extension.
 *
 * Supports PDF and common text file formats.
 * Returns 'application/octet-stream' for unknown extensions.
 *
 * @param path - File path or filename with extension
 * @returns The detected MIME type string
 */
function detectMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'txt':
    case 'text':
    case 'md':
    case 'markdown':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Represents a document that can be used in UPP messages.
 *
 * Documents can be created from various sources (files, URLs, text, base64) and
 * converted to content blocks for provider APIs. The class provides a unified
 * interface regardless of the underlying source type.
 *
 * @example
 * ```typescript
 * // Load PDF from file
 * const pdfDoc = await Document.fromPath('./report.pdf');
 *
 * // Reference PDF by URL
 * const urlDoc = Document.fromUrl('https://example.com/document.pdf');
 *
 * // From plain text
 * const textDoc = Document.fromText('Document content here...');
 *
 * // Use in a message
 * const message = new UserMessage([document.toBlock()]);
 * ```
 */
export class Document {
  /** The underlying document source (base64, url, or text) */
  readonly source: DocumentSource;
  /** MIME type of the document ('application/pdf' or 'text/plain') */
  readonly mimeType: string;
  /** Optional document title (used for citations) */
  readonly title?: string;

  private constructor(
    source: DocumentSource,
    mimeType: string,
    title?: string
  ) {
    this.source = source;
    this.mimeType = mimeType;
    this.title = title;
  }

  /**
   * Whether this document has data loaded in memory.
   *
   * Returns `false` for URL-sourced documents that reference external resources.
   */
  get hasData(): boolean {
    return this.source.type !== 'url';
  }

  /**
   * Whether this document is a PDF.
   */
  get isPdf(): boolean {
    return this.mimeType === 'application/pdf';
  }

  /**
   * Whether this document is plain text.
   */
  get isText(): boolean {
    return this.mimeType === 'text/plain';
  }

  /**
   * Converts the document to a base64-encoded string.
   *
   * @returns The document data as a base64 string
   * @throws {Error} When the source is a URL or plain text
   */
  toBase64(): string {
    if (this.source.type === 'base64') {
      return this.source.data;
    }

    throw new Error('Cannot convert to base64. Only base64-sourced documents support this.');
  }

  /**
   * Gets the plain text content for text documents.
   *
   * @returns The document text content
   * @throws {Error} When the source is not plain text
   */
  toText(): string {
    if (this.source.type === 'text') {
      return this.source.data;
    }

    throw new Error('Cannot get text content. Only text-sourced documents support this.');
  }

  /**
   * Gets the URL for URL-sourced documents.
   *
   * @returns The document URL
   * @throws {Error} When the source is not a URL
   */
  toUrl(): string {
    if (this.source.type === 'url') {
      return this.source.url;
    }

    throw new Error('This document does not have a URL source.');
  }

  /**
   * Converts this Document to a DocumentBlock for use in UPP messages.
   *
   * @returns A DocumentBlock that can be included in message content arrays
   */
  toBlock(): DocumentBlock {
    return {
      type: 'document',
      source: this.source,
      mimeType: this.mimeType,
      title: this.title,
    };
  }

  /**
   * Creates a Document by reading a file from disk.
   *
   * The file is read into memory and base64-encoded. MIME type is automatically
   * detected from the file extension.
   *
   * @param path - Path to the document file
   * @param title - Optional document title
   * @returns Promise resolving to a Document with the file contents
   *
   * @example
   * ```typescript
   * const doc = await Document.fromPath('./reports/annual.pdf');
   * const docWithTitle = await Document.fromPath('./report.pdf', 'Annual Report 2024');
   * ```
   */
  static async fromPath(path: string, title?: string): Promise<Document> {
    const file = Bun.file(path);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`Document file not found at path: ${path}`);
    }

    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read document file at path: ${path}. ${message}`);
    }

    if (data.byteLength === 0) {
      throw new Error(`Document file is empty at path: ${path}`);
    }
    const base64 = Buffer.from(data).toString('base64');
    const mimeType = detectMimeType(path);

    return new Document(
      { type: 'base64', data: base64 },
      mimeType,
      title
    );
  }

  /**
   * Creates a Document from a URL reference.
   *
   * The URL is stored as a reference and not fetched. Providers will handle
   * URL fetching if needed. Only PDF URLs are supported.
   * URLs must use the http or https protocol.
   *
   * @param url - URL pointing to the PDF document
   * @param title - Optional document title
   * @returns A Document referencing the URL
   *
   * @example
   * ```typescript
   * const doc = Document.fromUrl('https://example.com/report.pdf');
   * ```
   */
  static fromUrl(url: string, title?: string): Document {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid URL';
      throw new Error(`Invalid document URL: ${message}`);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Document URL must use http or https: ${url}`);
    }

    return new Document(
      { type: 'url', url },
      'application/pdf',
      title
    );
  }

  /**
   * Creates a Document from base64-encoded data.
   *
   * @param base64 - The base64-encoded document data
   * @param mimeType - The MIME type ('application/pdf' or 'text/plain')
   * @param title - Optional document title
   * @returns A Document containing the base64 data
   *
   * @example
   * ```typescript
   * const doc = Document.fromBase64(pdfBase64, 'application/pdf', 'Contract');
   * ```
   */
  static fromBase64(base64: string, mimeType: string, title?: string): Document {
    return new Document(
      { type: 'base64', data: base64 },
      mimeType,
      title
    );
  }

  /**
   * Creates a Document from plain text content.
   *
   * @param text - The document text content
   * @param title - Optional document title
   * @returns A Document containing the text
   *
   * @example
   * ```typescript
   * const doc = Document.fromText('This is the document content.', 'Notes');
   * ```
   */
  static fromText(text: string, title?: string): Document {
    return new Document(
      { type: 'text', data: text },
      'text/plain',
      title
    );
  }

  /**
   * Creates a Document from an existing DocumentBlock.
   *
   * Useful for converting content blocks received from providers back
   * into Document instances for further processing.
   *
   * @param block - A DocumentBlock from message content
   * @returns A Document with the block's source and metadata
   */
  static fromBlock(block: DocumentBlock): Document {
    return new Document(
      block.source,
      block.mimeType,
      block.title
    );
  }
}
