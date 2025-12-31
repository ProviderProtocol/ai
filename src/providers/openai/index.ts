import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
} from '../../types/provider.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import type { OpenAICompletionsParams, OpenAIResponsesParams, OpenAIConfig } from './types.ts';

/** Union type for modalities interface */
type OpenAILLMParamsUnion = OpenAICompletionsParams | OpenAIResponsesParams;

/**
 * OpenAI provider options
 */
export interface OpenAIProviderOptions {
  /**
   * Which API to use:
   * - 'responses': Modern Responses API (default, recommended)
   * - 'completions': Legacy Chat Completions API
   */
  api?: 'responses' | 'completions';
}

/**
 * OpenAI provider with configurable API mode
 *
 * @example
 * // Using the modern Responses API (default)
 * const model = openai('gpt-4o');
 *
 * @example
 * // Using the legacy Chat Completions API
 * const model = openai('gpt-4o', { api: 'completions' });
 *
 * @example
 * // Explicit Responses API
 * const model = openai('gpt-4o', { api: 'responses' });
 */
export interface OpenAIProvider extends Provider<OpenAIProviderOptions> {
  /**
   * Create a model reference
   * @param modelId - The model identifier (e.g., 'gpt-4o', 'gpt-4-turbo', 'o1-preview')
   * @param options - Provider options including API selection
   */
  (modelId: string, options?: OpenAIProviderOptions): ModelReference<OpenAIProviderOptions>;

  /** Provider name */
  readonly name: 'openai';

  /** Provider version */
  readonly version: string;

  /** Supported modalities */
  readonly modalities: {
    llm: LLMHandler<OpenAILLMParamsUnion>;
  };
}

/**
 * Create the OpenAI provider
 */
function createOpenAIProvider(): OpenAIProvider {
  // Track which API mode is currently active for the modalities
  let currentApiMode: 'responses' | 'completions' = 'responses';

  // Create handlers eagerly so we can inject provider reference
  const responsesHandler = createResponsesLLMHandler();
  const completionsHandler = createCompletionsLLMHandler();

  const fn = function (
    modelId: string,
    options?: OpenAIProviderOptions
  ): ModelReference<OpenAIProviderOptions> {
    const apiMode = options?.api ?? 'responses';
    currentApiMode = apiMode;
    return { modelId, provider };
  };

  // Create a dynamic modalities object that returns the correct handler
  const modalities = {
    get llm(): LLMHandler<OpenAILLMParamsUnion> {
      return currentApiMode === 'completions'
        ? (completionsHandler as unknown as LLMHandler<OpenAILLMParamsUnion>)
        : (responsesHandler as unknown as LLMHandler<OpenAILLMParamsUnion>);
    },
  };

  // Define properties
  Object.defineProperties(fn, {
    name: {
      value: 'openai',
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

  const provider = fn as OpenAIProvider;

  // Inject provider reference into both handlers (spec compliance)
  responsesHandler._setProvider?.(provider as unknown as LLMProvider<OpenAIResponsesParams>);
  completionsHandler._setProvider?.(provider as unknown as LLMProvider<OpenAICompletionsParams>);

  return provider;
}

/**
 * OpenAI provider
 *
 * Supports both the modern Responses API (default) and legacy Chat Completions API.
 *
 * @example
 * ```ts
 * import { openai } from './providers/openai';
 * import { llm } from './core/llm';
 *
 * // Using Responses API (default, modern, recommended)
 * const model = llm({
 *   model: openai('gpt-4o'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Using Chat Completions API (legacy)
 * const legacyModel = llm({
 *   model: openai('gpt-4o', { api: 'completions' }),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Generate
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 */
export const openai = createOpenAIProvider();

// Re-export types
export type {
  OpenAICompletionsParams,
  OpenAIResponsesParams,
  OpenAIConfig,
  OpenAIAPIMode,
  OpenAIModelOptions,
  OpenAIModelReference,
} from './types.ts';
