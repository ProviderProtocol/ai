import { createProvider } from '../../core/provider.ts';
import type { ModelReference } from '../../types/provider.ts';
import { createLLMHandler } from './llm.ts';
import type { ProxyProviderOptions, ProxyRequestOptions } from './types.ts';

/**
 * Creates a proxy provider that transports PP requests over HTTP to a backend server.
 *
 * The proxy acts as a pure transport layer - PP types go in, PP types come out.
 * The modelId is passed through to the backend, which decides which actual model to use.
 *
 * @param options - Configuration for the proxy endpoint
 * @returns A provider that can be used with llm()
 *
 * @example
 * ```typescript
 * import { proxy } from './providers/proxy';
 * import { llm } from './core/llm';
 *
 * const backend = proxy({ endpoint: '/api/ai' });
 *
 * const model = llm({
 *   model: backend('gpt-4o'),
 *   system: 'You are a helpful assistant.',
 * });
 *
 * const turn = await model.generate('Hello!');
 * ```
 */
export function proxy(options: ProxyProviderOptions) {
  return createProvider<ProxyRequestOptions>({
    name: 'proxy',
    version: '1.0.0',
    handlers: {
      llm: createLLMHandler(options),
    },
  });
}

/**
 * Shorthand for creating a proxy model reference with default model ID.
 *
 * Creates a proxy provider and immediately returns a model reference using
 * 'default' as the model identifier. Useful for simple single-endpoint setups.
 *
 * @param endpoint - The URL to proxy requests to
 * @returns A model reference for use with llm()
 *
 * @example
 * ```typescript
 * import { proxyModel } from './providers/proxy';
 * import { llm } from './core/llm';
 *
 * const model = llm({ model: proxyModel('/api/ai') });
 * const turn = await model.generate('Hello!');
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
