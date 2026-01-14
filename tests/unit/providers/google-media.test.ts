import { test, expect, describe } from 'bun:test';
import { UserMessage } from '../../../src/types/messages.ts';
import type {
  DocumentBlock,
  AudioBlock,
  VideoBlock,
  ImageBlock,
} from '../../../src/types/content.ts';
import type { GoogleRequest, GoogleImagePart } from '../../../src/providers/google/types.ts';

type GoogleInlineDataPart = { inlineData: { mimeType: string; data: string } };
type GoogleTextPart = { text: string };

describe('Google media transform', () => {
  const getTransformRequest = async () => {
    const { transformRequest } = await import(
      '../../../src/providers/google/transform.ts'
    );
    return transformRequest;
  };

  describe('document blocks', () => {
    test('transforms base64 PDF document to inlineData', async () => {
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
        'gemini-2.5-flash'
      ) as GoogleRequest;

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]!.role).toBe('user');
      expect(result.contents[0]!.parts).toHaveLength(2);

      const textPart = result.contents[0]!.parts[0] as GoogleTextPart;
      expect(textPart.text).toBe('Analyze this document');

      const docPart = result.contents[0]!.parts[1] as GoogleInlineDataPart;
      expect(docPart.inlineData).toBeDefined();
      expect(docPart.inlineData.mimeType).toBe('application/pdf');
      expect(docPart.inlineData.data).toBe('JVBERi0xLjQK');
    });

    test('transforms text document to text part', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'text', data: 'This is plain text content.' },
        mimeType: 'text/plain',
      };

      const userMessage = new UserMessage([documentBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gemini-2.5-flash'
      ) as GoogleRequest;

      const textPart = result.contents[0]!.parts[0] as GoogleTextPart;
      expect(textPart.text).toBe('This is plain text content.');
    });

    test('throws error for URL document source', async () => {
      const transformRequest = await getTransformRequest();

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'url', url: 'https://example.com/doc.pdf' },
        mimeType: 'application/pdf',
      };

      const userMessage = new UserMessage([documentBlock]);

      expect(() =>
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gemini-2.5-flash'
        )
      ).toThrow('Google API does not support URL document sources directly');
    });
  });

  describe('audio blocks', () => {
    test('transforms audio block to inlineData', async () => {
      const transformRequest = await getTransformRequest();

      const audioData = new Uint8Array([0x49, 0x44, 0x33]); // ID3 header bytes
      const audioBlock: AudioBlock = {
        type: 'audio',
        data: audioData,
        mimeType: 'audio/mp3',
        duration: 120,
      };

      const userMessage = new UserMessage([
        { type: 'text', text: 'Transcribe this audio' },
        audioBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gemini-2.5-flash'
      ) as GoogleRequest;

      expect(result.contents[0]!.parts).toHaveLength(2);

      const audioPart = result.contents[0]!.parts[1] as GoogleInlineDataPart;
      expect(audioPart.inlineData).toBeDefined();
      expect(audioPart.inlineData.mimeType).toBe('audio/mp3');
      expect(audioPart.inlineData.data).toBe(btoa(String.fromCharCode(...audioData)));
    });
  });

  describe('video blocks', () => {
    test('transforms video block to inlineData', async () => {
      const transformRequest = await getTransformRequest();

      const videoData = new Uint8Array([0x00, 0x00, 0x00, 0x1c]); // MP4 header bytes
      const videoBlock: VideoBlock = {
        type: 'video',
        data: videoData,
        mimeType: 'video/mp4',
        duration: 30,
        width: 1920,
        height: 1080,
      };

      const userMessage = new UserMessage([
        { type: 'text', text: 'Describe this video' },
        videoBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gemini-2.5-flash'
      ) as GoogleRequest;

      expect(result.contents[0]!.parts).toHaveLength(2);

      const videoPart = result.contents[0]!.parts[1] as GoogleInlineDataPart;
      expect(videoPart.inlineData).toBeDefined();
      expect(videoPart.inlineData.mimeType).toBe('video/mp4');
      expect(videoPart.inlineData.data).toBe(btoa(String.fromCharCode(...videoData)));
    });
  });

  describe('mixed media messages', () => {
    test('handles messages with text, image, document, and audio', async () => {
      const transformRequest = await getTransformRequest();

      const imageBlock: ImageBlock = {
        type: 'image',
        source: { type: 'base64', data: 'imagedata' },
        mimeType: 'image/png',
      };

      const documentBlock: DocumentBlock = {
        type: 'document',
        source: { type: 'base64', data: 'pdfdata' },
        mimeType: 'application/pdf',
      };

      const audioBlock: AudioBlock = {
        type: 'audio',
        data: new Uint8Array([0x01, 0x02, 0x03]),
        mimeType: 'audio/wav',
      };

      const userMessage = new UserMessage([
        { type: 'text', text: 'Analyze these files' },
        imageBlock,
        documentBlock,
        audioBlock,
      ]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gemini-2.5-flash'
      ) as GoogleRequest;

      expect(result.contents[0]!.parts).toHaveLength(4);

      const textPart = result.contents[0]!.parts[0] as GoogleTextPart;
      expect(textPart.text).toBe('Analyze these files');

      const imgPart = result.contents[0]!.parts[1] as GoogleInlineDataPart;
      expect(imgPart.inlineData.mimeType).toBe('image/png');

      const docPart = result.contents[0]!.parts[2] as GoogleInlineDataPart;
      expect(docPart.inlineData.mimeType).toBe('application/pdf');

      const audPart = result.contents[0]!.parts[3] as GoogleInlineDataPart;
      expect(audPart.inlineData.mimeType).toBe('audio/wav');
    });
  });

  describe('image blocks (existing functionality)', () => {
    test('transforms base64 image to inlineData', async () => {
      const transformRequest = await getTransformRequest();

      const imageBlock: ImageBlock = {
        type: 'image',
        source: { type: 'base64', data: 'iVBORw0KGgo=' },
        mimeType: 'image/png',
      };

      const userMessage = new UserMessage([imageBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gemini-2.5-flash'
      ) as GoogleRequest;

      const imgPart = result.contents[0]!.parts[0] as GoogleImagePart;
      expect(imgPart.inlineData.mimeType).toBe('image/png');
      expect(imgPart.inlineData.data).toBe('iVBORw0KGgo=');
    });

    test('transforms bytes image to inlineData', async () => {
      const transformRequest = await getTransformRequest();

      const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const imageBlock: ImageBlock = {
        type: 'image',
        source: { type: 'bytes', data: imageBytes },
        mimeType: 'image/png',
      };

      const userMessage = new UserMessage([imageBlock]);

      const result = transformRequest(
        { messages: [userMessage], config: { apiKey: 'test' } },
        'gemini-2.5-flash'
      ) as GoogleRequest;

      const imgPart = result.contents[0]!.parts[0] as GoogleImagePart;
      expect(imgPart.inlineData.mimeType).toBe('image/png');
      expect(imgPart.inlineData.data).toBe(btoa(String.fromCharCode(...imageBytes)));
    });

    test('throws error for URL image source', async () => {
      const transformRequest = await getTransformRequest();

      const imageBlock: ImageBlock = {
        type: 'image',
        source: { type: 'url', url: 'https://example.com/img.png' },
        mimeType: 'image/png',
      };

      const userMessage = new UserMessage([imageBlock]);

      expect(() =>
        transformRequest(
          { messages: [userMessage], config: { apiKey: 'test' } },
          'gemini-2.5-flash'
        )
      ).toThrow('Google API does not support URL image sources directly');
    });
  });
});
