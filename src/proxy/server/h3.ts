/**
 * H3/Nitro/Nuxt adapter for PP proxy server
 *
 * For use with H3-based servers (Nuxt, Nitro, standalone H3).
 *
 * @packageDocumentation
 */

export {
  h3,
  sendJSON,
  sendEmbeddingJSON,
  sendImageJSON,
  streamSSE,
  streamImageSSE,
  createSSEStream,
  createImageSSEStream,
  sendError,
} from '../../providers/proxy/server/h3.ts';
