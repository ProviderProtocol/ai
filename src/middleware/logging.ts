/**
 * @fileoverview Logging middleware for request/response visibility.
 *
 * Provides configurable logging for LLM, embedding, and image operations,
 * including timing, error tracking, and optional event logging.
 *
 * @module middleware/logging
 */

import type { Middleware, MiddlewareContext, StreamContext } from '../types/middleware.ts';
import type { StreamEvent } from '../types/stream.ts';

/**
 * Log levels for filtering output.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Options for logging middleware.
 */
export interface LoggingOptions {
  /**
   * Minimum log level to output.
   * @default 'info'
   */
  level?: LogLevel;

  /**
   * Log individual stream events.
   * @default false
   */
  logStreamEvents?: boolean;

  /**
   * Log tool calls and results.
   * @default true
   */
  logToolCalls?: boolean;

  /**
   * Custom logger function. If not provided, uses console.log.
   * @param level - The log level
   * @param message - The log message
   * @param data - Optional additional data
   */
  logger?(level: LogLevel, message: string, data?: Record<string, unknown>): void;

  /**
   * Prefix for all log messages.
   * @default '[PP]'
   */
  prefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Creates a logging middleware for visibility into request lifecycle.
 *
 * This middleware logs the start, end, and errors of requests,
 * with optional logging of stream events and tool calls.
 *
 * @param options - Configuration options
 * @returns A middleware that logs request lifecycle events
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { loggingMiddleware } from '@providerprotocol/ai/middleware/logging';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 *
 * const model = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   middleware: [loggingMiddleware({ level: 'debug' })],
 * });
 *
 * // Logs: [PP] [anthropic] Starting llm request (streaming)
 * // Logs: [PP] [anthropic] Completed in 1234ms
 * const result = await model.generate('Hello');
 * ```
 */
export function loggingMiddleware(options: LoggingOptions = {}): Middleware {
  const {
    level = 'info',
    logStreamEvents = false,
    logToolCalls = true,
    logger,
    prefix = '[PP]',
  } = options;

  const minLevel = LOG_LEVELS[level];

  const log = (logLevel: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (LOG_LEVELS[logLevel] < minLevel) {
      return;
    }

    const fullMessage = `${prefix} ${message}`;

    if (logger) {
      logger(logLevel, fullMessage, data);
    } else {
      const consoleMethod = logLevel === 'error' ? console.error : logLevel === 'warn' ? console.warn : console.log;
      if (data) {
        consoleMethod(fullMessage, data);
      } else {
        consoleMethod(fullMessage);
      }
    }
  };

  return {
    name: 'logging',

    onStart(ctx: MiddlewareContext): void {
      const streamingLabel = ctx.streaming ? '(streaming)' : '';
      log('info', `[${ctx.provider}] Starting ${ctx.modality} request ${streamingLabel}`.trim());
      log('debug', `[${ctx.provider}] Model: ${ctx.modelId}`);
    },

    onEnd(ctx: MiddlewareContext): void {
      const duration = ctx.endTime ? ctx.endTime - ctx.startTime : 0;
      log('info', `[${ctx.provider}] Completed in ${duration}ms`);
    },

    onError(error: Error, ctx: MiddlewareContext): void {
      const duration = Date.now() - ctx.startTime;
      log('error', `[${ctx.provider}] Error after ${duration}ms: ${error.message}`);
    },

    onAbort(error: Error, ctx: MiddlewareContext): void {
      const duration = Date.now() - ctx.startTime;
      log('warn', `[${ctx.provider}] Aborted after ${duration}ms: ${error.message}`);
    },

    onStreamEvent(event: StreamEvent, ctx: StreamContext): StreamEvent {
      if (logStreamEvents) {
        log('debug', `Stream event: ${event.type}`, { index: event.index });
      }
      return event;
    },

    onToolCall(tool, params, ctx: MiddlewareContext): void {
      if (logToolCalls) {
        log('info', `[${ctx.provider}] Tool call: ${tool.name}`);
        log('debug', `[${ctx.provider}] Tool params:`, { params });
      }
    },

    onToolResult(tool, result, ctx: MiddlewareContext): void {
      if (logToolCalls) {
        log('debug', `[${ctx.provider}] Tool result: ${tool.name}`, { result });
      }
    },
  };
}
