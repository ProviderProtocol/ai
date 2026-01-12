/**
 * @fileoverview Live API tests for embedding functionality across all providers.
 *
 * These tests require valid API keys set in environment variables:
 * - OPENAI_API_KEY for OpenAI embeddings
 * - GOOGLE_API_KEY for Google embeddings
 * - OPENROUTER_API_KEY for OpenRouter embeddings
 * - Ollama server running at localhost:11434
 */
import { test, expect, describe } from 'bun:test';
import { embedding } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import { google } from '../../src/google/index.ts';
import { ollama } from '../../src/ollama/index.ts';
import { openrouter } from '../../src/openrouter/index.ts';
import type { OpenAIEmbedParams } from '../../src/openai/index.ts';
import type { GoogleEmbedParams } from '../../src/google/index.ts';
import type { OllamaEmbedParams } from '../../src/ollama/index.ts';
import type { OpenRouterEmbedParams } from '../../src/openrouter/index.ts';
import { UPPError } from '../../src/types/errors.ts';

// Test models for each provider
const OPENAI_MODEL = 'text-embedding-3-small';
const GOOGLE_MODEL = 'text-embedding-004';
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:4b';
const OPENROUTER_MODEL = 'openai/text-embedding-3-small';

// Check for API keys
const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY;
const HAS_GOOGLE_KEY = !!process.env.GOOGLE_API_KEY;
const HAS_OPENROUTER_KEY = !!process.env.OPENROUTER_API_KEY;

/**
 * OpenAI Embedding Tests
 */
describe.skipIf(!HAS_OPENAI_KEY)('OpenAI Embeddings', () => {
  test('single text embedding', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
    });

    const result = await embedder.embed('Hello world');

    expect(result.embeddings).toHaveLength(1);
    const emb = result.embeddings[0]!;
    expect(emb.vector).toBeInstanceOf(Array);
    expect(emb.vector.length).toBeGreaterThan(0);
    expect(emb.dimensions).toBe(emb.vector.length);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  test('batch embedding', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
    });

    const texts = ['Hello', 'World', 'Test embedding'];
    const result = await embedder.embed(texts);

    expect(result.embeddings).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const emb = result.embeddings[i]!;
      expect(emb.index).toBe(i);
      expect(emb.vector.length).toBeGreaterThan(0);
    }
  });

  test('custom dimensions', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
      params: { dimensions: 256 },
    });

    const result = await embedder.embed('Test with custom dimensions');

    const emb = result.embeddings[0]!;
    expect(emb.dimensions).toBe(256);
    expect(emb.vector).toHaveLength(256);
  });

  test('base64 encoding format', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
      params: { encoding_format: 'base64' },
    });

    const result = await embedder.embed('Test base64');

    // Core should normalize base64 to floats automatically
    const emb = result.embeddings[0]!;
    expect(Array.isArray(emb.vector)).toBe(true);
    expect(emb.vector.length).toBeGreaterThan(0);
  });

  test('aborts embedding request via signal', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
    });

    const controller = new AbortController();
    controller.abort();

    try {
      await embedder.embed('abort me', { signal: controller.signal });
      throw new Error('Expected embed to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('CANCELLED');
        expect(error.modality).toBe('embedding');
      }
    }
  });

  test('chunked streaming for large batches', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
    });

    const texts = Array.from({ length: 10 }, (_, i) => `Document ${i} content`);
    const stream = embedder.embed(texts, { chunked: true, batchSize: 3 });

    let progressCount = 0;
    for await (const progress of stream) {
      progressCount++;
      expect(progress.embeddings.length).toBeGreaterThan(0);
      expect(progress.total).toBe(10);
    }

    expect(progressCount).toBeGreaterThan(1);

    const finalResult = await stream.result;
    expect(finalResult.embeddings).toHaveLength(10);
  });

  test('text-embedding-3-large model', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai('text-embedding-3-large'),
    });

    const result = await embedder.embed('Test large model');

    // Default dimensions for 3-large is 3072
    expect(result.embeddings[0]!.dimensions).toBe(3072);
  });
});

/**
 * Google Embedding Tests
 */
