/**
 * @fileoverview Unit tests for the embedding core module.
 */
import { test, expect, describe, mock } from 'bun:test';
import { embedding } from '../../../src/core/embedding.ts';
import { UPPError } from '../../../src/types/errors.ts';
import type {
  EmbeddingHandler,
  EmbeddingProvider,
  BoundEmbeddingModel,
  EmbeddingResponse,
  Provider,
  ModelReference,
} from '../../../src/types/provider.ts';

/**
 * Creates a mock embedding handler for testing.
 */
function createMockHandler(mockEmbed?: (inputs: unknown[]) => Promise<EmbeddingResponse>): EmbeddingHandler<{ dimensions?: number }> {
  let providerRef: EmbeddingProvider<{ dimensions?: number }> | null = null;

  const defaultEmbed = async (inputs: unknown[]): Promise<EmbeddingResponse> => ({
    embeddings: (inputs as string[]).map((_, index) => ({
      vector: [0.1, 0.2, 0.3],
      index,
    })),
    usage: { totalTokens: inputs.length * 5 },
  });

  return {
    supportedInputs: ['text'],
    _setProvider(provider: EmbeddingProvider<{ dimensions?: number }>) {
      providerRef = provider;
    },
    bind(modelId: string): BoundEmbeddingModel<{ dimensions?: number }> {
      return {
        modelId,
        maxBatchSize: 100,
        maxInputLength: 8191,
        dimensions: 3,
        get provider() {
          return providerRef!;
        },
        async embed(request) {
          const fn = mockEmbed ?? defaultEmbed;
          return fn(request.inputs);
        },
      };
    },
  };
}

/**
 * Creates a mock provider for testing.
 */
function createMockProvider(handler?: EmbeddingHandler<{ dimensions?: number }>): Provider<object> {
  const embeddingHandler = handler ?? createMockHandler();

  const provider = {
    name: 'mock-provider',
    version: '1.0.0',
    modalities: {
      embedding: embeddingHandler,
    },
  } as unknown as Provider<object>;

  embeddingHandler._setProvider?.(provider as unknown as EmbeddingProvider<{ dimensions?: number }>);

  return provider;
}

describe('embedding()', () => {
  test('creates embedding instance with model reference', () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'text-embedding-3-small',
      provider,
    };

    const embedder = embedding({ model: modelRef });

    expect(embedder.model).toBeDefined();
    expect(embedder.model.modelId).toBe('text-embedding-3-small');
  });

  test('throws when provider does not support embedding', () => {
    const provider = {
      name: 'no-embedding',
      version: '1.0.0',
      modalities: {},
    } as unknown as Provider<object>;

    const modelRef: ModelReference<object> = {
      modelId: 'some-model',
      provider,
    };

    expect(() => embedding({ model: modelRef })).toThrow(UPPError);
  });

  test('passes params to instance', () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({
      model: modelRef,
      params: { dimensions: 256 },
    });

    expect(embedder.params).toEqual({ dimensions: 256 });
  });
});

describe('embed() - single input', () => {
  test('embeds single string input', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed('Hello world');

    expect(result.embeddings).toHaveLength(1);
    const emb0 = result.embeddings[0]!;
    expect(emb0.vector).toEqual([0.1, 0.2, 0.3]);
    expect(emb0.index).toBe(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  test('embeds text input object', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed({ type: 'text', text: 'Hello world' });

    expect(result.embeddings).toHaveLength(1);
  });
});

describe('embed() - batch input', () => {
  test('embeds array of strings', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed(['Hello', 'World', 'Test']);

    expect(result.embeddings).toHaveLength(3);
    expect(result.embeddings[0]!.index).toBe(0);
    expect(result.embeddings[1]!.index).toBe(1);
    expect(result.embeddings[2]!.index).toBe(2);
  });

  test('embeds mixed input types', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed([
      'string input',
      { type: 'text', text: 'object input' },
    ]);

    expect(result.embeddings).toHaveLength(2);
  });
});

describe('embed() - base64 normalization', () => {
  test('normalizes base64 vectors to floats', async () => {
    // Create a mock that returns base64-encoded floats
    const floats = [0.5, 0.25, 0.125];
    const buffer = new Float32Array(floats).buffer;
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    const mockEmbed = async (): Promise<EmbeddingResponse> => ({
      embeddings: [{ vector: base64, index: 0 }],
      usage: { totalTokens: 5 },
    });

    const handler = createMockHandler(mockEmbed);
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed('test');

    // Vector should be normalized to floats
    const vec = result.embeddings[0]!.vector;
    expect(Array.isArray(vec)).toBe(true);
    // Check approximately equal due to float precision
    expect(vec[0]).toBeCloseTo(0.5, 5);
    expect(vec[1]).toBeCloseTo(0.25, 5);
    expect(vec[2]).toBeCloseTo(0.125, 5);
  });
});

describe('embed() - chunked streaming', () => {
  test('returns stream with chunked option', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const inputs = Array.from({ length: 5 }, (_, i) => `doc${i}`);
    const stream = embedder.embed(inputs, { chunked: true });

    // Should be iterable
    expect(Symbol.asyncIterator in stream).toBe(true);
    expect('result' in stream).toBe(true);
    expect('abort' in stream).toBe(true);
  });

  test('stream yields progress updates', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const inputs = Array.from({ length: 5 }, (_, i) => `doc${i}`);
    const stream = embedder.embed(inputs, { chunked: true, batchSize: 2 });

    const progresses: { completed: number; total: number; percent: number }[] = [];
    for await (const progress of stream) {
      progresses.push({
        completed: progress.completed,
        total: progress.total,
        percent: progress.percent,
      });
    }

    // Should have multiple progress updates
    expect(progresses.length).toBeGreaterThan(0);
    // Last progress should be complete
    const last = progresses[progresses.length - 1]!;
    expect(last.completed).toBe(5);
    expect(last.total).toBe(5);
    expect(last.percent).toBe(100);
  });

  test('stream result promise resolves to full result', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const inputs = ['doc1', 'doc2', 'doc3'];
    const stream = embedder.embed(inputs, { chunked: true });

    // Consume stream
    for await (const _ of stream) {
      // Just iterate
    }

    const result = await stream.result;
    expect(result.embeddings).toHaveLength(3);
  });
});

describe('embed() - metadata preservation', () => {
  test('preserves per-embedding metadata', async () => {
    const mockEmbed = async (): Promise<EmbeddingResponse> => ({
      embeddings: [
        {
          vector: [0.1, 0.2],
          index: 0,
          tokens: 10,
          metadata: { truncated: false },
        },
      ],
      usage: { totalTokens: 10 },
    });

    const handler = createMockHandler(mockEmbed);
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed('test');

    expect(result.embeddings[0]!.tokens).toBe(10);
    expect(result.embeddings[0]!.metadata).toEqual({ truncated: false });
  });

  test('preserves response-level metadata', async () => {
    const mockEmbed = async (): Promise<EmbeddingResponse> => ({
      embeddings: [{ vector: [0.1], index: 0 }],
      usage: { totalTokens: 5 },
      metadata: { model: 'test-model', cost: 0.001 },
    });

    const handler = createMockHandler(mockEmbed);
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const result = await embedder.embed('test');

    expect(result.metadata).toEqual({ model: 'test-model', cost: 0.001 });
  });
});
