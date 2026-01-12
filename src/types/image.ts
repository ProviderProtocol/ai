/**
 * @fileoverview Image generation types for the Universal Provider Protocol.
 *
 * Defines the interfaces for configuring and executing image generation operations,
 * including options, instances, requests, responses, streaming, and capabilities.
 *
 * @module types/image
 */

import type { ProviderConfig, ImageProvider, ProviderIdentity } from './provider.ts';
import type { Image } from '../core/media/Image.ts';

/**
 * Structural type for image model input.
 * Uses structural typing to avoid generic variance issues with Provider generics.
 *
 * @remarks
 * This type mirrors {@link ModelReference} while keeping provider options
 * structurally compatible across providers.
 *
 * @see ModelReference
 */
export interface ImageModelInput {
  readonly modelId: string;
  readonly provider: ProviderIdentity;
  /** Optional provider configuration merged into requests */
  readonly providerConfig?: Partial<ProviderConfig>;
}

/**
 * Options for creating an image instance with the image() function.
 *
 * @typeParam TParams - Provider-specific parameter type
 *
 * @example
 * ```typescript
 * const options: ImageOptions<OpenAIImageParams> = {
 *   model: openai('dall-e-3'),
 *   config: { apiKey: process.env.OPENAI_API_KEY },
 *   params: { size: '1024x1024', quality: 'hd' }
 * };
 * ```
 */
export interface ImageOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: ImageModelInput;

  /** Provider infrastructure configuration */
  config?: ProviderConfig;

  /** Provider-specific parameters (passed through unchanged) */
  params?: TParams;
}

/**
 * Options for image generation.
 */
export interface ImageGenerateOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Input type for generate() - either a string prompt or object with prompt.
 */
export type ImageInput = string | { prompt: string };

/**
 * Input for edit() operations.
 */
export interface ImageEditInput {
  /** Base image to edit */
  image: Image;

  /** Mask indicating edit region (interpretation varies by provider) */
  mask?: Image;

  /** Edit instruction prompt */
  prompt: string;
}

/**
 * A single generated image with optional metadata.
 */
export interface GeneratedImage {
  /** The generated image */
  image: Image;

  /** Provider-specific per-image metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Usage statistics for image generation.
 * Fields are optional because providers report usage differently.
 */
export interface ImageUsage {
  /** Number of images generated */
  imagesGenerated?: number;

  /** Input tokens consumed (token-based pricing) */
  inputTokens?: number;

  /** Output tokens consumed (token-based pricing) */
  outputTokens?: number;

  /** Provider-reported cost (credits, dollars, etc.) */
  cost?: number;
}

/**
 * Result from generate() or edit() calls.
 */
export interface ImageResult {
  /** Generated images */
  images: GeneratedImage[];

  /** Provider-specific response metadata */
  metadata?: Record<string, unknown>;

  /** Usage/billing information */
  usage?: ImageUsage;
}

/**
 * Stream events for image generation.
 */
export type ImageStreamEvent =
  | { type: 'preview'; image: Image; index: number; metadata?: Record<string, unknown> }
  | { type: 'complete'; image: GeneratedImage; index: number };

/**
 * Async iterable stream with final result accessor.
 * Returned when stream() is called.
 */
export interface ImageStreamResult extends AsyncIterable<ImageStreamEvent> {
  /** Promise resolving to complete result after streaming */
  readonly result: Promise<ImageResult>;

  /** Abort the generation */
  abort(): void;
}

/**
 * Image generation capabilities.
 */
export interface ImageCapabilities {
  /** Supports text-to-image generation */
  generate: boolean;

  /** Supports streaming with partial previews */
  streaming: boolean;

  /** Supports image editing/inpainting */
  edit: boolean;

