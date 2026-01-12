/**
 * @fileoverview Unit tests for the image generation core module.
 */
import { test, expect, describe } from 'bun:test';
import { image } from '../../../src/core/image.ts';
import { createProvider } from '../../../src/core/provider.ts';
import { UPPError } from '../../../src/types/errors.ts';
import type {
  ImageHandler,
  BoundImageModel,
  ImageResponse,
  ImageCapabilities,
  ImageRequest,
  ImageEditRequest,
  ImageProviderStreamResult,
  ImageStreamEvent,
} from '../../../src/types/image.ts';
import type { Provider, ModelReference, ImageProvider } from '../../../src/types/provider.ts';
import { Image } from '../../../src/core/media/Image.ts';

/**
 * Creates a mock image handler for testing.
 */
function createMockHandler(options?: {
  mockGenerate?: (request: ImageRequest<TestParams>) => Promise<ImageResponse>;
  mockEdit?: (request: ImageEditRequest<TestParams>) => Promise<ImageResponse>;
  mockStream?: (request: ImageRequest<TestParams>) => ImageProviderStreamResult;
  capabilities?: Partial<ImageCapabilities>;
}): ImageHandler<TestParams> {
  let providerRef: ImageProvider<TestParams> | null = null;

  const defaultCapabilities: ImageCapabilities = {
    generate: true,
    streaming: options?.capabilities?.streaming ?? false,
    edit: options?.capabilities?.edit ?? false,
    maxImages: options?.capabilities?.maxImages ?? 4,
  };

  const defaultGenerate = async (): Promise<ImageResponse> => ({
    images: [{
      image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
      metadata: { revised_prompt: 'A test image' },
    }],
    usage: { imagesGenerated: 1 },
  });

  return {
    _setProvider(provider: ImageProvider<TestParams>) {
      providerRef = provider;
    },
    bind(modelId: string): BoundImageModel<TestParams> {
      const capabilities = { ...defaultCapabilities };

      const model: BoundImageModel<TestParams> = {
        modelId,
        capabilities,
        get provider() {
          return providerRef!;
        },
        async generate(request: ImageRequest<TestParams>): Promise<ImageResponse> {
          const fn = options?.mockGenerate ?? defaultGenerate;
          return fn(request);
        },
      };

      if (capabilities.edit && options?.mockEdit) {
        model.edit = async (request: ImageEditRequest<TestParams>): Promise<ImageResponse> => {
          return options.mockEdit!(request);
        };
      }

      if (capabilities.streaming && options?.mockStream) {
        model.stream = (request: ImageRequest<TestParams>): ImageProviderStreamResult => {
          return options.mockStream!(request);
        };
      }

      return model;
    },
  };
}

interface TestParams {
  size?: string;
  quality?: string;
}

/**
 * Creates a mock provider for testing.
 */
function createMockProvider(handler?: ImageHandler<TestParams>): Provider<object> {
  const imageHandler = handler ?? createMockHandler();

  return createProvider<object>({
    name: 'mock-provider',
    version: '1.0.0',
    handlers: {
      image: imageHandler,
    },
  });
}

describe('image()', () => {
  test('creates image instance with model reference', () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'dall-e-3',
      provider,
    };

    const imageInstance = image({ model: modelRef });

    expect(imageInstance.model).toBeDefined();
    expect(imageInstance.model.modelId).toBe('dall-e-3');
  });

  test('throws when provider does not support image', () => {
    const provider = createProvider<object>({
      name: 'no-image',
      version: '1.0.0',
      handlers: {},
    });

    const modelRef: ModelReference<object> = provider('some-model');

    expect(() => image({ model: modelRef })).toThrow(UPPError);
  });

  test('passes params to instance', () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({
      model: modelRef,
      params: { size: '1024x1024', quality: 'hd' },
    });

    expect(imageInstance.params).toEqual({ size: '1024x1024', quality: 'hd' });
  });

  test('passes abort signal to handler', async () => {
    let receivedSignal: AbortSignal | undefined;
    const controller = new AbortController();

    const handler = createMockHandler({
      mockGenerate: async (request) => {
        receivedSignal = request.signal;
        return {
          images: [{
            image: Image.fromBase64(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              'image/png'
            ),
          }],
          usage: { imagesGenerated: 1 },
        };
      },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    await imageInstance.generate('Test prompt', { signal: controller.signal });

    expect(receivedSignal).toBe(controller.signal);
  });

  test('exposes capabilities', () => {
    const handler = createMockHandler({
      capabilities: { streaming: true, edit: true, maxImages: 10 },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });

    expect(imageInstance.capabilities.generate).toBe(true);
    expect(imageInstance.capabilities.streaming).toBe(true);
    expect(imageInstance.capabilities.edit).toBe(true);
    expect(imageInstance.capabilities.maxImages).toBe(10);
  });
});

