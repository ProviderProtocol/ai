import { test, expect, describe } from 'bun:test';
import { UserMessage } from '../../../src/types/messages.ts';
import type { DocumentBlock } from '../../../src/types/content.ts';
import type {
  OpenAICompletionsRequest,
  OpenAIUserContent,
  OpenAIFileContent,
  OpenAIResponsesRequest,
  OpenAIResponsesContentPart,
  OpenAIResponsesFilePart,
} from '../../../src/providers/openai/types.ts';

describe('OpenAI Completions API document transform', () => {
  const getTransformRequest = async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.completions.ts'
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
        'gpt-4o'
      ) as OpenAICompletionsRequest;

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.role).toBe('user');

      const content = (result.messages[0] as { content: OpenAIUserContent[] }).content;
      expect(content).toHaveLength(2);

      const textContent = content[0]!;
      expect(textContent.type).toBe('text');

      const fileContent = content[1]! as OpenAIFileContent;
      expect(fileContent.type).toBe('file');
      expect(fileContent.file.filename).toBe('Test PDF');
      expect(fileContent.file.file_data).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    });

    test('uses default filename when title is not provided', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'JVBERi0xLjQK' },
        mimeType: 'application/pdf',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gpt-4o'
      ) as OpenAICompletionsRequest;

      const content = (result.messages[0] as { content: OpenAIUserContent[] }).content;
      const fileContent = content[0]! as OpenAIFileContent;
      expect(fileContent.file.filename).toBe('document.pdf');
    });
  });

  describe('URL PDF documents', () => {
    test('throws error for URL document source', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'url', url: 'https://example.com/document.pdf' },
        mimeType: 'application/pdf',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gpt-4o'
        );
      }).toThrow('OpenAI Chat Completions API does not support URL document sources. Use the Responses API instead.');
    });
  });

  describe('unsupported document types', () => {
    test('throws error for plain text documents', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: 'This is the document content.' },
        mimeType: 'text/plain',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gpt-4o'
        );
      }).toThrow('OpenAI Chat Completions API only supports PDF documents');
    });

    test('throws error for non-PDF mime types', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'somedata' },
        mimeType: 'application/msword',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gpt-4o'
        );
      }).toThrow('OpenAI Chat Completions API only supports PDF documents');
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
        'gpt-4o'
      ) as OpenAICompletionsRequest;

      const content = (result.messages[0] as { content: OpenAIUserContent[] }).content;
      expect(content).toHaveLength(3);
      expect(content[0]!.type).toBe('text');
      expect(content[1]!.type).toBe('image_url');
      expect(content[2]!.type).toBe('file');
    });
  });
});

describe('OpenAI Responses API document transform', () => {
  const getTransformRequest = async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openai/transform.responses.ts'
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
        'gpt-4o'
      ) as OpenAIResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenAIResponsesContentPart[] }>;
      expect(input).toHaveLength(1);
      expect(input[0]!.role).toBe('user');

      const content = input[0]!.content;
      expect(content).toHaveLength(2);

      const textContent = content[0]!;
      expect(textContent.type).toBe('input_text');

      const fileContent = content[1]! as OpenAIResponsesFilePart;
      expect(fileContent.type).toBe('input_file');
      expect(fileContent.filename).toBe('Test PDF');
      expect(fileContent.file_data).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    });

    test('uses default filename when title is not provided', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'JVBERi0xLjQK' },
        mimeType: 'application/pdf',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gpt-4o'
      ) as OpenAIResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenAIResponsesContentPart[] }>;
      const content = input[0]!.content;
      const fileContent = content[0]! as OpenAIResponsesFilePart;
      expect(fileContent.filename).toBe('document.pdf');
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
        'gpt-4o'
      ) as OpenAIResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenAIResponsesContentPart[] }>;
      const content = input[0]!.content;
      const fileContent = content[0]! as OpenAIResponsesFilePart;
      expect(fileContent.type).toBe('input_file');
      expect(fileContent.file_url).toBe('https://example.com/document.pdf');
    });
  });

  describe('unsupported document types', () => {
    test('throws error for plain text documents', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: 'This is the document content.' },
        mimeType: 'text/plain',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gpt-4o'
        );
      }).toThrow('OpenAI Responses API only supports PDF documents');
    });

    test('throws error for non-PDF mime types', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'somedata' },
        mimeType: 'application/msword',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gpt-4o'
        );
      }).toThrow('OpenAI Responses API only supports PDF documents');
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
        'gpt-4o'
      ) as OpenAIResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenAIResponsesContentPart[] }>;
      const content = input[0]!.content;
      expect(content).toHaveLength(3);
      expect(content[0]!.type).toBe('input_text');
      expect(content[1]!.type).toBe('input_image');
      expect(content[2]!.type).toBe('input_file');
    });
  });
});
