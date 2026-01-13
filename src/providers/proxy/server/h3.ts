/**
 * @fileoverview H3/Nitro/Nuxt adapter for proxy server.
 *
 * Provides utilities for using PP proxy with H3-based servers
 * (Nuxt, Nitro, or standalone H3).
 *
 * @module providers/proxy/server/h3
 */

import type { Turn } from '../../../types/turn.ts';
import type { StreamResult } from '../../../types/stream.ts';
import type { EmbeddingResult } from '../../../types/embedding.ts';
import type { ImageResult } from '../../../types/image.ts';
import { serializeTurn, serializeStreamEvent } from '../serialization.ts';
import { serializeImageResult, serializeImageStreamEvent } from '../serialization.media.ts';
import { resolveImageResult, type ImageStreamLike } from './image-stream.ts';

/**
 * H3 Event interface (minimal type to avoid dependency).
 */
interface H3Event {
  node: {
    res: {
      setHeader(name: string, value: string): void;
      write(chunk: string): boolean;
      end(): void;
    };
  };
}

/**
 * Send a Turn as JSON response.
 *
 * @param turn - The completed inference turn
 * @param event - H3 event object
 * @returns Serialized turn data
 *
 * @example
 * ```typescript
 * const turn = await instance.generate(messages);
 * return h3Adapter.sendJSON(turn, event);
 * ```
 */
export function sendJSON(turn: Turn, event: H3Event): unknown {
  event.node.res.setHeader('Content-Type', 'application/json');
  return serializeTurn(turn);
}

/**
 * Send an EmbeddingResult as JSON response.
 *
 * @param result - The embedding result
 * @param event - H3 event object
 * @returns Serialized result data
 */
export function sendEmbeddingJSON(result: EmbeddingResult, event: H3Event): unknown {
  event.node.res.setHeader('Content-Type', 'application/json');
  return result;
}

/**
 * Send an ImageResult as JSON response.
 *
 * @param result - The image result
 * @param event - H3 event object
 * @returns Serialized image result data
 */
export function sendImageJSON(result: ImageResult, event: H3Event): unknown {
  event.node.res.setHeader('Content-Type', 'application/json');
  return serializeImageResult(result);
}

/**
 * Stream a StreamResult as Server-Sent Events.
 *
 * @param stream - The StreamResult from instance.stream()
 * @param event - H3 event object
 *
 * @example
 * ```typescript
 * const stream = instance.stream(messages);
 * return h3Adapter.streamSSE(stream, event);
 * ```
 */
export function streamSSE(stream: StreamResult, event: H3Event): void {
  const res = event.node.res;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  (async () => {
    try {
      for await (const evt of stream) {
        const serialized = serializeStreamEvent(evt);
        res.write(`data: ${JSON.stringify(serialized)}\n\n`);
      }

      const turn = await stream.turn;
      res.write(`data: ${JSON.stringify(serializeTurn(turn))}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  })();
}

/**
 * Stream an ImageStreamResult as Server-Sent Events.
 *
 * @param stream - The ImageStreamResult or ImageProviderStreamResult from image().stream()
 * @param event - H3 event object
 */
export function streamImageSSE(stream: ImageStreamLike, event: H3Event): void {
  const res = event.node.res;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  (async () => {
    try {
      for await (const evt of stream) {
        const serialized = serializeImageStreamEvent(evt);
        res.write(`data: ${JSON.stringify(serialized)}\n\n`);
      }

      const result = await resolveImageResult(stream);
      res.write(`data: ${JSON.stringify(serializeImageResult(result))}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  })();
}

/**
 * Create a ReadableStream for H3's sendStream utility.
 *
 * Use this with H3's sendStream for better integration:
 * ```typescript
 * import { sendStream } from 'h3';
 * return sendStream(event, h3Adapter.createSSEStream(stream));
 * ```
 *
 * @param stream - The StreamResult from instance.stream()
 * @returns A ReadableStream of SSE data
 */
export function createSSEStream(stream: StreamResult): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          const serialized = serializeStreamEvent(event);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(serialized)}\n\n`));
        }

        const turn = await stream.turn;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(serializeTurn(turn))}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Create a ReadableStream for image SSE data.
 *
 * @param stream - The ImageStreamResult or ImageProviderStreamResult from image().stream()
 * @returns A ReadableStream of SSE data
 */
export function createImageSSEStream(stream: ImageStreamLike): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          const serialized = serializeImageStreamEvent(event);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(serialized)}\n\n`));
        }

        const result = await resolveImageResult(stream);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(serializeImageResult(result))}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Send an error response.
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @param event - H3 event object
 * @returns Error object for H3 to serialize
 */
export function sendError(message: string, status: number, event: H3Event): { error: string; statusCode: number } {
  return { error: message, statusCode: status };
}

/**
 * H3/Nitro/Nuxt adapter utilities.
 *
 * @example Basic usage
 * ```typescript
 * // Nuxt server route: server/api/ai.post.ts
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { parseBody } from '@providerprotocol/ai/proxy';
 * import { h3 as h3Adapter } from '@providerprotocol/ai/proxy/server';
 *
 * export default defineEventHandler(async (event) => {
 *   const body = await readBody(event);
 *   const { messages, system, params } = parseBody(body);
 *   const instance = llm({ model: anthropic('claude-sonnet-4-20250514'), system });
 *
 *   const wantsStream = getHeader(event, 'accept')?.includes('text/event-stream');
 *   if (wantsStream) {
 *     return h3Adapter.streamSSE(instance.stream(messages), event);
 *   } else {
 *     const turn = await instance.generate(messages);
 *     return h3Adapter.sendJSON(turn, event);
 *   }
 * });
 * ```
 *
 * @example API Gateway with authentication (Nuxt)
 * ```typescript
 * // server/api/ai.post.ts
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { ExponentialBackoff, RoundRobinKeys } from '@providerprotocol/ai/http';
 * import { parseBody } from '@providerprotocol/ai/proxy';
 * import { h3 as h3Adapter } from '@providerprotocol/ai/proxy/server';
 *
 * // Server manages AI provider keys - users never see them
 * const claude = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   config: {
 *     apiKey: new RoundRobinKeys([
 *       process.env.ANTHROPIC_KEY_1!,
 *       process.env.ANTHROPIC_KEY_2!,
 *     ]),
 *     retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
 *   },
 * });
 *
 * export default defineEventHandler(async (event) => {
 *   // Authenticate with your platform credentials
 *   const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
 *   const user = await validatePlatformToken(token);
 *   if (!user) {
 *     throw createError({ statusCode: 401, message: 'Unauthorized' });
 *   }
 *
 *   // Track usage per user
 *   // await trackUsage(user.id);
 *
 *   const body = await readBody(event);
 *   const { messages, system, params } = parseBody(body);
 *
 *   if (params?.stream) {
 *     return h3Adapter.streamSSE(claude.stream(messages, { system }), event);
 *   }
 *   const turn = await claude.generate(messages, { system });
 *   return h3Adapter.sendJSON(turn, event);
 * });
 * ```
 */
export const h3 = {
  sendJSON,
  sendEmbeddingJSON,
  sendImageJSON,
  streamSSE,
  streamImageSSE,
  createSSEStream,
  createImageSSEStream,
  sendError,
};
