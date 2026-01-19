/**
 * @fileoverview Middleware types for the Universal Provider Protocol.
 *
 * Defines the interfaces for composable middleware that can intercept and
 * transform requests, responses, and stream events across all modalities.
 *
 * @module types/middleware
 */

import type { StreamEvent } from './stream.ts';
import type { Tool } from './tool.ts';
import type { LLMRequest, LLMResponse } from './llm.ts';
import type { EmbeddingRequest, EmbeddingResponse } from './provider.ts';
import type { ImageRequest, ImageResponse } from './image.ts';

/**
 * Modality discriminator for middleware context.
 */
export type MiddlewareModality = 'llm' | 'embedding' | 'image';

/**
 * Union type for all request types across modalities.
 */
export type AnyRequest = LLMRequest | EmbeddingRequest | ImageRequest;

/**
 * Union type for all response types across modalities.
 */
export type AnyResponse = LLMResponse | EmbeddingResponse | ImageResponse;

/**
 * Shared context passed to all middleware hooks.
 *
 * Provides access to request/response data, timing information,
 * and a shared state map for passing data between middleware.
 *
 * @example
 * ```typescript
 * const loggingMiddleware: Middleware = {
 *   name: 'logging',
 *   onStart(ctx) {
 *     ctx.state.set('requestId', crypto.randomUUID());
 *   },
 *   onEnd(ctx) {
 *     const duration = ctx.endTime! - ctx.startTime;
 *     console.log(`[${ctx.provider}] ${ctx.state.get('requestId')} completed in ${duration}ms`);
 *   },
 * };
 * ```
 */
export interface MiddlewareContext {
  /** The modality being used */
  readonly modality: MiddlewareModality;

  /** Model ID */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Whether this is a streaming request */
  readonly streaming: boolean;

  /** Request object (modality-specific, mutable for onRequest hook) */
  request: AnyRequest;

  /** Response object (populated after execution, mutable for onResponse hook) */
  response?: AnyResponse;

  /** Shared state across middleware - use for passing data between hooks */
  readonly state: Map<string, unknown>;

  /** Request start timestamp in milliseconds */
  readonly startTime: number;

  /** Request end timestamp in milliseconds (set after completion) */
  endTime?: number;
}

/**
 * Context for stream event hooks.
 *
 * Provides a shared state map for middleware to store and retrieve data.
 * Middleware that need to accumulate text or other data should manage
 * their own state using the provided state map.
 *
 * @example
 * ```typescript
 * const filterMiddleware: Middleware = {
 *   name: 'reasoning-filter',
 *   onStreamEvent(event, ctx) {
 *     // Filter out reasoning events
 *     if (event.type === StreamEventType.ReasoningDelta) {
 *       return null;
 *     }
 *     return event;
 *   },
 * };
 * ```
 */
export interface StreamContext {
  /** Shared state (same reference as MiddlewareContext.state) */
  readonly state: Map<string, unknown>;
}

/**
 * Middleware interface with optional hooks.
 *
 * Implement only the hooks you need. Middleware are executed in array order
 * for request/start hooks, and reverse order for response/end hooks.
 *
 * @example
 * ```typescript
 * import { type Middleware, StreamEventType } from '@providerprotocol/ai';
 *
 * const customMiddleware: Middleware = {
 *   name: 'request-id',
 *
 *   onRequest(ctx) {
 *     ctx.state.set('requestId', crypto.randomUUID());
 *   },
 *
 *   onStreamEvent(event, ctx) {
 *     // Filter out reasoning events
 *     if (event.type === StreamEventType.ReasoningDelta) {
 *       return null;
 *     }
 *     return event;
 *   },
 *
 *   onEnd(ctx) {
 *     const duration = ctx.endTime! - ctx.startTime;
 *     console.log(`Request ${ctx.state.get('requestId')} took ${duration}ms`);
 *   },
 * };
 * ```
 */
export interface Middleware {
  /** Middleware name for debugging and logging */
  readonly name: string;

  // === Lifecycle Hooks ===

  /**
   * Called when generate/stream starts, before any provider execution.
   *
   * @param ctx - The middleware context
   */
  onStart?(ctx: MiddlewareContext): void | Promise<void>;

  /**
   * Called when generate/stream completes successfully.
   * Called in reverse middleware order.
   *
   * @param ctx - The middleware context with response populated
   */
  onEnd?(ctx: MiddlewareContext): void | Promise<void>;

  /**
   * Called on any error during execution.
   * Called for all middleware that have this hook, regardless of order.
   *
   * @param error - The error that occurred
   * @param ctx - The middleware context
   */
  onError?(error: Error, ctx: MiddlewareContext): void | Promise<void>;

  // === Request/Response Hooks ===

  /**
   * Called before provider execution. Can modify the request.
   *
   * @param ctx - The middleware context with mutable request
   */
  onRequest?(ctx: MiddlewareContext): void | Promise<void>;

  /**
   * Called after provider execution. Can modify the response.
   * Called in reverse middleware order.
   *
   * @param ctx - The middleware context with mutable response
   */
  onResponse?(ctx: MiddlewareContext): void | Promise<void>;

  // === Stream Hooks (LLM, Image) ===

  /**
   * Called for each stream event. Can transform, filter, or expand events.
   *
   * Return values:
   * - `StreamEvent` - Pass through (potentially modified)
   * - `StreamEvent[]` - Expand into multiple events
   * - `null` - Filter out this event
   *
   * @param event - The stream event to process
   * @param ctx - The stream context
   * @returns Transformed event(s) or null to filter
   */
  onStreamEvent?(event: StreamEvent, ctx: StreamContext): StreamEvent | StreamEvent[] | null;

  /**
   * Called when stream completes, after all events have been processed.
   *
   * @param ctx - The stream context
   */
  onStreamEnd?(ctx: StreamContext): void | Promise<void>;

  // === Tool Hooks (LLM only) ===

  /**
   * Called when a tool is about to be executed.
   *
   * @param tool - The tool being called
   * @param params - The parameters for the tool call
   * @param ctx - The middleware context
   */
  onToolCall?(tool: Tool, params: unknown, ctx: MiddlewareContext): void | Promise<void>;

  /**
   * Called after tool execution completes.
   *
   * @param tool - The tool that was executed
   * @param result - The result from the tool
   * @param ctx - The middleware context
   */
  onToolResult?(tool: Tool, result: unknown, ctx: MiddlewareContext): void | Promise<void>;
}
