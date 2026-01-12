import type { Provider } from '../../types/provider.ts';
import { createProvider } from '../../core/provider.ts';
import type { LLMHandlerResolver } from '../../core/provider-handlers.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createEmbeddingHandler } from './embed.ts';

/**
 * Configuration options for creating an OpenRouter model reference.
 *
 * OpenRouter supports two distinct APIs:
 * - Chat Completions API: Stable, production-ready, supports most models
 * - Responses API: Beta, supports advanced features like reasoning
 */
export interface OpenRouterProviderOptions {
  /**
   * Which OpenRouter API to use.
   *
   * - `'completions'`: Chat Completions API (default, recommended for production)
   * - `'responses'`: Responses API (beta, supports reasoning models)
   */
  api?: 'completions' | 'responses';
}

/**
 * OpenRouter provider interface with configurable API mode.
 *
 * OpenRouter is a unified API that provides access to hundreds of AI models
 * through a single endpoint, including models from OpenAI, Anthropic, Google,
 * Meta, Mistral, and many others.
 *
 * @example Using the Chat Completions API (default)
 * ```typescript
 * const model = openrouter('openai/gpt-4o');
 * ```
 *
 * @example Using the Responses API (beta)
 * ```typescript
 * const model = openrouter('openai/gpt-4o', { api: 'responses' });
 * ```
 *
 * @example Using Anthropic models
 * ```typescript
 * const model = openrouter('anthropic/claude-3.5-sonnet', { api: 'completions' });
 * ```
 */
/**
 * Type alias for the OpenRouter provider with its options.
 */
export type OpenRouterProvider = Provider<OpenRouterProviderOptions>;

/**
 * LLM handler resolver for OpenRouter's dual API support.
 *
 * Dynamically selects between Completions and Responses API handlers
 * based on the options stored on the ModelReference. This eliminates
 * race conditions from shared mutable state.
 */
const llmResolver: LLMHandlerResolver<OpenRouterProviderOptions> = {
  handlers: {
    completions: createCompletionsLLMHandler(),
    responses: createResponsesLLMHandler(),
  },
  defaultMode: 'completions',
  getMode: (options) => options?.api ?? 'completions',
};

/**
 * OpenRouter provider singleton.
 *
 * OpenRouter is a unified API that provides access to hundreds of AI models
 * through a single endpoint, including models from OpenAI, Anthropic, Google,
 * Meta, Mistral, and many others.
 *
 * Supports both the Chat Completions API (default) and Responses API (beta).
 *
 * @example Basic usage with Chat Completions API
 * ```typescript
 * import { openrouter } from './providers/openrouter';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: openrouter('openai/gpt-4o'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Using the Responses API (beta)
 * ```typescript
 * const betaModel = llm({
 *   model: openrouter('openai/gpt-4o', { api: 'responses' }),
 *   params: { max_output_tokens: 1000 }
 * });
 * ```
 *
 * @example Model routing and fallback configuration
 * ```typescript
 * const routedModel = llm({
 *   model: openrouter('openai/gpt-4o'),
 *   params: {
 *     max_tokens: 1000,
 *     models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
 *     route: 'fallback',
 *     provider: {
 *       allow_fallbacks: true,
 *       require_parameters: true,
 *     },
 *   }
 * });
 * ```
 *
 * @see {@link https://openrouter.ai/docs | OpenRouter Documentation}
 */
export const openrouter = createProvider<OpenRouterProviderOptions>({
  name: 'openrouter',
  version: '1.0.0',
  handlers: {
    llm: llmResolver,
    embedding: createEmbeddingHandler(),
  },
}) as OpenRouterProvider;

export type {
  OpenRouterCompletionsParams,
  OpenRouterResponsesParams,
  OpenRouterConfig,
  OpenRouterAPIMode,
  OpenRouterModelOptions,
  OpenRouterModelReference,
  OpenRouterProviderPreferences,
  OpenRouterImageConfig,
  OpenRouterHeaders,
} from './types.ts';

export type { OpenRouterEmbedParams } from './embed.ts';
