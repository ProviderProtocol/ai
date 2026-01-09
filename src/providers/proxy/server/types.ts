/**
 * @fileoverview Shared types for proxy server adapters.
 *
 * @module providers/proxy/server/types
 */

import type { Message } from '../../../types/messages.ts';
import type { Turn } from '../../../types/turn.ts';
import type { StreamResult } from '../../../types/stream.ts';
import type { JSONSchema } from '../../../types/schema.ts';
import type { ToolMetadata } from '../../../types/tool.ts';

/**
 * Parsed request body from a proxy HTTP request.
 */
export interface ParsedBody {
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
 * Handler function signature for proxy endpoints.
 * Takes parsed request data and returns either a Turn or StreamResult.
 */
export type ProxyHandler = (
  body: ParsedBody,
  meta: RequestMeta
) => Promise<Turn> | StreamResult | Promise<StreamResult>;

/**
 * Metadata about the incoming request.
 */
export interface RequestMeta {
  /** Whether the client wants a streaming response */
  wantsStream: boolean;
  /** Raw headers from the request */
  headers: Record<string, string | undefined>;
}

/**
 * Options for adapter middleware.
 */
export interface AdapterOptions {
  /** Custom error handler */
  onError?: (error: Error) => { message: string; status: number };
}
