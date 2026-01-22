/**
 * Express/Connect adapter for PP proxy server
 *
 * For use with Express.js or Connect-based servers.
 *
 * @packageDocumentation
 */

export {
  express,
  sendJSON,
  sendEmbeddingJSON,
  sendImageJSON,
  streamSSE,
  streamImageSSE,
  sendError,
} from '../../providers/proxy/server/express.ts';