describe('generate()', () => {
  test('generates image from string prompt', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'dall-e-3',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    const result = await imageInstance.generate('A beautiful sunset');

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.image).toBeInstanceOf(Image);
    expect(result.usage?.imagesGenerated).toBe(1);
  });

  test('generates image from object prompt', async () => {
    const provider = createMockProvider();
    const modelRef: ModelReference<object> = {
      modelId: 'dall-e-3',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    const result = await imageInstance.generate({ prompt: 'A beautiful sunset' });

    expect(result.images).toHaveLength(1);
  });

  test('passes prompt to handler', async () => {
    let receivedPrompt: string | undefined;

    const handler = createMockHandler({
      mockGenerate: async (request) => {
        receivedPrompt = request.prompt;
        return {
          images: [{
            image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
          }],
          usage: { imagesGenerated: 1 },
        };
      },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    await imageInstance.generate('Test prompt');

    expect(receivedPrompt).toBe('Test prompt');
  });

  test('passes params to handler', async () => {
    let receivedParams: TestParams | undefined;

    const handler = createMockHandler({
      mockGenerate: async (request) => {
        receivedParams = request.params;
        return {
          images: [{
            image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
          }],
          usage: { imagesGenerated: 1 },
        };
      },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({
      model: modelRef,
      params: { size: '1024x1024', quality: 'hd' },
    });
    await imageInstance.generate('Test');

    expect(receivedParams).toEqual({ size: '1024x1024', quality: 'hd' });
  });

  test('preserves image metadata', async () => {
    const handler = createMockHandler({
      mockGenerate: async () => ({
        images: [{
          image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
          metadata: { revised_prompt: 'Enhanced prompt', seed: 12345 },
        }],
        usage: { imagesGenerated: 1 },
        metadata: { model: 'dall-e-3' },
      }),
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    const result = await imageInstance.generate('Test');

    expect(result.images[0]!.metadata).toEqual({ revised_prompt: 'Enhanced prompt', seed: 12345 });
    expect(result.metadata).toEqual({ model: 'dall-e-3' });
  });

  test('preserves usage information', async () => {
    const handler = createMockHandler({
      mockGenerate: async () => ({
        images: [{
          image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
        }],
        usage: {
          imagesGenerated: 2,
          inputTokens: 50,
          outputTokens: 1000,
          cost: 0.04,
        },
      }),
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    const result = await imageInstance.generate('Test');

    expect(result.usage).toEqual({
      imagesGenerated: 2,
      inputTokens: 50,
      outputTokens: 1000,
      cost: 0.04,
    });
  });
});

describe('stream()', () => {
  test('stream method exists when capabilities.streaming is true', () => {
    const handler = createMockHandler({
      capabilities: { streaming: true },
      mockStream: () => {
        const events: ImageStreamEvent[] = [];
        return {
          [Symbol.asyncIterator]: async function* () {
            for (const event of events) {
              yield event;
            }
          },
          response: Promise.resolve({
            images: [],
            usage: { imagesGenerated: 0 },
          }),
        };
      },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });

    expect(imageInstance.stream).toBeDefined();
    expect(typeof imageInstance.stream).toBe('function');
  });

  test('stream method does not exist when capabilities.streaming is false', () => {
    const handler = createMockHandler({
      capabilities: { streaming: false },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });

    expect(imageInstance.stream).toBeUndefined();
  });
});

describe('edit()', () => {
  test('edit method exists when capabilities.edit is true', () => {
    const handler = createMockHandler({
      capabilities: { edit: true },
      mockEdit: async () => ({
        images: [{
          image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
        }],
        usage: { imagesGenerated: 1 },
      }),
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });

    expect(imageInstance.edit).toBeDefined();
    expect(typeof imageInstance.edit).toBe('function');
  });

  test('edit method does not exist when capabilities.edit is false', () => {
    const handler = createMockHandler({
      capabilities: { edit: false },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });

    expect(imageInstance.edit).toBeUndefined();
  });

  test('edit passes image and prompt to handler', async () => {
    let receivedImage: Image | undefined;
    let receivedPrompt: string | undefined;

    const handler = createMockHandler({
      capabilities: { edit: true },
      mockEdit: async (request) => {
        receivedImage = request.image;
        receivedPrompt = request.prompt;
        return {
          images: [{
            image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
          }],
          usage: { imagesGenerated: 1 },
        };
      },
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    const inputImage = Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png');

    await imageInstance.edit!({
      image: inputImage,
      prompt: 'Add a rainbow',
    });

    expect(receivedImage).toBe(inputImage);
    expect(receivedPrompt).toBe('Add a rainbow');
  });
});

describe('multiple images', () => {
  test('handles multiple images in response', async () => {
    const handler = createMockHandler({
      mockGenerate: async () => ({
        images: [
          {
            image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
            metadata: { index: 0 },
          },
          {
            image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
            metadata: { index: 1 },
          },
          {
            image: Image.fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/png'),
            metadata: { index: 2 },
          },
        ],
        usage: { imagesGenerated: 3 },
      }),
    });
    const provider = createMockProvider(handler);
    const modelRef: ModelReference<object> = {
      modelId: 'test-model',
      provider,
    };

    const imageInstance = image({ model: modelRef });
    const result = await imageInstance.generate('Generate multiple');

    expect(result.images).toHaveLength(3);
    expect(result.images[0]!.metadata).toEqual({ index: 0 });
    expect(result.images[1]!.metadata).toEqual({ index: 1 });
    expect(result.images[2]!.metadata).toEqual({ index: 2 });
    expect(result.usage?.imagesGenerated).toBe(3);
  });
});
