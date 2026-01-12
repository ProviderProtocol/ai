/**
 * @fileoverview Web API adapter for proxy server.
 *
 * Provides utilities for using PP proxy with Web API native frameworks
 * (Bun, Deno, Next.js App Router, Cloudflare Workers).
 *
 * These utilities return standard Web API Response objects that work
 * directly with modern runtimes.
 *
 * @module providers/proxy/server/webapi
 */

import type { Message } from '../../../types/messages.ts';
import type { Turn } from '../../../types/turn.ts';
import type { StreamResult } from '../../../types/stream.ts';
import type { MessageJSON } from '../../../types/thread.ts';
import type { JSONSchema } from '../../../types/schema.ts';
import type { Tool, ToolMetadata } from '../../../types/tool.ts';
import {
  deserializeMessage,
  serializeTurn,
  serializeStreamEvent,
} from '../serialization.ts';

/**
 * Parsed request body from a proxy HTTP request.
 * This is just the deserialized PP data from the request body.
 */
export interface ParsedRequest {
  messages: Message[];
  system?: string | unknown[];
  params?: Record<string, unknown>;
  tools?: Array<{
    name: string;
    description: string;
    parameters: JSONSchema;
    metadata?: ToolMetadata;
  }>;
  structure?: JSONSchema;
}

/**
 * Parse an HTTP request body into PP types.
 *
 * @param body - The JSON-parsed request body
 * @returns Deserialized PP data
 *
 * @example
 * ```typescript
 * const body = await req.json();
 * const { messages, system, params } = parseBody(body);
 *
 * const instance = llm({ model: anthropic('...'), system, params });
 * const turn = await instance.generate(messages);
 * ```
 */
export function parseBody(body: unknown): ParsedRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const data = body as Record<string, unknown>;

  if (!Array.isArray(data.messages)) {
    throw new Error('Request body must have a messages array');
  }

  for (const message of data.messages) {
    if (!message || typeof message !== 'object') {
      throw new Error('Each message must be an object');
    }
    const msg = message as Record<string, unknown>;
    if (typeof msg.id !== 'string') {
      throw new Error('Each message must have a string id');
    }
    if (typeof msg.type !== 'string') {
      throw new Error('Each message must have a string type');
    }
    if (typeof msg.timestamp !== 'string') {
      throw new Error('Each message must have a string timestamp');
    }
    if ((msg.type === 'user' || msg.type === 'assistant') && !Array.isArray(msg.content)) {
      throw new Error('User and assistant messages must have a content array');
    }
  }

  return {
    messages: (data.messages as MessageJSON[]).map(deserializeMessage),
    system: data.system as string | unknown[] | undefined,
    params: data.params as Record<string, unknown> | undefined,
    tools: data.tools as ParsedRequest['tools'],
    structure: data.structure as JSONSchema | undefined,
  };
}

/**
 * Create a JSON Response from a Turn.
 *
 * @param turn - The completed inference turn
 * @returns HTTP Response with JSON body
 *
 * @example
 * ```typescript
 * const turn = await instance.generate(messages);
 * return toJSON(turn);
 * ```
 */
export function toJSON(turn: Turn): Response {
  return new Response(JSON.stringify(serializeTurn(turn)), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create an SSE Response from a StreamResult.
 *
 * Streams PP StreamEvents as SSE, then sends the final Turn data.
 *
 * @param stream - The StreamResult from instance.stream()
 * @returns HTTP Response with SSE body
 *
 * @example
 * ```typescript
 * const stream = instance.stream(messages);
 * return toSSE(stream);
 * ```
 */
export function toSSE(stream: StreamResult): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          const serialized = serializeStreamEvent(event);
          const data = `data: ${JSON.stringify(serialized)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        // Send the final turn data
        const turn = await stream.turn;
        const turnData = serializeTurn(turn);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(turnData)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`data: {"error":"${errorMsg}"}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Create an error Response.
 *
 * @param message - Error message
 * @param status - HTTP status code (default: 500)
 * @returns HTTP Response with error body
 */
export function toError(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Bind tool schemas to implementation functions.
 *
 * Takes tool schemas from the request and binds them to your
 * server-side implementations.
 *
 * @param schemas - Tool schemas from the request
 * @param implementations - Map of tool name to implementation
 * @returns Array of complete Tool objects
 *
 * @example
 * ```typescript
 * const { tools: schemas } = parseBody(body);
 *
 * const tools = bindTools(schemas, {
 *   get_weather: async ({ location }) => fetchWeather(location),
 *   search: async ({ query }) => searchDB(query),
 * });
 *
 * const instance = llm({ model, tools });
 * ```
 */
export function bindTools(
  schemas: ParsedRequest['tools'],
  implementations: Record<string, (params: unknown) => unknown | Promise<unknown>>
): Tool[] {
  if (!schemas) return [];

  return schemas.map((schema) => {
    const run = implementations[schema.name];
    if (!run) {
      throw new Error(`No implementation for tool: ${schema.name}`);
    }
    return { ...schema, run };
  });
}

/**
 * Web API adapter utilities.
 *
 * For use with Bun, Deno, Next.js App Router, Cloudflare Workers,
 * and other frameworks that support Web API Response.
 *
 * **Security Note:** The proxy works without configuration, meaning no
 * authentication by default. Always add your own auth layer in production.
 *
 * @example Basic usage
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { parseBody, toJSON, toSSE } from '@providerprotocol/ai/proxy';
 *
 * // Bun.serve / Deno.serve / Next.js App Router
 * export async function POST(req: Request) {
 *   const { messages, system } = parseBody(await req.json());
 *   const instance = llm({ model: anthropic('claude-sonnet-4-20250514'), system });
 *
 *   if (req.headers.get('accept')?.includes('text/event-stream')) {
 *     return toSSE(instance.stream(messages));
 *   }
 *   return toJSON(await instance.generate(messages));
 * }
 * ```
 *
 * @example API Gateway with authentication
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { ExponentialBackoff, RoundRobinKeys } from '@providerprotocol/ai/http';
 * import { parseBody, toJSON, toSSE, toError } from '@providerprotocol/ai/proxy';
 *
 * // Your platform's user validation
 * async function validateToken(token: string): Promise<{ id: string } | null> {
 *   // Verify JWT, check database, etc.
 *   return token ? { id: 'user-123' } : null;
 * }
 *
 * // Server manages AI provider keys - users never see them
 * const claude = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   config: {
 *     apiKey: new RoundRobinKeys([process.env.ANTHROPIC_KEY_1!, process.env.ANTHROPIC_KEY_2!]),
 *     retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
 *   },
 * });
 *
 * Bun.serve({
 *   port: 3000,
 *   async fetch(req) {
 *     // Authenticate with YOUR platform credentials
 *     const token = req.headers.get('Authorization')?.replace('Bearer ', '');
 *     const user = await validateToken(token ?? '');
 *     if (!user) return toError('Unauthorized', 401);
 *
 *     // Rate limit, track usage, bill user, etc.
 *     // await trackUsage(user.id);
 *
 *     const { messages, system, params } = parseBody(await req.json());
 *
 *     if (params?.stream) {
 *       return toSSE(claude.stream(messages, { system }));
 *     }
 *     return toJSON(await claude.generate(messages, { system }));
 *   },
 * });
 * ```
 */
export const webapi = {
  parseBody,
  toJSON,
  toSSE,
  toError,
  bindTools,
};
