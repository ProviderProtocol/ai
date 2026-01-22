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
  ImageGenerateOptions,
  ImageRequest,
} from '../types/image.ts';
import type { ProviderConfig } from '../types/provider.ts';
import type { Middleware } from '../types/middleware.ts';
import { UPPError, ErrorCode, ModalityType } from '../types/errors.ts';
import { resolveImageHandler } from './provider-handlers.ts';
import { toError } from '../utils/error.ts';
import { runHook, runErrorHook, createMiddlewareContext } from '../middleware/runner.ts';

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
  const { model: modelRef, config: explicitConfig = {}, params, middleware = [] } = options;
  const providerConfig = modelRef.providerConfig ?? {};
  const config: ProviderConfig = {
    ...providerConfig,
    ...explicitConfig,
    headers: {
      ...providerConfig.headers,
      ...explicitConfig.headers,
    },
  };

  const provider = modelRef.provider;
  const imageHandler = resolveImageHandler<TParams>(provider);
  if (!imageHandler) {
    throw new UPPError(
      `Provider '${provider.name}' does not support image modality`,
      ErrorCode.InvalidRequest,
      provider.name,
      ModalityType.Image
    );
  }

  const boundModel = imageHandler.bind(modelRef.modelId);

  const capabilities = boundModel.capabilities;

  const normalizeImageError = (error: unknown): UPPError => {
    if (error instanceof UPPError) {
      return error;
    }
    const err = toError(error);
    return new UPPError(err.message, ErrorCode.ProviderError, provider.name, ModalityType.Image, undefined, err);
  };

  const instance: ImageInstance<TParams> = {
    model: boundModel,
    params,
    capabilities,

    async generate(input: ImageInput, generateOptions?: ImageGenerateOptions): Promise<ImageResult> {
      const prompt = normalizeInput(input);

      const request: ImageRequest<TParams> = {
        prompt,
        params,
        config,
        signal: generateOptions?.signal,
      };

      const ctx = createMiddlewareContext(
        'image',
        boundModel.modelId,
        provider.name,
        false,
        request
      );

      try {
        await runHook(middleware, 'onStart', ctx);
        await runHook(middleware, 'onRequest', ctx);

        const response = await boundModel.generate(request);

        const result: ImageResult = {
          images: response.images,
          metadata: response.metadata,
          usage: response.usage,
        };

        ctx.response = response;
        ctx.endTime = Date.now();
        await runHook(middleware, 'onResponse', ctx, true);
        await runHook(middleware, 'onEnd', ctx, true);

        return result;
      } catch (error) {
        const err = toError(error);
        await runErrorHook(middleware, err, ctx);
        throw normalizeImageError(error);
      }
    },
  };

  if (capabilities.streaming && boundModel.stream) {
    const streamFn = boundModel.stream;
    instance.stream = function (input: ImageInput): ImageStreamResult {
      const prompt = normalizeInput(input);

      const abortController = new AbortController();
      const request: ImageRequest<TParams> = {
        prompt,
        params,
        config,
        signal: abortController.signal,
      };

      const ctx = createMiddlewareContext(
        'image',
        boundModel.modelId,
        provider.name,
        true,
        request
      );

      const providerStream = streamFn(request);

      const resultPromise = (async () => {
        try {
          const response = await providerStream.response;
          const result = {
            images: response.images,
            metadata: response.metadata,
            usage: response.usage,
          };

          ctx.response = response;
          ctx.endTime = Date.now();
          await runHook(middleware, 'onResponse', ctx, true);
          await runHook(middleware, 'onEnd', ctx, true);

          return result;
        } catch (error) {
          const err = toError(error);
          await runErrorHook(middleware, err, ctx);
          throw normalizeImageError(error);
        }
      })();

      async function* wrappedStream(): AsyncGenerator<ImageStreamEvent, void, unknown> {
        try {
          await runHook(middleware, 'onStart', ctx);
          await runHook(middleware, 'onRequest', ctx);

          for await (const event of providerStream) {
            yield event;
          }
        } catch (error) {
          const err = toError(error);
          await runErrorHook(middleware, err, ctx);
          throw normalizeImageError(error);
        }
      }

      return {
        [Symbol.asyncIterator]: () => wrappedStream(),
        result: resultPromise,
        abort: () => abortController.abort(),
      };
    };
  }

  if (capabilities.edit && boundModel.edit) {
    const edit = boundModel.edit;
    instance.edit = async function (input: ImageEditInput): Promise<ImageResult> {
      try {
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
      } catch (error) {
        throw normalizeImageError(error);
      }
    };
  }

  return instance;
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
