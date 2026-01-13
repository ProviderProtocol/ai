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
import type { EmbeddingInput } from '../../../types/provider.ts';
import type { Turn } from '../../../types/turn.ts';
import type { StreamResult } from '../../../types/stream.ts';
import type { MessageJSON } from '../../../types/thread.ts';
import type { JSONSchema } from '../../../types/schema.ts';
import type { Tool, ToolMetadata } from '../../../types/tool.ts';
import type { EmbeddingResult } from '../../../types/embedding.ts';
import type { ImageResult } from '../../../types/image.ts';
import {
  deserializeMessage,
  serializeTurn,
  serializeStreamEvent,
} from '../serialization.ts';
import {
  deserializeEmbeddingInput,
  deserializeImage,
  serializeImageResult,
  serializeImageStreamEvent,
  type SerializedEmbeddingInput,
  type SerializedImage,
} from '../serialization.media.ts';
import { resolveImageResult, type ImageStreamLike } from './image-stream.ts';

/**
 * Parsed request body from a proxy HTTP request.
 * This is just the deserialized PP data from the request body.
 */
export interface ParsedRequest {
  messages: Message[];
  system?: string | unknown[];
  params?: Record<string, unknown>;
  model?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: JSONSchema;
    metadata?: ToolMetadata;
  }>;
  structure?: JSONSchema;
}

/**
 * Parsed request body for embedding endpoints.
 */
export interface ParsedEmbeddingRequest {
  inputs: EmbeddingInput[];
  params?: Record<string, unknown>;
  model?: string;
}

/**
 * Parsed request body for image endpoints.
 */
export interface ParsedImageRequest {
  prompt: string;
  params?: Record<string, unknown>;
  model?: string;
  image?: ReturnType<typeof deserializeImage>;
  mask?: ReturnType<typeof deserializeImage>;
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
    model: typeof data.model === 'string' ? data.model : undefined,
    tools: data.tools as ParsedRequest['tools'],
    structure: data.structure as JSONSchema | undefined,
  };
}

/**
 * Parse an HTTP request body into embedding inputs.
 *
 * @param body - The JSON-parsed request body
 * @returns Parsed embedding request data
 */
export function parseEmbeddingBody(body: unknown): ParsedEmbeddingRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const data = body as Record<string, unknown>;

  if (!Array.isArray(data.inputs)) {
    throw new Error('Request body must have an inputs array');
  }

  const inputs = data.inputs.map((input) =>
    deserializeEmbeddingInput(input as SerializedEmbeddingInput)
  );

  return {
    inputs,
    params: data.params as Record<string, unknown> | undefined,
    model: typeof data.model === 'string' ? data.model : undefined,
  };
}

/**
 * Parse an HTTP request body into image request data.
 *
 * @param body - The JSON-parsed request body
 * @returns Parsed image request data
 */
export function parseImageBody(body: unknown): ParsedImageRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const data = body as Record<string, unknown>;
  const promptValue = data.prompt;

  let prompt: string | undefined;
  if (typeof promptValue === 'string') {
    prompt = promptValue;
  } else if (promptValue && typeof promptValue === 'object') {
    const promptObj = promptValue as Record<string, unknown>;
    if (typeof promptObj.prompt === 'string') {
      prompt = promptObj.prompt;
    }
  }

  if (!prompt) {
    throw new Error('Request body must have a prompt string');
  }

  const image = data.image ? deserializeImage(data.image as SerializedImage) : undefined;
  const mask = data.mask ? deserializeImage(data.mask as SerializedImage) : undefined;

  return {
    prompt,
    params: data.params as Record<string, unknown> | undefined,
    model: typeof data.model === 'string' ? data.model : undefined,
    image,
    mask,
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
 * Create a JSON Response from an embedding result.
 *
 * @param result - The embedding result
 * @returns HTTP Response with JSON body
 */
export function toEmbeddingJSON(result: EmbeddingResult): Response {
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create a JSON Response from an image result.
 *
 * @param result - The image result
 * @returns HTTP Response with JSON body
 */
export function toImageJSON(result: ImageResult): Response {
  return new Response(JSON.stringify(serializeImageResult(result)), {
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
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
 * Create an SSE Response from an ImageStreamResult.
 *
 * Streams image events as SSE, then sends the final image result.
 *
 * @param stream - The ImageStreamResult or ImageProviderStreamResult from image().stream()
 * @returns HTTP Response with SSE body
 */
export function toImageSSE(stream: ImageStreamLike): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          const serialized = serializeImageStreamEvent(event);
          const data = `data: ${JSON.stringify(serialized)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        const result = await resolveImageResult(stream);
        const resultData = serializeImageResult(result);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
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
  parseEmbeddingBody,
  parseImageBody,
  toJSON,
  toEmbeddingJSON,
  toImageJSON,
  toSSE,
  toImageSSE,
  toError,
  bindTools,
};
