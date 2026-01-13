import { describe, expect, test } from 'bun:test';
import { llm } from '../../src/index.ts';
import { google } from '../../src/google/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import { StreamEventType } from '../../src/types/stream.ts';

/**
 * Live API tests for Gemini image response modalities (Nano Banana).
 * Requires GOOGLE_API_KEY environment variable.
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Gemini Image Response Modalities', () => {
  const IMAGE_MODEL = 'gemini-2.5-flash-image';

  test('basic image generation', async () => {
    const model = llm<GoogleLLMParams>({
      model: google(IMAGE_MODEL),
      params: {
        maxOutputTokens: 512,
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const turn = await model.generate('Generate a simple image of a red circle on a white background.');

    const image = turn.response.images[0];
    expect(image).toBeDefined();
    if (!image) {
      return;
    }
    expect(image.mimeType).toMatch(/^image\//);
    expect(image.source.type).toBe('base64');
    if (image.source.type === 'base64') {
      expect(image.source.data.length).toBeGreaterThan(100);
    }
  }, 60000);

  test('image generation with text response', async () => {
    const model = llm<GoogleLLMParams>({
      model: google(IMAGE_MODEL),
      params: {
        maxOutputTokens: 512,
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const turn = await model.generate('Create an image of a blue square, and describe what you created.');

    const image = turn.response.images[0];
    expect(image).toBeDefined();
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('streaming image generation', async () => {
    const model = llm<GoogleLLMParams>({
      model: google(IMAGE_MODEL),
      params: {
        maxOutputTokens: 512,
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const stream = model.stream('Generate an image of a green triangle.');
    const events: string[] = [];

    for await (const event of stream) {
      events.push(event.type);
    }

    const turn = await stream.turn;
    expect(events).toContain(StreamEventType.MessageStart);
    expect(events).toContain(StreamEventType.MessageStop);

    const image = turn.response.images[0];
    expect(image).toBeDefined();
  }, 60000);
});
