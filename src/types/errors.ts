/**
 * @fileoverview Error types for the Unified Provider Protocol.
 *
 * Provides normalized error codes and a unified error class for handling
 * errors across different AI providers in a consistent manner.
 *
 * @module types/errors
 */

/**
 * Normalized error codes for cross-provider error handling.
 *
 * These codes provide a consistent way to identify and handle errors
 * regardless of which AI provider generated them.
 *
 * @example
 * ```typescript
 * try {
 *   await llm.generate('Hello');
 * } catch (error) {
 *   if (error instanceof UPPError) {
 *     switch (error.code) {
 *       case 'RATE_LIMITED':
 *         await delay(error.retryAfter);
 *         break;
 *       case 'AUTHENTICATION_FAILED':
 *         throw new Error('Invalid API key');
 *     }
 *   }
 * }
 * ```
 */
export type ErrorCode =
  /** API key is invalid or expired */
  | 'AUTHENTICATION_FAILED'
  /** Rate limit exceeded, retry after delay */
  | 'RATE_LIMITED'
  /** Input exceeds model's context window */
  | 'CONTEXT_LENGTH_EXCEEDED'
  /** Requested model does not exist */
  | 'MODEL_NOT_FOUND'
  /** Request parameters are malformed */
  | 'INVALID_REQUEST'
  /** Provider returned an unexpected response format */
  | 'INVALID_RESPONSE'
  /** Content was blocked by safety filters */
  | 'CONTENT_FILTERED'
  /** Account quota or credits exhausted */
  | 'QUOTA_EXCEEDED'
  /** Provider-specific error not covered by other codes */
  | 'PROVIDER_ERROR'
  /** Network connectivity issue */
  | 'NETWORK_ERROR'
  /** Request exceeded timeout limit */
  | 'TIMEOUT'
  /** Request was cancelled via AbortSignal */
  | 'CANCELLED';

/**
 * Modality types supported by UPP.
 *
 * Each modality represents a different type of AI capability that
 * can be provided by a UPP-compatible provider.
 */
export type Modality =
  /** Large language model for text generation */
  | 'llm'
  /** Text/image embedding model */
  | 'embedding'
  /** Image generation model */
  | 'image'
  /** Audio processing/generation model */
  | 'audio'
  /** Video processing/generation model */
  | 'video';

/**
 * Unified Provider Protocol Error.
 *
 * All provider-specific errors are normalized to this type, providing
 * a consistent interface for error handling across different AI providers.
 *
 * @example
 * ```typescript
 * throw new UPPError(
 *   'API key is invalid',
 *   'AUTHENTICATION_FAILED',
 *   'openai',
 *   'llm',
 *   401
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Wrapping a provider error
 * try {
 *   await openai.chat.completions.create({ ... });
 * } catch (err) {
 *   throw new UPPError(
 *     'OpenAI request failed',
 *     'PROVIDER_ERROR',
 *     'openai',
 *     'llm',
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