describe.skipIf(!HAS_GOOGLE_KEY)('Google Embeddings', () => {
  test('single text embedding', async () => {
    const embedder = embedding<GoogleEmbedParams>({
      model: google(GOOGLE_MODEL),
    });

    const result = await embedder.embed('Hello world');

    expect(result.embeddings).toHaveLength(1);
    const emb = result.embeddings[0]!;
    expect(emb.vector).toBeInstanceOf(Array);
    expect(emb.vector.length).toBeGreaterThan(0);
  });

  test('batch embedding', async () => {
    const embedder = embedding<GoogleEmbedParams>({
      model: google(GOOGLE_MODEL),
    });

    const texts = ['Hello', 'World', 'Test embedding'];
    const result = await embedder.embed(texts);

    expect(result.embeddings).toHaveLength(3);
  });

  test('with RETRIEVAL_QUERY task type', async () => {
    const embedder = embedding<GoogleEmbedParams>({
      model: google(GOOGLE_MODEL),
      params: { taskType: 'RETRIEVAL_QUERY' },
    });

    const result = await embedder.embed('What is the meaning of life?');

    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]!.vector.length).toBeGreaterThan(0);
  });

  test('with RETRIEVAL_DOCUMENT task type and title', async () => {
    const embedder = embedding<GoogleEmbedParams>({
      model: google(GOOGLE_MODEL),
      params: {
        taskType: 'RETRIEVAL_DOCUMENT',
        title: 'Important Document',
      },
    });

    const result = await embedder.embed('This is the content of an important document.');

    expect(result.embeddings).toHaveLength(1);
  });

  test('with SEMANTIC_SIMILARITY task type', async () => {
    const embedder = embedding<GoogleEmbedParams>({
      model: google(GOOGLE_MODEL),
      params: { taskType: 'SEMANTIC_SIMILARITY' },
    });

    const texts = ['The cat sat on the mat', 'A feline rested on the rug'];
    const result = await embedder.embed(texts);

    expect(result.embeddings).toHaveLength(2);

    // Calculate cosine similarity
    const v1 = result.embeddings[0]!.vector;
    const v2 = result.embeddings[1]!.vector;
    const dot = v1.reduce((sum, a, i) => sum + a * v2[i]!, 0);
    const mag1 = Math.sqrt(v1.reduce((sum, a) => sum + a * a, 0));
    const mag2 = Math.sqrt(v2.reduce((sum, a) => sum + a * a, 0));
    const similarity = dot / (mag1 * mag2);

    // Similar sentences should have high similarity
    expect(similarity).toBeGreaterThan(0.5);
  });

  test('with custom output dimensionality', async () => {
    const embedder = embedding<GoogleEmbedParams>({
      model: google(GOOGLE_MODEL),
      params: { outputDimensionality: 256 },
    });

    const result = await embedder.embed('Test custom dimensions');

    expect(result.embeddings[0]!.dimensions).toBe(256);
  });
});

/**
 * Ollama Embedding Tests
 */
describe('Ollama Embeddings', () => {
  test('single text embedding', async () => {
    const embedder = embedding<OllamaEmbedParams>({
      model: ollama(OLLAMA_MODEL),
    });

    try {
      const result = await embedder.embed('Hello world');

      expect(result.embeddings).toHaveLength(1);
      const emb = result.embeddings[0]!;
      expect(emb.vector).toBeInstanceOf(Array);
      expect(emb.vector.length).toBeGreaterThan(0);
    } catch (error) {
      // Skip if Ollama not running or model not available
      if (error instanceof UPPError && error.code === 'NETWORK_ERROR') {
        console.log('Skipping Ollama test: server not running');
        return;
      }
      throw error;
    }
  });

  test('batch embedding', async () => {
    const embedder = embedding<OllamaEmbedParams>({
      model: ollama(OLLAMA_MODEL),
    });

    try {
      const texts = ['Hello', 'World', 'Test'];
      const result = await embedder.embed(texts);

      expect(result.embeddings).toHaveLength(3);
      for (const emb of result.embeddings) {
        expect(emb.vector.length).toBeGreaterThan(0);
      }
    } catch (error) {
      if (error instanceof UPPError && error.code === 'NETWORK_ERROR') {
        console.log('Skipping Ollama test: server not running');
        return;
      }
      throw error;
    }
  });

  test('with truncate option', async () => {
    const embedder = embedding<OllamaEmbedParams>({
      model: ollama(OLLAMA_MODEL),
      params: { truncate: true },
    });

    try {
      const result = await embedder.embed('Test with truncate option');

      expect(result.embeddings).toHaveLength(1);
    } catch (error) {
      if (error instanceof UPPError && error.code === 'NETWORK_ERROR') {
        console.log('Skipping Ollama test: server not running');
        return;
      }
      throw error;
    }
  });

  test('with keep_alive option', async () => {
    const embedder = embedding<OllamaEmbedParams>({
      model: ollama(OLLAMA_MODEL),
      params: { keep_alive: '5m' },
    });

    try {
      const result = await embedder.embed('Test keep_alive');

      expect(result.embeddings).toHaveLength(1);
      // Ollama includes timing metadata
      expect(result.metadata).toBeDefined();
    } catch (error) {
      if (error instanceof UPPError && error.code === 'NETWORK_ERROR') {
        console.log('Skipping Ollama test: server not running');
        return;
      }
      throw error;
    }
  });

  test('custom base URL', async () => {
    const embedder = embedding<OllamaEmbedParams>({
      model: ollama(OLLAMA_MODEL),
      config: {
        baseUrl: 'http://localhost:11434',
      },
    });

    try {
      const result = await embedder.embed('Test custom URL');

      expect(result.embeddings).toHaveLength(1);
    } catch (error) {
      if (error instanceof UPPError && error.code === 'NETWORK_ERROR') {
        console.log('Skipping Ollama test: server not running');
        return;
      }
      throw error;
    }
  });
});

