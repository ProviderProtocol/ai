import { test, expect, describe } from 'bun:test';
import { UserMessage } from '../../../src/types/messages.ts';
import type { DocumentBlock } from '../../../src/types/content.ts';
import type { AnthropicRequest, AnthropicContent, AnthropicDocumentContent } from '../../../src/providers/anthropic/types.ts';

describe('Anthropic document transform', () => {
  const getTransformRequest = async () => {
    const { transformRequest } = await import(
      '../../../src/providers/anthropic/transform.ts'
    );
    return transformRequest;
  };

  describe('base64 PDF documents', () => {
    test('transforms base64 PDF document block', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'JVBERi0xLjQK' },
        mimeType: 'application/pdf',
        title: 'Test PDF',
      };

      const userMessage = new UserMessage([
        { type: 'text', text: 'Analyze this document' },
        documentBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'claude-3-5-sonnet-latest'
      ) as AnthropicRequest;

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.role).toBe('user');

      const content = result.messages[0]!.content as AnthropicContent[];
      expect(content).toHaveLength(2);

      const textContent = content[0]!;
      expect(textContent.type).toBe('text');

      const docContent = content[1]! as AnthropicDocumentContent;
      expect(docContent.type).toBe('document');
      expect(docContent.source.type).toBe('base64');
      if (docContent.source.type === 'base64') {
        expect(docContent.source.media_type).toBe('application/pdf');
        expect(docContent.source.data).toBe('JVBERi0xLjQK');
      }
    });
  });

  describe('URL PDF documents', () => {
    test('transforms URL PDF document block', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'url', url: 'https://example.com/document.pdf' },
        mimeType: 'application/pdf',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'claude-3-5-sonnet-latest'
      ) as AnthropicRequest;

      const content = result.messages[0]!.content as AnthropicContent[];
      expect(content).toHaveLength(1);

      const docContent = content[0]! as AnthropicDocumentContent;
      expect(docContent.type).toBe('document');
      expect(docContent.source.type).toBe('url');
      if (docContent.source.type === 'url') {
        expect(docContent.source.url).toBe('https://example.com/document.pdf');
      }
    });
  });

  describe('plain text documents', () => {
    test('transforms plain text document block', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: 'This is the document content.' },
        mimeType: 'text/plain',
        title: 'Notes',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'claude-3-5-sonnet-latest'
      ) as AnthropicRequest;

      const content = result.messages[0]!.content as AnthropicContent[];
      expect(content).toHaveLength(1);

      const docContent = content[0]! as AnthropicDocumentContent;
      expect(docContent.type).toBe('document');
      expect(docContent.source.type).toBe('text');
      if (docContent.source.type === 'text') {
        expect(docContent.source.media_type).toBe('text/plain');
        expect(docContent.source.data).toBe('This is the document content.');
      }
    });
  });

  describe('mixed content messages', () => {
    test('handles messages with text, image, and document blocks', async () => {
      const transformRequest = await getTransformRequest();

      const userMessage = new UserMessage([
        { type: 'text', text: 'Look at these files' },
        {
          type: 'image',
          source: { type: 'base64', data: 'imagedata' },
          mimeType: 'image/png',
        },
        {
          type: 'document',
          source: { type: 'base64', data: 'pdfdata' },
          mimeType: 'application/pdf',
        },
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'claude-3-5-sonnet-latest'
      ) as AnthropicRequest;

      const content = result.messages[0]!.content as AnthropicContent[];
      expect(content).toHaveLength(3);
      expect(content[0]!.type).toBe('text');
      expect(content[1]!.type).toBe('image');
      expect(content[2]!.type).toBe('document');
    });
  });
});
