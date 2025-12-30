import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
} from '../../types/provider.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import type { OpenRouterLLMParams, OpenRouterConfig } from './types.ts';

/**
 * OpenRouter provider options
 */
export interface OpenRouterProviderOptions {
  /**
   * Which API to use:
   * - 'completions': Chat Completions API (default, recommended)
   * - 'responses': Responses API (beta)
   */
  api?: 'completions' | 'responses';
}

/**
 * OpenRouter provider with configurable API mode
 *
 * @example
 * // Using the Chat Completions API (default)
 * const model = openrouter('openai/gpt-4o');
 *
 * @example
 * // Using the Responses API (beta)
 * const model = openrouter('openai/gpt-4o', { api: 'responses' });
 *
 * @example
 * // Explicit Completions API
 * const model = openrouter('anthropic/claude-3.5-sonnet', { api: 'completions' });
 */
export interface OpenRouterProvider extends Provider<OpenRouterProviderOptions> {
  /**
   * Create a model reference
   * @param modelId - The model identifier (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct')
   * @param options - Provider options including API selection
   */
  (modelId: string, options?: OpenRouterProviderOptions): ModelReference<OpenRouterProviderOptions>;

  /** Provider name */
  readonly name: 'openrouter';

  /** Provider version */
  readonly version: string;

  /** Supported modalities */
  readonly modalities: {
    llm: LLMHandler<OpenRouterLLMParams>;
  };
}

/**
 * Create the OpenRouter provider
 */
function createOpenRouterProvider(): OpenRouterProvider {
  // Track which API mode is currently active for the modalities
  // Default to 'completions' (unlike OpenAI which defaults to 'responses')
  let currentApiMode: 'completions' | 'responses' = 'completions';

  // Create handlers eagerly so we can inject provider reference
  const completionsHandler = createCompletionsLLMHandler();
  const responsesHandler = createResponsesLLMHandler();

  const fn = function (
    modelId: string,
    options?: OpenRouterProviderOptions
  ): ModelReference<OpenRouterProviderOptions> {
    const apiMode = options?.api ?? 'completions';
    currentApiMode = apiMode;
    return { modelId, provider };
  };

  // Create a dynamic modalities object that returns the correct handler
  const modalities = {
    get llm(): LLMHandler<OpenRouterLLMParams> {
      return currentApiMode === 'responses'
        ? responsesHandler
        : completionsHandler;
    },
  };

  // Define properties
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

  // Inject provider reference into both handlers (spec compliance)
  completionsHandler._setProvider?.(provider as unknown as LLMProvider<OpenRouterLLMParams>);
  responsesHandler._setProvider?.(provider as unknown as LLMProvider<OpenRouterLLMParams>);

  return provider;
}

/**
 * OpenRouter provider
 *
 * Supports both the Chat Completions API (default) and Responses API (beta).
 *
 * OpenRouter is a unified API that provides access to hundreds of AI models
 * through a single endpoint, including models from OpenAI, Anthropic, Google,
 * Meta, Mistral, and many others.
 *
 * @example
 * ```ts
 * import { openrouter } from './providers/openrouter';
 * import { llm } from './core/llm';
 *
 * // Using Chat Completions API (default, recommended)
 * const model = llm({
 *   model: openrouter('openai/gpt-4o'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Using Responses API (beta)
 * const betaModel = llm({
 *   model: openrouter('openai/gpt-4o', { api: 'responses' }),
 *   params: { max_output_tokens: 1000 }
 * });
 *
 * // Using OpenRouter-specific features
 * const routedModel = llm({
 *   model: openrouter('openai/gpt-4o'),
 *   params: {
 *     max_tokens: 1000,
 *     // Fallback routing
 *     models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
 *     route: 'fallback',
 *     // Provider preferences
 *     provider: {
 *       allow_fallbacks: true,
 *       require_parameters: true,
 *     },
 *   }
 * });
 *
 * // Generate
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 */
export const openrouter = createOpenRouterProvider();

// Re-export types
export type {
  OpenRouterLLMParams,
  OpenRouterConfig,
  OpenRouterAPIMode,
  OpenRouterModelOptions,
  OpenRouterModelReference,
  OpenRouterProviderPreferences,
} from './types.ts';
