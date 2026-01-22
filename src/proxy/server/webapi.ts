/**
 * Web API adapter for PP proxy server
 *
 * For use with Bun, Deno, Next.js App Router, Cloudflare Workers,
 * and other frameworks that support Web API Response.
 *
 * @packageDocumentation
 */

export {
  webapi,
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
} from '../../providers/proxy/server/webapi.ts';

export type {
  ParsedRequest,
  ParsedEmbeddingRequest,
  ParsedImageRequest,
} from '../../providers/proxy/server/webapi.ts';
