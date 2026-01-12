/**
 * @fileoverview Unit tests for the embedding core module.
 */
import { test, expect, describe } from 'bun:test';
import { embedding } from '../../../src/core/embedding.ts';
import { createProvider } from '../../../src/core/provider.ts';
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

  return createProvider<object>({
    name: 'mock-provider',
    version: '1.0.0',
    handlers: {
      embedding: embeddingHandler,
    },
  });
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
    const provider = createProvider<object>({
      name: 'no-embedding',
      version: '1.0.0',
      handlers: {},
    });

    const modelRef: ModelReference<object> = provider('some-model');

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

  test('throws on invalid base64 vectors', async () => {
    const mockEmbed = async (): Promise<EmbeddingResponse> => ({
      embeddings: [{ vector: 'not_base64', index: 0 }],
      usage: { totalTokens: 1 },
    });

    const handler = createMockHandler(mockEmbed);
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });

    try {
      await embedder.embed('test');
      throw new Error('Expected embed to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('INVALID_RESPONSE');
        expect(error.provider).toBe('mock-provider');
      }
    }
  });
});

describe('embed() - chunked abort', () => {
  test('aborting chunked stream rejects result', async () => {
    const handler = createMockHandler(async (inputs: unknown[]) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        embeddings: (inputs as string[]).map((_, index) => ({
          vector: [0.1, 0.2, 0.3],
          index,
        })),
        usage: { totalTokens: inputs.length },
      };
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const stream = embedder.embed(['one', 'two', 'three'], { chunked: true });

    stream.abort();

    await expect(stream.result).rejects.toBeInstanceOf(UPPError);
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

describe('embed() - cancellation', () => {
  test('respects abort signal for single embed', async () => {
    type EmptyParams = Record<string, never>;
    let providerRef: EmbeddingProvider<EmptyParams> | null = null;
    let capturedSignal: AbortSignal | undefined;

    const handler: EmbeddingHandler<EmptyParams> = {
      supportedInputs: ['text'],
      _setProvider(provider: EmbeddingProvider<EmptyParams>) {
        providerRef = provider;
      },
      bind(modelId: string): BoundEmbeddingModel<EmptyParams> {
        return {
          modelId,
          maxBatchSize: 100,
          maxInputLength: 8191,
          dimensions: 3,
          get provider() {
            return providerRef!;
          },
          async embed(request) {
            capturedSignal = request.signal;
            return new Promise<EmbeddingResponse>((_resolve, reject) => {
              if (request.signal?.aborted) {
                reject(
                  new UPPError(
                    'Embedding cancelled',
                    'CANCELLED',
                    providerRef?.name ?? 'mock-provider',
                    'embedding'
                  )
                );
                return;
              }

              request.signal?.addEventListener(
                'abort',
                () => {
                  reject(
                    new UPPError(
                      'Embedding cancelled',
                      'CANCELLED',
                      providerRef?.name ?? 'mock-provider',
                      'embedding'
                    )
                  );
                },
                { once: true }
              );
            });
          },
        };
      },
    };

    const provider = createProvider<EmptyParams>({
      name: 'mock-provider',
      version: '1.0.0',
      handlers: { embedding: handler },
    });

    const modelRef: ModelReference<EmptyParams> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const controller = new AbortController();
    const promise = embedder.embed('cancel me', { signal: controller.signal });

    expect(capturedSignal).toBe(controller.signal);

    controller.abort();

    try {
      await promise;
      throw new Error('Expected embed to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('CANCELLED');
        expect(error.modality).toBe('embedding');
      }
    }
  });

  test('stream abort cancels chunked embedding', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const embedder = embedding({ model: modelRef });
    const stream = embedder.embed(['a', 'b', 'c'], { chunked: true, batchSize: 1 });
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(first.value.completed).toBe(1);
    }

    stream.abort();

    try {
      await iterator.next();
      throw new Error('Expected stream to throw after abort');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('CANCELLED');
        expect(error.modality).toBe('embedding');
      }
    }

    await expect(stream.result).rejects.toBeInstanceOf(UPPError);
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
