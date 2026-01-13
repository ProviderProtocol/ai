/**
 * @fileoverview Proxy provider types.
 *
 * Defines the configuration options and parameters for the proxy provider,
 * which transports PP requests over HTTP to a backend server.
 *
 * @module providers/proxy/types
 */

/**
 * Proxy-specific LLM parameters.
 *
 * These parameters are passed through to the backend server.
 * The server decides how to interpret them based on its own provider.
 */
export interface ProxyLLMParams {
  /** Parameters are passed through to the backend */
  [key: string]: unknown;
}

/**
 * Proxy-specific embedding parameters.
 *
 * These parameters are passed through to the backend server.
 * The server decides how to interpret them based on its own provider.
 */
export interface ProxyEmbeddingParams {
  /** Parameters are passed through to the backend */
  [key: string]: unknown;
}

/**
 * Proxy-specific image parameters.
 *
 * These parameters are passed through to the backend server.
 * The server decides how to interpret them based on its own provider.
 */
export interface ProxyImageParams {
  /** Parameters are passed through to the backend */
  [key: string]: unknown;
}

/**
 * Configuration options for creating a proxy provider.
 */
export interface ProxyProviderOptions {
  /** The endpoint URL to proxy requests to */
  endpoint: string;

  /** Default headers to include in all requests */
  headers?: Record<string, string>;

  /** Custom fetch implementation */
  fetch?: typeof fetch;

  /** Request timeout in milliseconds (default: 120000) */
  timeout?: number;
}

/**
 * Per-request options for proxy calls.
 */
export interface ProxyRequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
}
