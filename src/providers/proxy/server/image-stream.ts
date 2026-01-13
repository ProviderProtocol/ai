/**
 * @fileoverview Image stream helpers for proxy server adapters.
 *
 * @module providers/proxy/server/image-stream
 */

import type {
  ImageStreamResult,
  ImageProviderStreamResult,
  ImageResult,
} from '../../../types/image.ts';

export type ImageStreamLike = ImageStreamResult | ImageProviderStreamResult;

/**
 * Resolve the final image result from either core or provider stream types.
 */
export function resolveImageResult(stream: ImageStreamLike): Promise<ImageResult> {
  if ('result' in stream) {
    return stream.result;
  }
  return stream.response;
}
