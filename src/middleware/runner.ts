/**
 * @fileoverview Middleware execution utilities.
 *
 * Provides functions for running middleware hooks in the correct order
 * and creating stream event transformers from middleware arrays.
 *
 * @module middleware/runner
 */

import type {
  Middleware,
  MiddlewareContext,
  StreamContext,
} from '../types/middleware.ts';
import type { StreamEvent } from '../types/stream.ts';
import type { Tool } from '../types/tool.ts';
import type { Turn } from '../types/turn.ts';

/**
 * Lifecycle hook names that can be run in forward or reverse order.
 */
export type LifecycleHook = 'onStart' | 'onEnd' | 'onRequest' | 'onResponse';

/**
 * Runs a lifecycle hook for all middleware in the specified order.
 *
 * Hooks are run sequentially to maintain consistent ordering.
 * If reverse is true, middleware are processed in reverse array order.
 *
 * @param middlewares - Array of middleware to process
 * @param hook - The hook name to execute
 * @param ctx - The middleware context
 * @param reverse - Whether to run in reverse order (default: false)
 */
export async function runHook(
  middlewares: Middleware[],
  hook: LifecycleHook,
  ctx: MiddlewareContext,
  reverse = false
): Promise<void> {
  const ordered = reverse ? [...middlewares].reverse() : middlewares;

  for (const mw of ordered) {
    const fn = mw[hook];
    if (fn) {
      await fn.call(mw, ctx);
    }
  }
}

/**
 * Runs the onError hook for all middleware that have it.
 *
 * Error hooks are always run for all middleware, regardless of which
 * middleware was active when the error occurred. Errors from error
 * hooks themselves are logged but not re-thrown.
 *
 * @param middlewares - Array of middleware to process
 * @param error - The error that occurred
 * @param ctx - The middleware context
 */
export async function runErrorHook(
  middlewares: Middleware[],
  error: Error,
  ctx: MiddlewareContext
): Promise<void> {
  for (const mw of middlewares) {
    if (mw.onError) {
      try {
        await mw.onError(error, ctx);
      } catch (hookError) {
        // Log but don't throw - error hooks should not cause additional failures
        console.error(`[${mw.name}] Error in onError hook:`, hookError);
      }
    }
  }
}

/**
 * Runs the onAbort hook for all middleware that have it.
 *
 * Abort hooks are run for all middleware when a request is cancelled.
 * Errors from abort hooks are logged but not re-thrown.
 *
 * @param middlewares - Array of middleware to process
 * @param error - The cancellation error
 * @param ctx - The middleware context
 */
export async function runAbortHook(
  middlewares: Middleware[],
  error: Error,
  ctx: MiddlewareContext
): Promise<void> {
  for (const mw of middlewares) {
    if (mw.onAbort) {
      try {
        await mw.onAbort(error, ctx);
      } catch (hookError) {
        // Log but don't throw - abort hooks should not cause additional failures
        console.error(`[${mw.name}] Error in onAbort hook:`, hookError);
      }
    }
  }
}

/**
 * Runs tool hooks (onToolCall or onToolResult) for all middleware.
 *
 * Tool hooks are run in forward order for onToolCall and allow middleware
 * to observe or log tool interactions.
 *
 * @param middlewares - Array of middleware to process
 * @param hook - Either 'onToolCall' or 'onToolResult'
 * @param tool - The tool being called/that was called
 * @param data - Parameters (onToolCall) or result (onToolResult)
 * @param ctx - The middleware context
 */
export async function runToolHook(
  middlewares: Middleware[],
  hook: 'onToolCall' | 'onToolResult',
  tool: Tool,
  data: unknown,
  ctx: MiddlewareContext
): Promise<void> {
  for (const mw of middlewares) {
    const fn = mw[hook];
    if (fn) {
      await fn.call(mw, tool, data, ctx);
    }
  }
}

/**
 * Runs the onTurn hook for all middleware that have it.
 *
 * Turn hooks are run in reverse middleware order.
 *
 * @param middlewares - Array of middleware to process
 * @param turn - The completed Turn
 * @param ctx - The middleware context
 */
export async function runTurnHook(
  middlewares: Middleware[],
  turn: Turn,
  ctx: MiddlewareContext
): Promise<void> {
  const ordered = [...middlewares].reverse();
  for (const mw of ordered) {
    if (mw.onTurn) {
      await mw.onTurn.call(mw, turn, ctx);
    }
  }
}

/**
 * Creates a stream event transformer from middleware array.
 *
 * The transformer applies onStreamEvent hooks from all middleware in sequence.
 * Each middleware can transform, filter (return null), or expand (return array)
 * events.
 *
 * @param middlewares - Array of middleware to process
 * @param ctx - The stream context
 * @returns A function that transforms stream events
 *
 * @example
 * ```typescript
 * const transformer = createStreamTransformer(middlewares, streamCtx);
 *
 * for await (const event of baseStream) {
 *   const result = transformer(event);
 *   if (result === null) continue;
 *   if (Array.isArray(result)) {
 *     for (const e of result) yield e;
 *   } else {
 *     yield result;
 *   }
 * }
 * ```
 */
export function createStreamTransformer(
  middlewares: Middleware[],
  ctx: StreamContext
): (event: StreamEvent) => StreamEvent | StreamEvent[] | null {
  const streamMiddlewares = middlewares.filter((mw) => mw.onStreamEvent);

  if (streamMiddlewares.length === 0) {
    return (event) => event;
  }

  return (event: StreamEvent): StreamEvent | StreamEvent[] | null => {
    let current: StreamEvent | StreamEvent[] | null = event;

    for (const mw of streamMiddlewares) {
      if (current === null) {
        return null;
      }

      if (Array.isArray(current)) {
        // Process each event in the array through this middleware
        const results: StreamEvent[] = [];
        for (const e of current) {
          const result = mw.onStreamEvent!(e, ctx);
          if (result === null) {
            continue;
          }
          if (Array.isArray(result)) {
            results.push(...result);
          } else {
            results.push(result);
          }
        }
        current = results.length > 0 ? results : null;
      } else {
        current = mw.onStreamEvent!(current, ctx);
      }
    }

    return current;
  };
}

/**
 * Runs onStreamEnd hook for all middleware that have it.
 *
 * Called after all stream events have been processed.
 *
 * @param middlewares - Array of middleware to process
 * @param ctx - The stream context
 */
export async function runStreamEndHook(
  middlewares: Middleware[],
  ctx: StreamContext
): Promise<void> {
  for (const mw of middlewares) {
    if (mw.onStreamEnd) {
      await mw.onStreamEnd(ctx);
    }
  }
}

/**
 * Creates a fresh MiddlewareContext for a request.
 *
 * @param modality - The modality ('llm', 'embedding', 'image')
 * @param modelId - The model ID
 * @param provider - The provider name
 * @param streaming - Whether this is a streaming request
 * @param request - The request object
 * @returns A new MiddlewareContext
 */
export function createMiddlewareContext(
  modality: 'llm' | 'embedding' | 'image',
  modelId: string,
  provider: string,
  streaming: boolean,
  request: MiddlewareContext['request']
): MiddlewareContext {
  return {
    modality,
    modelId,
    provider,
    streaming,
    request,
    response: undefined,
    state: new Map(),
    startTime: Date.now(),
    endTime: undefined,
  };
}

/**
 * Creates a fresh StreamContext for streaming operations.
 *
 * @param state - Shared state map (usually from MiddlewareContext)
 * @returns A new StreamContext
 */
export function createStreamContext(
  state: Map<string, unknown>
): StreamContext {
  return { state };
}
