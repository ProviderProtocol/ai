import { test, expect, describe } from 'bun:test';
import { Document } from '../../../src/core/media/document.ts';
import type { DocumentBlock } from '../../../src/types/content.ts';
import { join } from 'path';
import { tmpdir } from 'node:os';

const TEST_PDF_PATH = join(import.meta.dir, '../../assets/helloworld.pdf');

describe('Document class', () => {
  describe('fromPath', () => {
    test('loads PDF from file path', async () => {
      const doc = await Document.fromPath(TEST_PDF_PATH);

      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.source.type).toBe('base64');
      expect(doc.hasData).toBe(true);
      expect(doc.isPdf).toBe(true);
      expect(doc.isText).toBe(false);
    });

    test('loads PDF with title', async () => {
      const doc = await Document.fromPath(TEST_PDF_PATH, 'Hello World Doc');

      expect(doc.title).toBe('Hello World Doc');
      expect(doc.mimeType).toBe('application/pdf');
    });

    test('detects text/plain for .txt files', async () => {
      const tempPath = join(tmpdir(), `upp-doc-${crypto.randomUUID()}.txt`);
      await Bun.write(tempPath, 'Test content');

      try {
        const doc = await Document.fromPath(tempPath);
        expect(doc.mimeType).toBe('text/plain');
      } finally {
        await Bun.file(tempPath).unlink();
      }
    });

    test('throws when file does not exist', async () => {
      const tempPath = join(tmpdir(), `upp-missing-${crypto.randomUUID()}.pdf`);
      await expect(Document.fromPath(tempPath)).rejects.toThrow('Document file not found');
    });

    test('throws when file is empty', async () => {
      const tempPath = join(tmpdir(), `upp-empty-${crypto.randomUUID()}.pdf`);
      await Bun.write(tempPath, '');

      try {
        await expect(Document.fromPath(tempPath)).rejects.toThrow('Document file is empty');
      } finally {
        await Bun.file(tempPath).unlink();
      }
    });
  });

  describe('fromUrl', () => {
    test('creates URL-sourced document', () => {
      const doc = Document.fromUrl('https://example.com/document.pdf');

      expect(doc.source.type).toBe('url');
      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.hasData).toBe(false);
      expect(doc.isPdf).toBe(true);
    });

    test('creates URL-sourced document with title', () => {
      const doc = Document.fromUrl('https://example.com/doc.pdf', 'Remote PDF');

      expect(doc.title).toBe('Remote PDF');
      expect(doc.source.type).toBe('url');
    });

    test('throws for invalid URL', () => {
      expect(() => Document.fromUrl('not-a-url')).toThrow('Invalid document URL');
    });

    test('throws for non-http URLs', () => {
      expect(() => Document.fromUrl('ftp://example.com/doc.pdf')).toThrow('Document URL must use http or https');
    });
  });

  describe('fromBase64', () => {
    test('creates base64-sourced PDF', () => {
      const base64 = 'JVBERi0xLjQK'; // PDF magic bytes
      const doc = Document.fromBase64(base64, 'application/pdf');

      expect(doc.source.type).toBe('base64');
      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.hasData).toBe(true);
      expect(doc.toBase64()).toBe(base64);
    });

    test('creates base64-sourced document with title', () => {
      const doc = Document.fromBase64('data', 'application/pdf', 'Contract');

      expect(doc.title).toBe('Contract');
    });
  });

  describe('fromText', () => {
    test('creates text-sourced document', () => {
      const content = 'This is a plain text document.';
      const doc = Document.fromText(content);

      expect(doc.source.type).toBe('text');
      expect(doc.mimeType).toBe('text/plain');
      expect(doc.hasData).toBe(true);
      expect(doc.isText).toBe(true);
      expect(doc.isPdf).toBe(false);
      expect(doc.toText()).toBe(content);
    });

    test('creates text document with title', () => {
      const doc = Document.fromText('Notes content', 'Meeting Notes');

      expect(doc.title).toBe('Meeting Notes');
    });
  });

  describe('toBlock', () => {
    test('converts to DocumentBlock for base64 source', async () => {
      const doc = await Document.fromPath(TEST_PDF_PATH, 'Test Doc');
      const block = doc.toBlock();

      expect(block.type).toBe('document');
      expect(block.source.type).toBe('base64');
      expect(block.mimeType).toBe('application/pdf');
      expect(block.title).toBe('Test Doc');
    });

    test('converts to DocumentBlock for URL source', () => {
      const doc = Document.fromUrl('https://example.com/doc.pdf', 'URL Doc');
      const block = doc.toBlock();

      expect(block.type).toBe('document');
      expect(block.source.type).toBe('url');
      if (block.source.type === 'url') {
        expect(block.source.url).toBe('https://example.com/doc.pdf');
      }
      expect(block.title).toBe('URL Doc');
    });

    test('converts to DocumentBlock for text source', () => {
      const doc = Document.fromText('Content here', 'Text Doc');
      const block = doc.toBlock();

      expect(block.type).toBe('document');
      expect(block.source.type).toBe('text');
      if (block.source.type === 'text') {
        expect(block.source.data).toBe('Content here');
      }
      expect(block.mimeType).toBe('text/plain');
    });
  });

  describe('fromBlock', () => {
    test('creates Document from DocumentBlock', () => {
      const block: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'testdata' },
        mimeType: 'application/pdf',
        title: 'From Block',
      };

      const doc = Document.fromBlock(block);

      expect(doc.source.type).toBe('base64');
      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.title).toBe('From Block');
      expect(doc.toBase64()).toBe('testdata');
    });
  });

  describe('conversion methods', () => {
    test('toBase64 returns data for base64 source', () => {
      const doc = Document.fromBase64('testbase64', 'application/pdf');
      expect(doc.toBase64()).toBe('testbase64');
    });

    test('toBase64 throws for URL source', () => {
      const doc = Document.fromUrl('https://example.com/doc.pdf');
      expect(() => doc.toBase64()).toThrow();
    });

    test('toBase64 throws for text source', () => {
      const doc = Document.fromText('test content');
      expect(() => doc.toBase64()).toThrow();
    });

    test('toText returns data for text source', () => {
      const doc = Document.fromText('my content');
      expect(doc.toText()).toBe('my content');
    });

    test('toText throws for non-text sources', () => {
      const doc = Document.fromBase64('data', 'application/pdf');
      expect(() => doc.toText()).toThrow();
    });

    test('toUrl returns URL for URL source', () => {
      const doc = Document.fromUrl('https://example.com/doc.pdf');
      expect(doc.toUrl()).toBe('https://example.com/doc.pdf');
    });

    test('toUrl throws for non-URL sources', () => {
      const doc = Document.fromText('content');
      expect(() => doc.toUrl()).toThrow();
    });
  });

  describe('property accessors', () => {
    test('hasData is true for base64 and text sources', () => {
      expect(Document.fromBase64('data', 'application/pdf').hasData).toBe(true);
      expect(Document.fromText('content').hasData).toBe(true);
    });

    test('hasData is false for URL sources', () => {
      expect(Document.fromUrl('https://example.com/doc.pdf').hasData).toBe(false);
    });

    test('isPdf correctly identifies PDF documents', () => {
      expect(Document.fromBase64('data', 'application/pdf').isPdf).toBe(true);
      expect(Document.fromText('content').isPdf).toBe(false);
    });

    test('isText correctly identifies text documents', () => {
      expect(Document.fromText('content').isText).toBe(true);
      expect(Document.fromBase64('data', 'application/pdf').isText).toBe(false);
    });
  });
});
