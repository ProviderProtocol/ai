/**
 * @fileoverview Express/Connect adapter for proxy server.
 *
 * Provides utilities for using PP proxy with Express.js or Connect-based servers.
 * These adapters convert PP types to Express-compatible responses.
 *
 * @module providers/proxy/server/express
 */

import type { Turn } from '../../../types/turn.ts';
import type { StreamResult } from '../../../types/stream.ts';
import { serializeTurn, serializeStreamEvent } from '../serialization.ts';

/**
 * Express Response interface (minimal type to avoid dependency).
 */
interface ExpressResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ExpressResponse;
  write(chunk: string): boolean;
  end(): void;
  json(body: unknown): void;
}

/**
 * Send a Turn as JSON response.
 *
 * @param turn - The completed inference turn
 * @param res - Express response object
 *
 * @example
 * ```typescript
 * const turn = await instance.generate(messages);
 * expressAdapter.sendJSON(turn, res);
 * ```
 */
export function sendJSON(turn: Turn, res: ExpressResponse): void {
  res.setHeader('Content-Type', 'application/json');
  res.json(serializeTurn(turn));
}

/**
 * Stream a StreamResult as Server-Sent Events.
 *
 * @param stream - The StreamResult from instance.stream()
 * @param res - Express response object
 *
 * @example
 * ```typescript
 * const stream = instance.stream(messages);
 * expressAdapter.streamSSE(stream, res);
 * ```
 */
export function streamSSE(stream: StreamResult, res: ExpressResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  (async () => {
    try {
      for await (const event of stream) {
        const serialized = serializeStreamEvent(event);
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
 * Send an error response.
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @param res - Express response object
 */
export function sendError(message: string, status: number, res: ExpressResponse): void {
  res.status(status).json({ error: message });
}

/**
 * Express adapter utilities.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { llm, anthropic } from '@providerprotocol/ai';
 * import { parseBody, bindTools } from '@providerprotocol/ai/proxy';
 * import { express as expressAdapter } from '@providerprotocol/ai/proxy/server';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.post('/api/ai', async (req, res) => {
 *   const { messages, system, params } = parseBody(req.body);
 *   const instance = llm({ model: anthropic('claude-sonnet-4-20250514'), system });
 *
 *   if (req.headers.accept?.includes('text/event-stream')) {
 *     expressAdapter.streamSSE(instance.stream(messages), res);
 *   } else {
 *     const turn = await instance.generate(messages);
 *     expressAdapter.sendJSON(turn, res);
 *   }
 * });
 * ```
 */
export const express = {
  sendJSON,
  streamSSE,
  sendError,
};
