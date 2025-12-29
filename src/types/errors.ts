/**
 * UPP Error Codes
 * Normalized error codes for cross-provider error handling
 */
export type ErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'CONTENT_FILTERED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED';

/**
 * Modality types supported by UPP
 */
export type Modality = 'llm' | 'embedding' | 'image' | 'audio' | 'video';

/**
 * Unified Provider Protocol Error
 * All provider errors are normalized to this type
 */
export class UPPError extends Error {
  readonly code: ErrorCode;
  readonly provider: string;
  readonly modality: Modality;
  readonly statusCode?: number;
  override readonly cause?: Error;

  override readonly name = 'UPPError';

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

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UPPError);
    }
  }

  /**
   * Create a string representation of the error
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
   * Convert to JSON for serialization
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
