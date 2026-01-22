/**
 * Fastify adapter for PP proxy server
 *
 * For use with Fastify servers.
 *
 * @packageDocumentation
 */

export {
  fastify,
  sendJSON,
  sendEmbeddingJSON,
  sendImageJSON,
  streamSSE,
  streamImageSSE,
  sendError,
} from '../../providers/proxy/server/fastify.ts';
