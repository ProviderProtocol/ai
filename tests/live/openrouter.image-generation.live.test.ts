import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openrouter } from '../../src/openrouter/index.ts';
import type { OpenRouterCompletionsParams } from '../../src/openrouter/index.ts';
import { isImageBlock } from '../../src/types/content.ts';

const IMAGE_MODEL = 'google/gemini-2.5-flash-image';

/**
 * Live API tests for OpenRouter Image Generation (Completions API)
 * Requires OPENROUTER_API_KEY environment variable
 *
 * These tests use Gemini models that support image generation through
 * the modalities parameter in the Chat Completions API.
 */
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Image Generation Live', () => {
  test('basic image generation', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(IMAGE_MODEL),
      params: {
        max_tokens: 1000,
        modalities: ['text', 'image'],
      },
    });

    const turn = await model.generate('Generate a simple image of a red circle on a white background.');

    const images = turn.response.content.filter(isImageBlock);
    expect(images.length).toBeGreaterThan(0);
    if (images.length > 1) {
      console.log(`[Completions API] Multi-image response: received ${images.length} images`);
    }

    const image = images[0]!;
    expect(image.type).toBe('image');
    expect(image.mimeType).toMatch(/^image\//);
    expect(image.source.type).toBe('base64');
    if (image.source.type === 'base64') {
      expect(image.source.data.length).toBeGreaterThan(100);
    }
  }, 60000);

  test('image generation with text response', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(IMAGE_MODEL),
      params: {
        max_tokens: 1000,
        modalities: ['text', 'image'],
      },
    });

    const turn = await model.generate('Create an image of a blue square, and describe what you created.');

    const images = turn.response.content.filter(isImageBlock);
    expect(images.length).toBeGreaterThan(0);
    if (images.length > 1) {
      console.log(`[Completions API] Multi-image response: received ${images.length} images`);
    }

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  }, 60000);

  test('image generation with aspect ratio config', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(IMAGE_MODEL),
      params: {
        max_tokens: 1000,
        modalities: ['text', 'image'],
        image_config: {
          aspect_ratio: '16:9',
        },
      },
    });

    const turn = await model.generate('Generate a landscape image of mountains at sunset.');

    const images = turn.response.content.filter(isImageBlock);
    expect(images.length).toBeGreaterThan(0);
    if (images.length > 1) {
      console.log(`[Completions API] Multi-image response: received ${images.length} images`);
    }

    const image = images[0]!;
    expect(image.type).toBe('image');
    expect(image.source.type).toBe('base64');
  }, 60000);

  test('streaming image generation', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(IMAGE_MODEL),
      params: {
        max_tokens: 1000,
        modalities: ['text', 'image'],
      },
    });

    const stream = model.stream('Generate an image of a green triangle.');

    const events: string[] = [];
    for await (const event of stream) {
      events.push(event.type);
    }

    const turn = await stream.turn;

    expect(events).toContain('message_start');
    expect(events).toContain('message_stop');

    const images = turn.response.content.filter(isImageBlock);
    expect(images.length).toBeGreaterThan(0);
    if (images.length > 1) {
      console.log(`[Completions API Streaming] Multi-image response: received ${images.length} images`);
    }
  }, 60000);

  test('multiple image generation', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(IMAGE_MODEL),
      params: {
        max_tokens: 2000,
        modalities: ['text', 'image'],
      },
    });

    const turn = await model.generate('Generate two different images: first a red circle, then a blue square. Create both images.');

    const images = turn.response.content.filter(isImageBlock);
    expect(images.length).toBeGreaterThanOrEqual(1);
    if (images.length >= 2) {
      console.log(`[Completions API] Multi-image success: received ${images.length} images as requested`);
    } else {
      console.log(`[Completions API] Single image returned (asked for 2, got ${images.length})`);
    }
  }, 90000);

  test('imageOutput capability is enabled', () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter(IMAGE_MODEL),
    });

    expect(model.capabilities.imageOutput).toBe(true);
  });
});
