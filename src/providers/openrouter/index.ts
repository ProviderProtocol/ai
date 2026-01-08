import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
  EmbeddingHandler,
  EmbeddingProvider,
} from '../../types/provider.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createEmbeddingHandler, type OpenRouterEmbedParams } from './embed.ts';
import type { OpenRouterCompletionsParams, OpenRouterResponsesParams } from './types.ts';

/**
 * Union type for both Completions and Responses API parameter types.
 * Used internally to type the modalities handler.
 */
type OpenRouterLLMParamsUnion = OpenRouterCompletionsParams | OpenRouterResponsesParams;

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
export interface OpenRouterProvider extends Provider<OpenRouterProviderOptions> {
  /**
   * Creates a model reference for the specified model ID.
   *
   * @param modelId - The OpenRouter model identifier in `provider/model` format
   *                  (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet',
   *                  'meta-llama/llama-3.1-70b-instruct')
   * @param options - Optional configuration including API selection
   * @returns A model reference that can be passed to llm()
   */
  (modelId: string, options?: OpenRouterProviderOptions): ModelReference<OpenRouterProviderOptions>;

  /** Provider identifier. Always 'openrouter'. */
  readonly name: 'openrouter';

  /** Semantic version of this provider implementation. */
  readonly version: string;

  /**
   * Supported modalities for this provider.
   * OpenRouter supports LLM (text generation) and Embedding.
   */
  readonly modalities: {
    llm: LLMHandler<OpenRouterLLMParamsUnion>;
    embedding: EmbeddingHandler<OpenRouterEmbedParams>;
  };
}

/**
 * Factory function to create the OpenRouter provider singleton.
 *
 * Creates both Completions and Responses API handlers and manages
 * API mode switching based on the options passed when creating model references.
 *
 * @returns A fully configured OpenRouter provider instance
 * @internal
 */
function createOpenRouterProvider(): OpenRouterProvider {
  let currentApiMode: 'completions' | 'responses' = 'completions';

  const completionsHandler = createCompletionsLLMHandler();
  const responsesHandler = createResponsesLLMHandler();
  const embeddingHandler = createEmbeddingHandler();

  const fn = function (
    modelId: string,
    options?: OpenRouterProviderOptions
  ): ModelReference<OpenRouterProviderOptions> {
    const apiMode = options?.api ?? 'completions';
    currentApiMode = apiMode;
    return { modelId, provider };
  };

  const modalities = {
    get llm(): LLMHandler<OpenRouterLLMParamsUnion> {
      return currentApiMode === 'responses'
        ? (responsesHandler as unknown as LLMHandler<OpenRouterLLMParamsUnion>)
        : (completionsHandler as unknown as LLMHandler<OpenRouterLLMParamsUnion>);
    },
    embedding: embeddingHandler,
  };

  Object.defineProperties(fn, {
    name: {
      value: 'openrouter',
      writable: false,
      configurable: true,
    },
    version: {
      value: '1.0.0',
      writable: false,
      configurable: true,
    },
    modalities: {
      value: modalities,
      writable: false,
      configurable: true,
    },
  });

  const provider = fn as OpenRouterProvider;

  completionsHandler._setProvider?.(provider as unknown as LLMProvider<OpenRouterCompletionsParams>);
  responsesHandler._setProvider?.(provider as unknown as LLMProvider<OpenRouterResponsesParams>);
  embeddingHandler._setProvider?.(provider as unknown as EmbeddingProvider<OpenRouterEmbedParams>);

  return provider;
}

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
export const openrouter = createOpenRouterProvider();

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
