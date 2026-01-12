/**
 * @fileoverview Error types for the Unified Provider Protocol.
 *
 * Provides normalized error codes and a unified error class for handling
 * errors across different AI providers in a consistent manner.
 *
 * @module types/errors
 */

/**
 * Error code constants for cross-provider error handling.
 *
 * Use these constants instead of raw strings for type-safe error handling:
 *
 * @example
 * ```typescript
 * import { ErrorCode } from 'upp';
 *
 * try {
 *   await llm.generate('Hello');
 * } catch (error) {
 *   if (error instanceof UPPError) {
 *     switch (error.code) {
 *       case ErrorCode.RateLimited:
 *         await delay(error.retryAfter);
 *         break;
 *       case ErrorCode.AuthenticationFailed:
 *         throw new Error('Invalid API key');
 *     }
 *   }
 * }
 * ```
 */
export const ErrorCode = {
  /** API key is invalid or expired */
  AuthenticationFailed: 'AUTHENTICATION_FAILED',
  /** Rate limit exceeded, retry after delay */
  RateLimited: 'RATE_LIMITED',
  /** Input exceeds model's context window */
  ContextLengthExceeded: 'CONTEXT_LENGTH_EXCEEDED',
  /** Requested model does not exist */
  ModelNotFound: 'MODEL_NOT_FOUND',
  /** Request parameters are malformed */
  InvalidRequest: 'INVALID_REQUEST',
  /** Provider returned an unexpected response format */
  InvalidResponse: 'INVALID_RESPONSE',
  /** Content was blocked by safety filters */
  ContentFiltered: 'CONTENT_FILTERED',
  /** Account quota or credits exhausted */
  QuotaExceeded: 'QUOTA_EXCEEDED',
  /** Provider-specific error not covered by other codes */
  ProviderError: 'PROVIDER_ERROR',
  /** Network connectivity issue */
  NetworkError: 'NETWORK_ERROR',
  /** Request exceeded timeout limit */
  Timeout: 'TIMEOUT',
  /** Request was cancelled via AbortSignal */
  Cancelled: 'CANCELLED',
} as const;

/**
 * Error code discriminator union.
 *
 * This type is derived from {@link ErrorCode} constants. Use `ErrorCode.RateLimited`
 * for constants or `type MyCode = ErrorCode` for type annotations.
 */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Modality type constants.
 *
 * Use these constants for type-safe modality handling:
 *
 * @example
 * ```typescript
 * import { ModalityType } from 'upp';
 *
 * if (provider.modality === ModalityType.LLM) {
 *   // Handle LLM provider
 * }
 * ```
 */
export const ModalityType = {
  /** Large language model for text generation */
  LLM: 'llm',
  /** Text/image embedding model */
  Embedding: 'embedding',
  /** Image generation model */
  Image: 'image',
  /** Audio processing/generation model */
  Audio: 'audio',
  /** Video processing/generation model */
  Video: 'video',
} as const;

/**
 * Modality type discriminator union.
 *
 * This type is derived from {@link ModalityType} constants. The name `Modality`
 * is kept for backward compatibility; `ModalityType` works as both the const
 * object and this type.
 */
export type Modality = (typeof ModalityType)[keyof typeof ModalityType];

/**
 * Type alias for Modality, allowing `ModalityType` to work as both const and type.
 */
export type ModalityType = Modality;

/**
 * Unified Provider Protocol Error.
 *
 * All provider-specific errors are normalized to this type, providing
 * a consistent interface for error handling across different AI providers.
 *
 * @example
 * ```typescript
 * import { ErrorCode, ModalityType } from 'upp';
 *
 * throw new UPPError(
 *   'API key is invalid',
 *   ErrorCode.AuthenticationFailed,
 *   'openai',
 *   ModalityType.LLM,
 *   401
 * );
 * ```
 *
 * @example
 * ```typescript
 * import { ErrorCode, ModalityType } from 'upp';
 *
 * // Wrapping a provider error
 * try {
 *   await openai.chat.completions.create({ ... });
 * } catch (err) {
 *   throw new UPPError(
 *     'OpenAI request failed',
 *     ErrorCode.ProviderError,
 *     'openai',
 *     ModalityType.LLM,
 *     err.status,
 *     err
 *   );
 * }
 * ```
 */
export class UPPError extends Error {
  /** Normalized error code for programmatic handling */
  readonly code: ErrorCode;

  /** Name of the provider that generated the error */
  readonly provider: string;

  /** The modality that was being used when the error occurred */
  readonly modality: Modality;

  /** HTTP status code from the provider's response, if available */
  readonly statusCode?: number;

  /** The original error that caused this UPPError, if wrapping another error */
  override readonly cause?: Error;

  /** Error class name, always 'UPPError' */
  override readonly name = 'UPPError';

  /**
   * Creates a new UPPError instance.
   *
   * @param message - Human-readable error description
   * @param code - Normalized error code for programmatic handling
   * @param provider - Name of the provider that generated the error
   * @param modality - The modality that was being used
   * @param statusCode - HTTP status code from the provider's response
   * @param cause - The original error being wrapped
   */
  constructor(
    message: string,
    code: ErrorCode,
    provider: string,
    modality: Modality,
    statusCode?: number,
    cause?: Error
  ) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.modality = modality;
    this.statusCode = statusCode;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UPPError);
    }
  }

  /**
   * Creates a string representation of the error.
   *
   * @returns Formatted error string including code, message, provider, and modality
   */
  override toString(): string {
    let str = `UPPError [${this.code}]: ${this.message}`;
    str += ` (provider: ${this.provider}, modality: ${this.modality}`;
    if (this.statusCode) {
      str += `, status: ${this.statusCode}`;
    }
    str += ')';
    return str;
  }

  /**
   * Converts the error to a JSON-serializable object.
   *
   * @returns Plain object representation suitable for logging or transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      provider: this.provider,
      modality: this.modality,
      statusCode: this.statusCode,
      cause: this.cause?.message,
    };
  }
}
