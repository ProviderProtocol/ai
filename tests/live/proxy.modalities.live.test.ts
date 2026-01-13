import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import type { Server } from 'bun';
import { embedding, image } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import {
  proxy,
  parseEmbeddingBody,
  parseImageBody,
  toEmbeddingJSON,
  toImageJSON,
} from '../../src/proxy/index.ts';

const TEST_PORT = 19878;
const EMBED_ENDPOINT = `http://localhost:${TEST_PORT}/api/embedding`;
const IMAGE_ENDPOINT = `http://localhost:${TEST_PORT}/api/image`;

let server: Server<unknown>;

describe.skipIf(!process.env.OPENAI_API_KEY)('Proxy Live API - Embedding & Image', () => {
  beforeAll(() => {
    server = Bun.serve({
      port: TEST_PORT,
      async fetch(req) {
        const url = new URL(req.url);

        if (req.method === 'POST' && url.pathname === '/api/embedding') {
          try {
            const body = await req.json();
            const { inputs, params } = parseEmbeddingBody(body);

            const embedder = embedding({
              model: openai('text-embedding-3-small'),
              params,
            });

            const result = await embedder.embed(inputs);
            return toEmbeddingJSON(result);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Proxy live embedding error:', error);
            return new Response(JSON.stringify({ error: { message } }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        if (req.method === 'POST' && url.pathname === '/api/image') {
          try {
            const body = await req.json();
            const { prompt, params, image: inputImage, mask } = parseImageBody(body);

            const generator = image({
              model: openai('dall-e-3'),
              params,
            });

            const result = inputImage
              ? await generator.edit!({ image: inputImage, mask, prompt })
              : await generator.generate(prompt);

            return toImageJSON(result);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Proxy live image error:', error);
            return new Response(JSON.stringify({ error: { message } }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response('Not found', { status: 404 });
      },
    });
  });

  afterAll(() => {
    server?.stop();
  });

  test(
    'embedding via proxy',
    async () => {
      const backend = proxy({ endpoint: EMBED_ENDPOINT });
      const embedder = embedding({ model: backend('default') });

      const result = await embedder.embed('Hello proxy embedding');

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]?.vector.length).toBeGreaterThan(0);
    },
    { timeout: 20000 }
  );

  test(
    'image generation via proxy',
    async () => {
      const backend = proxy({ endpoint: IMAGE_ENDPOINT });
      const imageGen = image({
        model: backend('default'),
        params: {
          size: '1024x1024',
          quality: 'standard',
        },
      });

      const result = await imageGen.generate(
        'A simple blue square on a white background.'
      );

      expect(result.images.length).toBeGreaterThan(0);
      expect(result.images[0]?.image).toBeDefined();
    },
    { timeout: 60000 }
  );
});
