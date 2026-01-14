import { test, expect, describe } from 'bun:test';
import { UserMessage } from '../../../src/types/messages.ts';
import type { DocumentBlock, AudioBlock, VideoBlock } from '../../../src/types/content.ts';
import type {
  OpenRouterCompletionsRequest,
  OpenRouterUserContent,
  OpenRouterFileContent,
  OpenRouterAudioContent,
  OpenRouterVideoContent,
  OpenRouterResponsesRequest,
  OpenRouterResponsesContentPart,
  OpenRouterResponsesFilePart,
  OpenRouterResponsesAudioPart,
  OpenRouterResponsesVideoPart,
} from '../../../src/providers/openrouter/types.ts';

describe('OpenRouter Completions API media transform', () => {
  const getTransformRequest = async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openrouter/transform.completions.ts'
    );
    return transformRequest;
  };

  describe('document blocks', () => {
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
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      expect(result.messages).toHaveLength(1);
      expect(result.messages![0]!.role).toBe('user');

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      expect(content).toHaveLength(2);

      const fileContent = content[1]! as OpenRouterFileContent;
      expect(fileContent.type).toBe('file');
      expect(fileContent.file.filename).toBe('Test PDF');
      expect(fileContent.file.file_data).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    });

    test('transforms URL PDF document block with file_url', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'url', url: 'https://example.com/document.pdf' },
        mimeType: 'application/pdf',
        title: 'Remote PDF',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      const fileContent = content[0]! as OpenRouterFileContent;
      expect(fileContent.type).toBe('file');
      expect(fileContent.file.filename).toBe('Remote PDF');
      expect(fileContent.file.file_url).toBe('https://example.com/document.pdf');
      expect(fileContent.file.file_data).toBeUndefined();
    });

    test('transforms text document as inline text', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: 'This is the document content.' },
        mimeType: 'text/plain',
        title: 'My Notes',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      expect(content[0]!.type).toBe('text');
      expect((content[0] as { text: string }).text).toBe('[Document: My Notes]\nThis is the document content.');
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
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      const fileContent = content[0]! as OpenRouterFileContent;
      expect(fileContent.file.filename).toBe('document.pdf');
    });

    test('throws error for empty text document', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: '' },
        mimeType: 'text/plain',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'google/gemini-2.5-flash'
        );
      }).toThrow('Text document source data is empty');
    });
  });

  describe('audio blocks', () => {
    test('transforms audio block to input_audio', async () => {
      const transformRequest = await getTransformRequest();

      const audioBlock: AudioBlock = {
        type: 'audio',
        data: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]), // "Hello"
        mimeType: 'audio/mp3',
      };

      const userMessage = new UserMessage([
        { type: 'text', text: 'What is this audio?' },
        audioBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      const audioContent = content[1]! as OpenRouterAudioContent;
      expect(audioContent.type).toBe('input_audio');
      expect(audioContent.input_audio.format).toBe('mp3');
      expect(audioContent.input_audio.data).toBe(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]).toString('base64'));
    });

    test('extracts format from mime type', async () => {
      const transformRequest = await getTransformRequest();

      const audioBlock: AudioBlock = {
        type: 'audio',
        data: new Uint8Array([0x00]),
        mimeType: 'audio/wav',
      };

      const userMessage = new UserMessage([audioBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      const audioContent = content[0]! as OpenRouterAudioContent;
      expect(audioContent.input_audio.format).toBe('wav');
    });
  });

  describe('video blocks', () => {
    test('transforms video block to video_url', async () => {
      const transformRequest = await getTransformRequest();

      const videoBlock: VideoBlock = {
        type: 'video',
        data: new Uint8Array([0x00, 0x00, 0x00, 0x20]),
        mimeType: 'video/mp4',
      };

      const userMessage = new UserMessage([
        { type: 'text', text: 'What is in this video?' },
        videoBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      const videoContent = content[1]! as OpenRouterVideoContent;
      expect(videoContent.type).toBe('video_url');
      expect(videoContent.video_url.url).toMatch(/^data:video\/mp4;base64,/);
    });
  });

  describe('mixed content messages', () => {
    test('handles messages with text, document, audio, and video blocks', async () => {
      const transformRequest = await getTransformRequest();

      const userMessage = new UserMessage([
        { type: 'text', text: 'Analyze all of these' },
        {
          type: 'document',
          source: { type: 'base64', data: 'pdfdata' },
          mimeType: 'application/pdf',
        } as DocumentBlock,
        {
          type: 'audio',
          data: new Uint8Array([0x00]),
          mimeType: 'audio/mp3',
        } as AudioBlock,
        {
          type: 'video',
          data: new Uint8Array([0x00]),
          mimeType: 'video/mp4',
        } as VideoBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterCompletionsRequest;

      const content = (result.messages![0] as { content: OpenRouterUserContent[] }).content;
      expect(content).toHaveLength(4);
      expect(content[0]!.type).toBe('text');
      expect(content[1]!.type).toBe('file');
      expect(content[2]!.type).toBe('input_audio');
      expect(content[3]!.type).toBe('video_url');
    });
  });
});

describe('OpenRouter Responses API media transform', () => {
  const getTransformRequest = async () => {
    const { transformRequest } = await import(
      '../../../src/providers/openrouter/transform.responses.ts'
    );
    return transformRequest;
  };

  describe('document blocks', () => {
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
        'google/gemini-2.5-flash'
      ) as OpenRouterResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenRouterResponsesContentPart[] }>;
      expect(input).toHaveLength(1);

      const content = input[0]!.content;
      expect(content).toHaveLength(2);

      const fileContent = content[1]! as OpenRouterResponsesFilePart;
      expect(fileContent.type).toBe('input_file');
      expect(fileContent.filename).toBe('Test PDF');
      expect(fileContent.file_data).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    });

    test('transforms URL PDF document block with file_url', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'url', url: 'https://example.com/document.pdf' },
        mimeType: 'application/pdf',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenRouterResponsesContentPart[] }>;
      const content = input[0]!.content;
      const fileContent = content[0]! as OpenRouterResponsesFilePart;
      expect(fileContent.type).toBe('input_file');
      expect(fileContent.file_url).toBe('https://example.com/document.pdf');
    });

    test('transforms text document as inline text', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: 'This is the document content.' },
        mimeType: 'text/plain',
        title: 'My Notes',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenRouterResponsesContentPart[] }>;
      const content = input[0]!.content;
      expect(content[0]!.type).toBe('input_text');
      expect((content[0] as { text: string }).text).toBe('[Document: My Notes]\nThis is the document content.');
    });

    test('throws error for empty text document', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: '' },
        mimeType: 'text/plain',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() => {
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'google/gemini-2.5-flash'
        );
      }).toThrow('Text document source data is empty');
    });
  });

  describe('audio blocks', () => {
    test('transforms audio block to input_audio', async () => {
      const transformRequest = await getTransformRequest();

      const audioBlock: AudioBlock = {
        type: 'audio',
        data: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
        mimeType: 'audio/mp3',
      };

      const userMessage = new UserMessage([audioBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenRouterResponsesContentPart[] }>;
      const content = input[0]!.content;
      const audioContent = content[0]! as OpenRouterResponsesAudioPart;
      expect(audioContent.type).toBe('input_audio');
      expect(audioContent.input_audio.format).toBe('mp3');
    });
  });

  describe('video blocks', () => {
    test('transforms video block to input_video', async () => {
      const transformRequest = await getTransformRequest();

      const videoBlock: VideoBlock = {
        type: 'video',
        data: new Uint8Array([0x00, 0x00, 0x00, 0x20]),
        mimeType: 'video/mp4',
      };

      const userMessage = new UserMessage([videoBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenRouterResponsesContentPart[] }>;
      const content = input[0]!.content;
      const videoContent = content[0]! as OpenRouterResponsesVideoPart;
      expect(videoContent.type).toBe('input_video');
      expect(videoContent.video_url).toMatch(/^data:video\/mp4;base64,/);
    });
  });

  describe('mixed content messages', () => {
    test('handles messages with text, document, audio, and video blocks', async () => {
      const transformRequest = await getTransformRequest();

      const userMessage = new UserMessage([
        { type: 'text', text: 'Analyze all of these' },
        {
          type: 'document',
          source: { type: 'base64', data: 'pdfdata' },
          mimeType: 'application/pdf',
        } as DocumentBlock,
        {
          type: 'audio',
          data: new Uint8Array([0x00]),
          mimeType: 'audio/mp3',
        } as AudioBlock,
        {
          type: 'video',
          data: new Uint8Array([0x00]),
          mimeType: 'video/mp4',
        } as VideoBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'google/gemini-2.5-flash'
      ) as OpenRouterResponsesRequest;

      const input = result.input as Array<{ role: string; content: OpenRouterResponsesContentPart[] }>;
      const content = input[0]!.content;
      expect(content).toHaveLength(4);
      expect(content[0]!.type).toBe('input_text');
      expect(content[1]!.type).toBe('input_file');
      expect(content[2]!.type).toBe('input_audio');
      expect(content[3]!.type).toBe('input_video');
    });
  });
});