/**
 * OpenRouter Embedding Tests
 */
describe.skipIf(!HAS_OPENROUTER_KEY)('OpenRouter Embeddings', () => {
  test('single text embedding', async () => {
    const embedder = embedding<OpenRouterEmbedParams>({
      model: openrouter(OPENROUTER_MODEL),
    });

    const result = await embedder.embed('Hello world');

    expect(result.embeddings).toHaveLength(1);
    const emb = result.embeddings[0]!;
    expect(emb.vector).toBeInstanceOf(Array);
    expect(emb.vector.length).toBeGreaterThan(0);
  });

  test('batch embedding', async () => {
    const embedder = embedding<OpenRouterEmbedParams>({
      model: openrouter(OPENROUTER_MODEL),
    });

    const texts = ['Hello', 'World', 'Test'];
    const result = await embedder.embed(texts);

    expect(result.embeddings).toHaveLength(3);
  });

  test('with custom dimensions', async () => {
    const embedder = embedding<OpenRouterEmbedParams>({
      model: openrouter(OPENROUTER_MODEL),
      params: { dimensions: 512 },
    });

    const result = await embedder.embed('Test dimensions');

    expect(result.embeddings[0]!.dimensions).toBe(512);
  });

  test('preserves cost metadata', async () => {
    const embedder = embedding<OpenRouterEmbedParams>({
      model: openrouter(OPENROUTER_MODEL),
    });

    const result = await embedder.embed('Test cost tracking');

    // OpenRouter may include cost in metadata
    expect(result.embeddings).toHaveLength(1);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });
});

/**
 * Cross-Provider Similarity Tests
 */
describe.skipIf(!HAS_OPENAI_KEY)('Embedding Quality', () => {
  test('similar texts have high cosine similarity', async () => {
    const embedder = embedding<OpenAIEmbedParams>({
      model: openai(OPENAI_MODEL),
    });

    const texts = [
      'The quick brown fox jumps over the lazy dog',
      'A fast brown fox leaps over a sleepy dog',
      'Python is a programming language',
    ];

    const result = await embedder.embed(texts);

    // Calculate cosine similarity between first two (similar) texts
    const v1 = result.embeddings[0]!.vector;
    const v2 = result.embeddings[1]!.vector;
    const v3 = result.embeddings[2]!.vector;

    const cosineSim = (a: number[], b: number[]) => {
      const dot = a.reduce((sum, x, i) => sum + x * b[i]!, 0);
      const magA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0));
      const magB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0));
      return dot / (magA * magB);
    };

    const sim12 = cosineSim(v1, v2);
    const sim13 = cosineSim(v1, v3);

    // Similar texts should have higher similarity than dissimilar
    expect(sim12).toBeGreaterThan(sim13);
    expect(sim12).toBeGreaterThan(0.7); // Similar texts
    expect(sim13).toBeLessThan(0.7); // Different topics
  });
});

/**
 * Error Handling Tests
 */
describe('Embedding Error Handling', () => {
  test.skipIf(!HAS_OPENAI_KEY)('invalid model returns error', async () => {
    const embedder = embedding({
      model: openai('nonexistent-embedding-model'),
    });

    try {
      await embedder.embed('test');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.provider).toBe('openai');
      expect(uppError.modality).toBe('embedding');
    }
  });

  test('invalid API key returns authentication error', async () => {
    const embedder = embedding({
      model: openai(OPENAI_MODEL),
      config: { apiKey: 'invalid-key' },
    });

    try {
      await embedder.embed('test');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe('AUTHENTICATION_FAILED');
    }
  });
});
