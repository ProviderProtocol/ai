/**
 * @fileoverview Persistence middleware for thread storage.
 *
 * Loads a conversation thread before execution and saves it after completion.
 * Designed for LLM requests; other modalities are ignored.
 *
 * @module middleware/persistence
 */

import type { Middleware, MiddlewareContext } from '../types/middleware.ts';
import type { LLMRequest } from '../types/llm.ts';
import type { Turn } from '../types/turn.ts';
import type { ThreadJSON } from '../types/thread.ts';
import { Thread } from '../types/thread.ts';
import { toError } from '../utils/error.ts';

const STATE_KEY_THREAD = 'persistence:thread';
const STATE_KEY_ID = 'persistence:id';
const TURN_START_INDEX_KEY = 'llm:turnStartIndex';

const isLLMRequest = (request: MiddlewareContext['request']): request is LLMRequest => (
  'messages' in request
);

/**
 * Load result for persistence adapters.
 */
export type PersistenceLoadResult = Thread | ThreadJSON | null | undefined;

/**
 * Adapter configuration for persistence middleware.
 */
export interface PersistenceAdapterConfig {
  /**
   * Unique identifier for the conversation.
   */
  id: string;

  /**
   * Loads a thread for the provided ID.
   *
   * Return a Thread instance, ThreadJSON, or null/undefined for new threads.
   *
   * @param id - Conversation identifier
   */
  load(id: string): Promise<PersistenceLoadResult>;

  /**
   * Persists the thread after a turn completes.
   *
   * @param id - Conversation identifier
   * @param thread - Updated thread instance
   * @param turn - Completed turn (undefined if not available)
   */
  save(id: string, thread: Thread, turn: Turn | undefined): Promise<void>;
}

/**
 * Persistence adapter implementation.
 *
 * Provides a thin wrapper around load/save callbacks.
 */
export class PersistenceAdapter {
  readonly id: string;

  private readonly loader: PersistenceAdapterConfig['load'];

  private readonly saver: PersistenceAdapterConfig['save'];

  /**
   * Creates a persistence adapter.
   *
   * @param config - Adapter configuration
   */
  constructor(config: PersistenceAdapterConfig) {
    this.id = config.id;
    this.loader = config.load;
    this.saver = config.save;
  }

  /**
   * Loads a thread for the provided ID.
   *
   * @param id - Conversation identifier
   */
  async load(id: string): Promise<PersistenceLoadResult> {
    return this.loader(id);
  }

  /**
   * Persists the thread after a turn completes.
   *
   * @param id - Conversation identifier
   * @param thread - Updated thread instance
   * @param turn - Completed turn (undefined if not available)
   */
  async save(id: string, thread: Thread, turn: Turn | undefined): Promise<void> {
    await this.saver(id, thread, turn);
  }
}

/**
 * Options for persistence middleware.
 */
export interface PersistenceOptions {
  /**
   * Adapter instance for loading and saving threads.
   */
  adapter: PersistenceAdapter;
}

/**
 * Gets the loaded thread from middleware state.
 *
 * @param state - Middleware state map
 * @returns Thread instance or undefined if not set
 */
export function getThread(state: Map<string, unknown>): Thread | undefined {
  return state.get(STATE_KEY_THREAD) as Thread | undefined;
}

/**
 * Gets the conversation ID from middleware state.
 *
 * @param state - Middleware state map
 * @returns Conversation ID or undefined if not set
 */
export function getThreadId(state: Map<string, unknown>): string | undefined {
  return state.get(STATE_KEY_ID) as string | undefined;
}

/**
 * Creates persistence middleware for thread storage.
 *
 * Loads a thread before requests and saves it after completion. The middleware
 * prepends loaded messages that are not already present in the request so turn
 * slicing excludes persisted history without duplicating explicit history.
 *
 * @param options - Middleware configuration
 * @returns Middleware instance
 *
 * @example
 * ```typescript
 * import { llm } from '@providerprotocol/ai';
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { persistenceMiddleware, PersistenceAdapter } from '@providerprotocol/ai/middleware/persistence';
 *
 * const model = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   system: 'You are a helpful assistant.',
 *   middleware: [
 *     persistenceMiddleware({
 *       adapter: new PersistenceAdapter({
 *         id: 'conversation-id',
 *         load: async (id) => loadThreadFromMemory(id),
 *         save: async (id, thread) => saveThreadToMemory(id, thread),
 *       }),
 *     }),
 *   ],
 * });
 * ```
 */
export function persistenceMiddleware(options: PersistenceOptions): Middleware {
  const { adapter } = options;

  if (!adapter?.id) {
    throw new Error('persistenceMiddleware requires an adapter with a non-empty id');
  }
  if (typeof adapter.load !== 'function' || typeof adapter.save !== 'function') {
    throw new Error('persistenceMiddleware requires an adapter with load and save functions');
  }

  return {
    name: 'persistence',

    async onRequest(ctx: MiddlewareContext): Promise<void> {
      if (ctx.modality !== 'llm' || !isLLMRequest(ctx.request)) {
        return;
      }

      ctx.state.set(STATE_KEY_ID, adapter.id);

      let loaded: PersistenceLoadResult;
      try {
        loaded = await adapter.load(adapter.id);
      } catch (error) {
        const err = toError(error);
        throw new Error(`Persistence adapter failed to load thread "${adapter.id}": ${err.message}`, {
          cause: err,
        });
      }

      let thread: Thread;
      if (!loaded) {
        thread = new Thread();
      } else if (loaded instanceof Thread) {
        thread = loaded;
      } else {
        try {
          thread = Thread.fromJSON(loaded);
        } catch (error) {
          const err = toError(error);
          throw new Error(`Persistence adapter failed to deserialize thread "${adapter.id}": ${err.message}`, {
            cause: err,
          });
        }
      }

      ctx.state.set(STATE_KEY_THREAD, thread);

      if (thread.messages.length > 0) {
        const existingIds = new Set(ctx.request.messages.map((message) => message.id));
        const missing = thread.messages.filter((message) => !existingIds.has(message.id));
        if (missing.length > 0) {
          ctx.request.messages.unshift(...missing);
          const currentIndex = ctx.state.get(TURN_START_INDEX_KEY);
          const nextIndex = (typeof currentIndex === 'number' ? currentIndex : 0) + missing.length;
          ctx.state.set(TURN_START_INDEX_KEY, nextIndex);
        }
      }
    },

    async onTurn(turn: Turn, ctx: MiddlewareContext): Promise<void> {
      if (ctx.modality !== 'llm') {
        return;
      }

      const thread = getThread(ctx.state);
      if (!thread) {
        return;
      }

      if (isLLMRequest(ctx.request)) {
        const turnMessageIds = new Set(turn.messages.map((message) => message.id));
        const existingIds = new Set(thread.messages.map((message) => message.id));
        for (const message of ctx.request.messages) {
          if (turnMessageIds.has(message.id)) {
            continue;
          }
          if (!existingIds.has(message.id)) {
            thread.push(message);
            existingIds.add(message.id);
          }
        }
      }

      thread.append(turn);

      try {
        await adapter.save(adapter.id, thread, turn);
      } catch (error) {
        const err = toError(error);
        throw new Error(`Persistence adapter failed to save thread "${adapter.id}": ${err.message}`, {
          cause: err,
        });
      }
    },
  };
}
