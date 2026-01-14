import { test, expect, describe } from 'bun:test';
import { llm, Document, Audio, Video } from '../../src/index.ts';
import { openrouter } from '../../src/openrouter/index.ts';
import type { OpenRouterCompletionsParams, OpenRouterResponsesParams } from '../../src/openrouter/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { join } from 'path';

const PDF_PATH = join(import.meta.dir, '../assets/helloworld.pdf');
const AUDIO_PATH = join(import.meta.dir, '../assets/helloworld.mp3');
const VIDEO_PATH = join(import.meta.dir, '../assets/BigBuckBunny_320x180.mp4');

// Use Gemini via OpenRouter for media support
const MEDIA_MODEL = 'google/gemini-2.5-flash';

/**
 * Live API tests for OpenRouter media inputs (documents, audio, video)
 * Uses Gemini model which supports all media types natively.
 * Requires OPENROUTER_API_KEY environment variable
 */
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Media Inputs', () => {
  describe('completions API', () => {
    describe('document input', () => {
      test('PDF document analysis with Document helper', async () => {
        const doc = await Document.fromPath(PDF_PATH);

        const model = llm<OpenRouterCompletionsParams>({
          model: openrouter(MEDIA_MODEL, { api: 'completions' }),
          params: { max_tokens: 200 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What text content is in this PDF? Be concise.' },
          doc.toBlock(),
        ]);

        const turn = await model.generate([message]);

        expect(turn.response.text.toLowerCase()).toMatch(/hello|world/i);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      });

      test('text document with Document.fromText', async () => {
        const doc = Document.fromText('The quick brown fox jumps over the lazy dog.');

        const model = llm<OpenRouterCompletionsParams>({
          model: openrouter(MEDIA_MODEL, { api: 'completions' }),
          params: { max_tokens: 100 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'Read this document and repeat back the exact sentence it contains.' },
          doc.toBlock(),
        ]);

        const turn = await model.generate([message]);

        expect(turn.response.text.toLowerCase()).toMatch(/fox|dog|quick|brown|lazy/);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      });

      test('streaming with document input', async () => {
        const doc = await Document.fromPath(PDF_PATH);

        const model = llm<OpenRouterCompletionsParams>({
          model: openrouter(MEDIA_MODEL, { api: 'completions' }),
          params: { max_tokens: 200 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What does this PDF say? Reply briefly.' },
          doc.toBlock(),
        ]);

        const stream = model.stream([message]);

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
      test('audio analysis with Audio helper', async () => {
        const audio = await Audio.fromPath(AUDIO_PATH);

        const model = llm<OpenRouterCompletionsParams>({
          model: openrouter(MEDIA_MODEL, { api: 'completions' }),
          params: { max_tokens: 500 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What is this song about? Mention some specific lyrics or themes.' },
          audio.toBlock(),
        ]);

        const turn = await model.generate([message]);

        const text = turn.response.text.toLowerCase();
        expect(text).toMatch(/code|programming|hello|world|bug|compile|git|terminal|developer/);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      }, 60000);

      test('streaming with audio input', async () => {
        const audio = await Audio.fromPath(AUDIO_PATH);

        const model = llm<OpenRouterCompletionsParams>({
          model: openrouter(MEDIA_MODEL, { api: 'completions' }),
          params: { max_tokens: 300 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'Briefly describe what you hear in this audio.' },
          audio.toBlock(),
        ]);

        const stream = model.stream([message]);

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

        // Skip if video exceeds size limits
        const sizeMB = video.size / (1024 * 1024);
        if (sizeMB > 20) {
          console.log(`Skipping: video is ${sizeMB.toFixed(1)}MB (exceeds 20MB limit)`);
          return;
        }

        const model = llm<OpenRouterCompletionsParams>({
          model: openrouter(MEDIA_MODEL, { api: 'completions' }),
          params: { max_tokens: 300 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What is shown in this video? Describe briefly.' },
          video.toBlock(),
        ]);

        const turn = await model.generate([message]);

        const text = turn.response.text.toLowerCase();
        expect(text).toMatch(/bunny|rabbit|animal|cartoon|animated|character/);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      }, 60000);
    });
  });

  describe('responses API', () => {
    describe('document input', () => {
      test('PDF document analysis with Document helper', async () => {
        const doc = await Document.fromPath(PDF_PATH);

        const model = llm<OpenRouterResponsesParams>({
          model: openrouter(MEDIA_MODEL, { api: 'responses' }),
          params: { max_output_tokens: 200 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What text content is in this PDF? Be concise.' },
          doc.toBlock(),
        ]);

        const turn = await model.generate([message]);

        expect(turn.response.text.toLowerCase()).toMatch(/hello|world/i);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      });

      test('text document with Document.fromText', async () => {
        const doc = Document.fromText('The quick brown fox jumps over the lazy dog.');

        const model = llm<OpenRouterResponsesParams>({
          model: openrouter(MEDIA_MODEL, { api: 'responses' }),
          params: { max_output_tokens: 100 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'Read this document and repeat back the exact sentence it contains.' },
          doc.toBlock(),
        ]);

        const turn = await model.generate([message]);

        expect(turn.response.text.toLowerCase()).toMatch(/fox|dog|quick|brown|lazy/);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      });

      test('streaming with document input', async () => {
        const doc = await Document.fromPath(PDF_PATH);

        const model = llm<OpenRouterResponsesParams>({
          model: openrouter(MEDIA_MODEL, { api: 'responses' }),
          params: { max_output_tokens: 200 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What does this PDF say? Reply briefly.' },
          doc.toBlock(),
        ]);

        const stream = model.stream([message]);

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
      test('audio analysis with Audio helper', async () => {
        const audio = await Audio.fromPath(AUDIO_PATH);

        const model = llm<OpenRouterResponsesParams>({
          model: openrouter(MEDIA_MODEL, { api: 'responses' }),
          params: { max_output_tokens: 500 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What is this song about? Mention some specific lyrics or themes.' },
          audio.toBlock(),
        ]);

        const turn = await model.generate([message]);

        const text = turn.response.text.toLowerCase();
        expect(text).toMatch(/code|programming|hello|world|bug|compile|git|terminal|developer/);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      }, 60000);

      test('streaming with audio input', async () => {
        const audio = await Audio.fromPath(AUDIO_PATH);

        const model = llm<OpenRouterResponsesParams>({
          model: openrouter(MEDIA_MODEL, { api: 'responses' }),
          params: { max_output_tokens: 300 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'Briefly describe what you hear in this audio.' },
          audio.toBlock(),
        ]);

        const stream = model.stream([message]);

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

        // Skip if video exceeds size limits
        const sizeMB = video.size / (1024 * 1024);
        if (sizeMB > 20) {
          console.log(`Skipping: video is ${sizeMB.toFixed(1)}MB (exceeds 20MB limit)`);
          return;
        }

        const model = llm<OpenRouterResponsesParams>({
          model: openrouter(MEDIA_MODEL, { api: 'responses' }),
          params: { max_output_tokens: 300 },
        });

        const message = new UserMessage([
          { type: 'text', text: 'What is shown in this video? Describe briefly.' },
          video.toBlock(),
        ]);

        const turn = await model.generate([message]);

        const text = turn.response.text.toLowerCase();
        expect(text).toMatch(/bunny|rabbit|animal|cartoon|animated|character/);
        expect(turn.usage.totalTokens).toBeGreaterThan(0);
      }, 60000);
    });
  });
});
