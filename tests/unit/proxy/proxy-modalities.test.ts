import { test, expect, describe, spyOn } from 'bun:test';
import { embedding, image } from '../../../src/index.ts';
import {
  proxy,
  parseEmbeddingBody,
  parseImageBody,
  toEmbeddingJSON,
  toImageJSON,
  toImageSSE,
} from '../../../src/proxy/index.ts';
import { Image } from '../../../src/core/media/Image.ts';
import * as fetchModule from '../../../src/http/fetch.ts';
import type { ImageProviderStreamResult, ImageStreamEvent } from '../../../src/types/image.ts';

const BASE64_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Proxy Embedding Handler', () => {
  test('sends embedding inputs and returns embeddings', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        embeddings: [
          { vector: [0.1, 0.2], index: 0 },
          { vector: [0.3, 0.4], index: 1 },
        ],
        usage: { totalTokens: 4 },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const doFetchSpy = spyOn(fetchModule, 'doFetch').mockResolvedValue(mockResponse);

    const backend = proxy({ endpoint: 'http://localhost:3001/embed' });
    const embedder = embedding({ model: backend('default') });

    const result = await embedder.embed(['hello', { type: 'text', text: 'world' }]);

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]?.vector).toEqual([0.1, 0.2]);
    expect(result.usage.totalTokens).toBe(4);

    const [url, init] = doFetchSpy.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/embed');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('default');
    expect(body.inputs).toEqual(['hello', { type: 'text', text: 'world' }]);

    doFetchSpy.mockRestore();
  });
});

describe('Proxy Image Handler', () => {
  test('sends image prompt and returns images', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        images: [
          {
            image: {
              source: { type: 'base64', data: BASE64_PNG },
              mimeType: 'image/png',
            },
            metadata: { revised_prompt: 'A test image' },
          },
        ],
        usage: { imagesGenerated: 1 },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const doFetchSpy = spyOn(fetchModule, 'doFetch').mockResolvedValue(mockResponse);

    const backend = proxy({ endpoint: 'http://localhost:3001/image' });
    const imageGen = image({ model: backend('default') });

    const result = await imageGen.generate('A test prompt');

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.image).toBeInstanceOf(Image);
    expect(result.images[0]?.metadata?.revised_prompt).toBe('A test image');
    expect(result.usage?.imagesGenerated).toBe(1);

    const [url, init] = doFetchSpy.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/image');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('default');
    expect(body.prompt).toBe('A test prompt');

    doFetchSpy.mockRestore();
  });

  test('streams image events and resolves result', async () => {
    const previewEvent = {
      type: 'preview',
      index: 0,
      image: {
        source: { type: 'base64', data: BASE64_PNG },
        mimeType: 'image/png',
      },
    };

    const completeEvent = {
      type: 'complete',
      index: 0,
      image: {
        image: {
          source: { type: 'base64', data: BASE64_PNG },
          mimeType: 'image/png',
        },
      },
    };

    const finalResponse = {
      images: [
        {
          image: {
            source: { type: 'base64', data: BASE64_PNG },
            mimeType: 'image/png',
          },
        },
      ],
      usage: { imagesGenerated: 1 },
    };

    const sseData = [
      `data: ${JSON.stringify(previewEvent)}\n\n`,
      `data: ${JSON.stringify(completeEvent)}\n\n`,
      `data: ${JSON.stringify(finalResponse)}\n\n`,
      'data: [DONE]\n\n',
    ].join('');

    const mockResponse = new Response(sseData, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const doStreamFetchSpy = spyOn(fetchModule, 'doStreamFetch').mockResolvedValue(mockResponse);

    const backend = proxy({ endpoint: 'http://localhost:3001/image' });
    const imageGen = image({ model: backend('default') });

    if (!imageGen.stream) {
      throw new Error('Expected stream to be available');
    }

    const stream = imageGen.stream('Stream prompt');
    const events = [] as Array<unknown>;

    for await (const event of stream) {
      events.push(event);
    }

    const result = await stream.result;

    expect(events.length).toBeGreaterThan(0);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.image).toBeInstanceOf(Image);

    doStreamFetchSpy.mockRestore();
  });
});

describe('Proxy Server Modality Utilities', () => {
  test('parses embedding request body', () => {
    const parsed = parseEmbeddingBody({
      inputs: ['hello'],
      params: { user: 'test' },
      model: 'text-embedding-3-small',
    });

    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.inputs[0]).toBe('hello');
    expect(parsed.params?.user).toBe('test');
    expect(parsed.model).toBe('text-embedding-3-small');
  });

  test('parses image request body', () => {
    const parsed = parseImageBody({
      prompt: 'Edit this image',
      image: {
        source: { type: 'base64', data: BASE64_PNG },
        mimeType: 'image/png',
      },
      params: { size: '1024x1024' },
    });

    expect(parsed.prompt).toBe('Edit this image');
    expect(parsed.image).toBeInstanceOf(Image);
    expect(parsed.params?.size).toBe('1024x1024');
  });

  test('serializes embedding result response', async () => {
    const response = toEmbeddingJSON({
      embeddings: [{ vector: [0.1, 0.2], dimensions: 2, index: 0 }],
      usage: { totalTokens: 2 },
    });

    const json = await response.json() as { embeddings: unknown[]; usage: { totalTokens: number } };
    expect(json.embeddings).toHaveLength(1);
    expect(json.usage.totalTokens).toBe(2);
  });

  test('serializes image result response', async () => {
    const response = toImageJSON({
      images: [
        {
          image: Image.fromBase64(BASE64_PNG, 'image/png'),
          metadata: { revised_prompt: 'Serialized' },
        },
      ],
      usage: { imagesGenerated: 1 },
    });

    const json = await response.json() as { images: Array<{ image: { source: { type: string } } }> };
    expect(json.images).toHaveLength(1);
    const firstImage = json.images[0];
    expect(firstImage).toBeDefined();
    expect(firstImage?.image.source.type).toBe('base64');
  });

  test('streams image SSE with provider stream response', async () => {
    const previewEvent: ImageStreamEvent = {
      type: 'preview',
      index: 0,
      image: Image.fromBase64(BASE64_PNG, 'image/png'),
    };

    const providerStream: ImageProviderStreamResult = {
      async *[Symbol.asyncIterator]() {
        yield previewEvent;
      },
      response: Promise.resolve({
        images: [{ image: Image.fromBase64(BASE64_PNG, 'image/png') }],
        usage: { imagesGenerated: 1 },
      }),
    };

    const response = toImageSSE(providerStream);
    const body = await response.text();

    expect(body).toContain('"preview"');
    expect(body).toContain(BASE64_PNG);
    expect(body).toContain('"images"');
  });
});
