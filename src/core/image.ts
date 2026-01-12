/**
 * @fileoverview Image generation instance factory for the Universal Provider Protocol.
 *
 * This module provides the core functionality for creating image generation instances,
 * including support for text-to-image generation, streaming, and image editing.
 *
 * @module core/image
 */

import type {
  ImageOptions,
  ImageInstance,
  ImageInput,
  ImageEditInput,
  ImageResult,
  ImageStreamResult,
  ImageStreamEvent,
  ImageCapabilities,
  BoundImageModel,
  ImageGenerateOptions,
} from '../types/image.ts';
import { UPPError } from '../types/errors.ts';
import { resolveImageHandler } from './provider-handlers.ts';

/**
 * Creates an image generation instance configured with the specified options.
 *
 * This is the primary factory function for creating image generation instances.
 * It validates provider capabilities, binds the model, and returns an instance
 * with `generate`, `stream`, and `edit` methods.
 *
 * @typeParam TParams - Provider-specific parameter type for model configuration
 * @param options - Configuration options for the image instance
 * @returns A configured image instance ready for generation
 * @throws {UPPError} When the provider does not support the image modality
 *
 * @example
 * ```typescript
 * import { image } from 'upp';
 * import { openai } from 'upp/providers/openai';
 *
 * const dalle = image({
 *   model: openai('dall-e-3'),
 *   params: { size: '1024x1024', quality: 'hd' }
 * });
 *
 * const result = await dalle.generate('A sunset over mountains');
 * console.log(result.images.length);
 * ```
 */
export function image<TParams = unknown>(
  options: ImageOptions<TParams>
): ImageInstance<TParams> {
  const { model: modelRef, config = {}, params } = options;

  const provider = modelRef.provider;
  const imageHandler = resolveImageHandler<TParams>(provider);
  if (!imageHandler) {
    throw new UPPError(
      `Provider '${provider.name}' does not support image modality`,
      'INVALID_REQUEST',
      provider.name,
      'image'
    );
  }

  const boundModel = imageHandler.bind(modelRef.modelId);

  const capabilities = boundModel.capabilities;

  const instance: ImageInstance<TParams> = {
    model: boundModel,
    params,
    capabilities,

    async generate(input: ImageInput, options?: ImageGenerateOptions): Promise<ImageResult> {
      const prompt = normalizeInput(input);

      const response = await boundModel.generate({
        prompt,
        params,
        config,
        signal: options?.signal,
      });

      return {
        images: response.images,
        metadata: response.metadata,
        usage: response.usage,
      };
    },
  };

  if (capabilities.streaming && boundModel.stream) {
    const stream = boundModel.stream;
    instance.stream = function (input: ImageInput): ImageStreamResult {
      const prompt = normalizeInput(input);

      const abortController = new AbortController();
      const providerStream = stream({
        prompt,
        params,
        config,
        signal: abortController.signal,
      });

      const resultPromise = providerStream.response.then((response) => ({
        images: response.images,
        metadata: response.metadata,
        usage: response.usage,
      }));

      return {
        [Symbol.asyncIterator]: () => providerStream[Symbol.asyncIterator](),
        result: resultPromise,
        abort: () => abortController.abort(),
      };
    };
  }

  if (capabilities.edit && boundModel.edit) {
    const edit = boundModel.edit;
    instance.edit = async function (input: ImageEditInput): Promise<ImageResult> {
      const response = await edit({
        image: input.image,
        mask: input.mask,
        prompt: input.prompt,
        params,
        config,
      });

      return {
        images: response.images,
        metadata: response.metadata,
        usage: response.usage,
      };
    };
  }

  return instance;
}

/**
 * Normalizes ImageInput to a prompt string.
 *
 * @param input - Either a string prompt or object with prompt field
 * @returns The prompt string
 */
function normalizeInput(input: ImageInput): string {
  if (typeof input === 'string') {
    return input;
  }
  return input.prompt;
}

/**
 * Creates an ImageStreamResult from an async generator.
 *
 * @param generator - The async generator of stream events
 * @param resultPromise - Promise resolving to final result
 * @param abortController - Controller for aborting the operation
 * @returns An ImageStreamResult
 */
export function createImageStreamResult(
  generator: AsyncGenerator<ImageStreamEvent, void, unknown>,
  resultPromise: Promise<ImageResult>,
  abortController: AbortController
): ImageStreamResult {
  return {
    [Symbol.asyncIterator]: () => generator,
    result: resultPromise,
    abort: () => abortController.abort(),
  };
}
