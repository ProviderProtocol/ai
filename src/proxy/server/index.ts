/**
 * Proxy server adapters for UPP
 *
 * Framework-specific adapters for using PP proxy with various server frameworks.
 * Includes Web API (Bun, Deno, Next.js), Express, Fastify, and H3/Nuxt adapters.
 *
 * @packageDocumentation
 */

export {
  server,
  webapi,
  express,
  fastify,
  h3,
  parseBody,
  parseEmbeddingBody,
  parseImageBody,
  toJSON,
  toEmbeddingJSON,
  toImageJSON,
  toSSE,
  toImageSSE,
  toError,
  bindTools,
} from '../../providers/proxy/server/index.ts';

export type {
  ParsedRequest,
  ParsedEmbeddingRequest,
  ParsedImageRequest,
  ParsedBody,
  ProxyHandler,
  RequestMeta,
  AdapterOptions,
} from '../../providers/proxy/server/index.ts';