  /** Maximum images per request (if known) */
  maxImages?: number;
}

/**
 * Image instance returned by the image() function.
 *
 * @typeParam TParams - Provider-specific parameter type
 *
 * @example
 * ```typescript
 * const dalle = image({ model: openai('dall-e-3') });
 *
 * // Simple generation
 * const result = await dalle.generate('A sunset over mountains');
 *
 * // Streaming (if supported)
 * if (dalle.capabilities.streaming && dalle.stream) {
 *   const stream = dalle.stream('A cyberpunk cityscape');
 *   for await (const event of stream) {
 *     // Handle preview/complete events
 *   }
 * }
 * ```
 */
export interface ImageInstance<TParams = unknown> {
  /**
   * Generate images from a text prompt.
   *
   * @param input - The prompt string or object with prompt
   * @param options - Optional generation options
   * @returns Promise resolving to the generated images
   */
  generate(input: ImageInput, options?: ImageGenerateOptions): Promise<ImageResult>;

  /**
   * Generate with streaming progress (if supported).
   * Only available when capabilities.streaming is true.
   *
   * @param input - The prompt string or object with prompt
   * @returns ImageStreamResult with events and final result
   */
  stream?(input: ImageInput): ImageStreamResult;

  /**
   * Edit an existing image (if supported).
   * Only available when capabilities.edit is true.
   *
   * @param input - Edit input with image, optional mask, and prompt
   * @returns Promise resolving to the edited images
   */
  edit?(input: ImageEditInput): Promise<ImageResult>;

  /** The bound image model */
  readonly model: BoundImageModel<TParams>;

  /** Current parameters */
  readonly params: TParams | undefined;

  /** Model capabilities */
  readonly capabilities: ImageCapabilities;
}

/**
 * Request passed from image() core to providers for generation.
 * @internal
 */
export interface ImageRequest<TParams = unknown> {
  /** Generation prompt */
  prompt: string;

  /** Provider-specific parameters (passed through unchanged) */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Request passed to providers for edit operations.
 * @internal
 */
export interface ImageEditRequest<TParams = unknown> {
  /** Base image to edit */
  image: Image;

  /** Edit mask */
  mask?: Image;

  /** Edit instruction prompt */
  prompt: string;

  /** Provider-specific parameters */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Response from provider's generate or edit method.
 * @internal
 */
export interface ImageResponse {
  /** Generated images */
  images: GeneratedImage[];

  /** Provider-specific response metadata */
  metadata?: Record<string, unknown>;

  /** Usage information */
  usage?: ImageUsage;
}

/**
 * Raw provider stream result.
 * An async iterable of ImageStreamEvent with a response promise.
 * @internal
 */
export interface ImageProviderStreamResult extends AsyncIterable<ImageStreamEvent> {
  /** Promise resolving to the complete response */
  readonly response: Promise<ImageResponse>;
}

/**
 * Bound image model - full definition.
 *
 * Represents an image model bound to a specific provider and model ID,
 * ready to execute generation requests.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface BoundImageModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Reference to the parent provider */
  readonly provider: ImageProvider<TParams>;

  /** Model capabilities */
  readonly capabilities: ImageCapabilities;

  /**
   * Generate images from a prompt.
   *
   * @param request - The generation request
   * @returns Promise resolving to the response
   */
  generate(request: ImageRequest<TParams>): Promise<ImageResponse>;

  /**
   * Stream image generation (optional).
   *
   * @param request - The generation request
   * @returns Stream result with events and final response
   */
  stream?(request: ImageRequest<TParams>): ImageProviderStreamResult;

  /**
   * Edit an image (optional).
   *
   * @param request - The edit request
   * @returns Promise resolving to the response
   */
  edit?(request: ImageEditRequest<TParams>): Promise<ImageResponse>;
}

/**
 * Image Handler interface for providers.
 *
 * Implemented by providers to enable image generation capabilities.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface ImageHandler<TParams = unknown> {
  /**
   * Binds a model ID to create an executable image model.
   *
   * @param modelId - The model identifier to bind
   * @returns A bound image model ready for generation
   */
  bind(modelId: string): BoundImageModel<TParams>;

  /**
   * Sets the parent provider reference.
   * Called by createProvider() after the provider is constructed.
   *
   * @param provider - The parent provider
   * @internal
   */
  _setProvider?(provider: ImageProvider<TParams>): void;
}
