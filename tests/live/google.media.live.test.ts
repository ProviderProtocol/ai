import { test, expect, describe } from 'bun:test';
import { llm, Document, Audio, Video, Image } from '../../src/index.ts';
import { google } from '../../src/google/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { join } from 'path';

const PDF_PATH = join(import.meta.dir, '../assets/helloworld.pdf');
const AUDIO_PATH = join(import.meta.dir, '../assets/helloworld.mp3');
const VIDEO_PATH = join(import.meta.dir, '../assets/BigBuckBunny_320x180.mp4');
const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');

/**
 * Live API tests for Google Gemini media inputs (documents, audio, video)
 * Requires GOOGLE_API_KEY environment variable
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Gemini Media Inputs', () => {
  describe('document input', () => {
    test('PDF document analysis with Document helper', async () => {
      const doc = await Document.fromPath(PDF_PATH);

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 200 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What text content is in this PDF? Be concise.' },
        doc.toBlock(),
      ]);

      const turn = await gemini.generate([message]);

      expect(turn.response.text.toLowerCase()).toMatch(/hello|world/i);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);
    });

    test('text document with Document.fromText', async () => {
      const doc = Document.fromText('The quick brown fox jumps over the lazy dog.');

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 100 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'Read this document and repeat back the exact sentence it contains.' },
        doc.toBlock(),
      ]);

      const turn = await gemini.generate([message]);

      expect(turn.response.text.toLowerCase()).toMatch(/fox|dog|quick|brown|lazy/);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);
    });

    test('streaming with document input', async () => {
      const doc = await Document.fromPath(PDF_PATH);

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 200 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What does this PDF say? Reply briefly.' },
        doc.toBlock(),
      ]);

      const stream = gemini.stream([message]);

      let textChunks = 0;
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          textChunks++;
        }
      }

      const turn = await stream.turn;

      expect(textChunks).toBeGreaterThan(0);
      expect(turn.response.text.toLowerCase()).toMatch(/hello|world/i);
    });
  });

  describe('audio input', () => {
    test('audio transcription with Audio helper', async () => {
      const audio = await Audio.fromPath(AUDIO_PATH);

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 500 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What is this song about? Mention some specific lyrics or themes.' },
        audio.toBlock(),
      ]);

      const turn = await gemini.generate([message]);

      const text = turn.response.text.toLowerCase();
      expect(text).toMatch(/code|programming|hello|world|bug|compile|git|terminal|developer/);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);
    }, 60000);

    test('streaming with audio input', async () => {
      const audio = await Audio.fromPath(AUDIO_PATH);

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 300 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'Briefly describe what you hear in this audio.' },
        audio.toBlock(),
      ]);

      const stream = gemini.stream([message]);

      let textChunks = 0;
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          textChunks++;
        }
      }

      const turn = await stream.turn;

      expect(textChunks).toBeGreaterThan(0);
      expect(turn.response.text.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('video input', () => {
    test('video content analysis with Video helper', async () => {
      const video = await Video.fromPath(VIDEO_PATH);

      // Skip if video exceeds Google's 20MB inline limit
      const sizeMB = video.size / (1024 * 1024);
      if (sizeMB > 20) {
        console.log(`Skipping: video is ${sizeMB.toFixed(1)}MB (exceeds 20MB limit)`);
        return;
      }

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 300 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What is shown in this video? Describe briefly.' },
        video.toBlock(),
      ]);

      const turn = await gemini.generate([message]);

      const text = turn.response.text.toLowerCase();
      expect(text).toMatch(/bunny|rabbit|animal|cartoon|animated|character/);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);
    }, 60000);

    test('streaming with video input', async () => {
      const video = await Video.fromPath(VIDEO_PATH);

      const sizeMB = video.size / (1024 * 1024);
      if (sizeMB > 20) {
        console.log(`Skipping: video is ${sizeMB.toFixed(1)}MB (exceeds 20MB limit)`);
        return;
      }

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 200 },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What type of content is this video? One sentence.' },
        video.toBlock(),
      ]);

      const stream = gemini.stream([message]);

      let textChunks = 0;
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          textChunks++;
        }
      }

      const turn = await stream.turn;

      expect(textChunks).toBeGreaterThan(0);
      expect(turn.response.text.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('mixed media', () => {
    test('image and document together', async () => {
      const image = await Image.fromPath(DUCK_IMAGE_PATH);
      const doc = await Document.fromPath(PDF_PATH);

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 200 },
      });

      const message = new UserMessage([
        {
          type: 'text',
          text: 'I have an image and a document. What animal is in the image, and what text is in the document? Answer both briefly.',
        },
        image.toBlock(),
        doc.toBlock(),
      ]);

      const turn = await gemini.generate([message]);

      const text = turn.response.text.toLowerCase();
      expect(text).toMatch(/duck|bird|waterfowl/);
      expect(text).toMatch(/hello|world/);
    });

    test('audio and document together', async () => {
      const audio = await Audio.fromPath(AUDIO_PATH);
      const doc = await Document.fromPath(PDF_PATH);

      const gemini = llm<GoogleLLMParams>({
        model: google('gemini-2.5-flash'),
        params: { maxOutputTokens: 300 },
      });

      const message = new UserMessage([
        {
          type: 'text',
          text: 'I have an audio file and a PDF. What phrase appears in both? Answer briefly.',
        },
        audio.toBlock(),
        doc.toBlock(),
      ]);

      const turn = await gemini.generate([message]);

      const text = turn.response.text.toLowerCase();
      expect(text).toMatch(/hello.*world|world.*hello/);
    }, 60000);
  });
});
