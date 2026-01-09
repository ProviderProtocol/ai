/**
 * @fileoverview Proxy Provider Factory
 *
 * Creates a provider that transports PP requests over HTTP to a backend server.
 * The proxy acts as a pure transport layer - PP types go in, PP types come out.
 *
 * @example
 * ```typescript
 * import { proxy } from '@providerprotocol/ai/proxy';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create a proxy provider pointing to your backend
 * const backend = proxy({ endpoint: '/api/ai' });
 *
 * // Use it like any other provider
 * const instance = llm({
 *   model: backend('default'),
 *   system: 'You are a helpful assistant.',
 * });
 *
 * const turn = await instance.generate('Hello!');
 * ```
 *
 * @module providers/proxy
 */

import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
} from '../../types/provider.ts';
import { createLLMHandler } from './llm.ts';
import type { ProxyLLMParams, ProxyProviderOptions, ProxyRequestOptions } from './types.ts';

/**
 * Proxy provider interface.
 *
 * The provider is callable as a function to create model references.
 * The modelId is passed through to the backend - the server decides
 * which actual model to use.
 */
export interface ProxyProvider extends Provider<ProxyRequestOptions> {
  /**
   * Creates a model reference for the proxy.
   *
   * @param modelId - Model identifier passed to the backend
   * @param options - Optional per-request configuration
   * @returns A model reference that can be used with llm()
   */
  (modelId: string, options?: ProxyRequestOptions): ModelReference<ProxyRequestOptions>;

  /** Provider name */
  readonly name: 'proxy';

  /** Provider version */
  readonly version: string;

  /** Supported modalities */
  readonly modalities: {
    llm: LLMHandler<ProxyLLMParams>;
  };
}

/**
 * Creates a proxy provider that transports PP requests over HTTP.
 *
 * @param options - Configuration for the proxy endpoint
 * @returns A provider that can be used with llm()
 *
 * @example
 * ```typescript
 * const backend = proxy({ endpoint: 'https://api.example.com/ai' });
 * const instance = llm({ model: backend('gpt-4') });
 * ```
 */
export function proxy(options: ProxyProviderOptions): ProxyProvider {
  const llmHandler = createLLMHandler(options);

  const fn = function (
    modelId: string,
    requestOptions?: ProxyRequestOptions
  ): ModelReference<ProxyRequestOptions> {
    return { modelId, provider };
  };

  const modalities = {
    llm: llmHandler,
  };

  Object.defineProperties(fn, {
    name: {
      value: 'proxy',
      writable: false,
      configurable: true,
    },
    version: {
      value: '1.0.0',
      writable: false,
      configurable: true,
    },
    modalities: {
      value: modalities,
      writable: false,
      configurable: true,
    },
  });

  const provider = fn as ProxyProvider;

  llmHandler._setProvider?.(provider as unknown as LLMProvider<ProxyLLMParams>);

  return provider;
}

/**
 * Shorthand for creating a proxy model reference.
 *
 * @param endpoint - The URL to proxy requests to
 * @returns A model reference for use with llm()
 *
 * @example
 * ```typescript
 * const instance = llm({ model: proxyModel('/api/ai') });
 * ```
 */
export function proxyModel(endpoint: string): ModelReference<ProxyRequestOptions> {
  return proxy({ endpoint })('default');
}

// Re-export types
export type {
  ProxyLLMParams,
  ProxyProviderOptions,
  ProxyRequestOptions,
} from './types.ts';

// Re-export serialization utilities
export {
  serializeMessage,
  deserializeMessage,
  serializeTurn,
  serializeStreamEvent,
  deserializeStreamEvent,
} from './serialization.ts';

// Re-export server adapters
export { server, express, fastify, h3 } from './server/index.ts';
export type { ParsedBody, ProxyHandler, RequestMeta, AdapterOptions } from './server/index.ts';
