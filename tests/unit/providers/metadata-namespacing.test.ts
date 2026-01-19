import { test, expect, describe } from 'bun:test';
import { createEmbeddingHandler as createGoogleEmbedHandler } from '../../../src/providers/google/embed.ts';
import { createEmbeddingHandler as createOllamaEmbedHandler } from '../../../src/providers/ollama/embed.ts';
import type { EmbeddingProvider } from '../../../src/types/provider.ts';
import type { GoogleEmbedParams } from '../../../src/providers/google/embed.ts';
import type { OllamaEmbedParams } from '../../../src/providers/ollama/embed.ts';

function createMockProvider<TParams>(name: string): EmbeddingProvider<TParams> {
  return {
    name,
    version: '1.0.0',
  } as EmbeddingProvider<TParams>;
}

function createMockFetch(responseData: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(responseData))) as unknown as typeof fetch;
}

describe('Embedding metadata namespacing (Spec 15.4)', () => {
  describe('Google embedding metadata', () => {
    test('per-embedding metadata is namespaced under "google"', async () => {
      const mockFetch = createMockFetch({
        embeddings: [
          {
            values: [0.1, 0.2, 0.3],
            statistics: { truncated: true, tokenCount: 10 },
          },
          {
            values: [0.4, 0.5, 0.6],
            statistics: { truncated: false, tokenCount: 15 },
          },
        ],
      });

      const handler = createGoogleEmbedHandler();
      const mockProvider = createMockProvider<GoogleEmbedParams>('google');
      handler._setProvider?.(mockProvider);

      const model = handler.bind('gemini-embedding-001');
      const response = await model.embed({
        inputs: ['Hello world', 'Test input'],
        config: { apiKey: 'test-key', fetch: mockFetch },
      });

      expect(response.embeddings).toHaveLength(2);

      // Verify first embedding metadata is namespaced under "google"
      expect(response.embeddings[0]?.metadata).toEqual({
        google: { truncated: true },
      });

      // Verify second embedding metadata is namespaced under "google"
      expect(response.embeddings[1]?.metadata).toEqual({
        google: { truncated: false },
      });
    });

    test('metadata is undefined when statistics not present', async () => {
      const mockFetch = createMockFetch({
        embeddings: [
          { values: [0.1, 0.2, 0.3] },
        ],
      });

      const handler = createGoogleEmbedHandler();
      const mockProvider = createMockProvider<GoogleEmbedParams>('google');
      handler._setProvider?.(mockProvider);

      const model = handler.bind('gemini-embedding-001');
      const response = await model.embed({
        inputs: ['Hello world'],
        config: { apiKey: 'test-key', fetch: mockFetch },
      });

      expect(response.embeddings[0]?.metadata).toBeUndefined();
    });
  });

  describe('Ollama embedding metadata', () => {
    test('response metadata is namespaced under "ollama"', async () => {
      const mockFetch = createMockFetch({
        model: 'nomic-embed-text',
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
        total_duration: 1234567,
        load_duration: 456789,
        prompt_eval_count: 25,
      });

      const handler = createOllamaEmbedHandler();
      const mockProvider = createMockProvider<OllamaEmbedParams>('ollama');
      handler._setProvider?.(mockProvider);

      const model = handler.bind('nomic-embed-text');
      const response = await model.embed({
        inputs: ['Hello world', 'Test input'],
        config: { fetch: mockFetch },
      });

      expect(response.embeddings).toHaveLength(2);

      // Verify response metadata is namespaced under "ollama"
      expect(response.metadata).toEqual({
        ollama: {
          totalDuration: 1234567,
          loadDuration: 456789,
        },
      });
    });

    test('metadata handles missing optional fields', async () => {
      const mockFetch = createMockFetch({
        model: 'nomic-embed-text',
        embeddings: [[0.1, 0.2, 0.3]],
      });

      const handler = createOllamaEmbedHandler();
      const mockProvider = createMockProvider<OllamaEmbedParams>('ollama');
      handler._setProvider?.(mockProvider);

      const model = handler.bind('nomic-embed-text');
      const response = await model.embed({
        inputs: ['Hello world'],
        config: { fetch: mockFetch },
      });

      // Metadata should still have the ollama namespace, even with undefined values
      expect(response.metadata).toEqual({
        ollama: {
          totalDuration: undefined,
          loadDuration: undefined,
        },
      });
    });
  });

  describe('Metadata round-trip preservation', () => {
    test('Google metadata structure is preserved through response', async () => {
      const mockFetch = createMockFetch({
        embeddings: [{
          values: [0.1, 0.2, 0.3],
          statistics: { truncated: true, tokenCount: 42 },
        }],
      });

      const handler = createGoogleEmbedHandler();
      const mockProvider = createMockProvider<GoogleEmbedParams>('google');
      handler._setProvider?.(mockProvider);

      const model = handler.bind('gemini-embedding-001');
      const response = await model.embed({
        inputs: ['Test'],
        config: { apiKey: 'test-key', fetch: mockFetch },
      });

      // Verify the full structure
      const embedding = response.embeddings[0]!;
      expect(embedding.vector).toEqual([0.1, 0.2, 0.3]);
      expect(embedding.index).toBe(0);
      expect(embedding.tokens).toBe(42);
      expect(embedding.metadata).toEqual({ google: { truncated: true } });

      // Verify usage is present
      expect(response.usage.totalTokens).toBe(42);
    });

    test('Ollama metadata structure is preserved through response', async () => {
      const mockFetch = createMockFetch({
        model: 'nomic-embed-text',
        embeddings: [[0.5, 0.6, 0.7]],
        total_duration: 999999,
        load_duration: 111111,
        prompt_eval_count: 100,
      });

      const handler = createOllamaEmbedHandler();
      const mockProvider = createMockProvider<OllamaEmbedParams>('ollama');
      handler._setProvider?.(mockProvider);

      const model = handler.bind('nomic-embed-text');
      const response = await model.embed({
        inputs: ['Test'],
        config: { fetch: mockFetch },
      });

      // Verify the full structure
      const embedding = response.embeddings[0]!;
      expect(embedding.vector).toEqual([0.5, 0.6, 0.7]);
      expect(embedding.index).toBe(0);

      // Verify usage is present
      expect(response.usage.totalTokens).toBe(100);

      // Verify metadata is properly namespaced
      expect(response.metadata).toEqual({
        ollama: {
          totalDuration: 999999,
          loadDuration: 111111,
        },
      });
    });
  });
});
