import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
} from '../../types/provider.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createMessagesLLMHandler } from './llm.messages.ts';
import type { XAICompletionsParams, XAIResponsesParams, XAIMessagesParams, XAIConfig, XAIAPIMode } from './types.ts';

/** Union type for modalities interface */
type XAILLMParamsUnion = XAICompletionsParams | XAIResponsesParams | XAIMessagesParams;

/**
 * xAI provider options
 */
export interface XAIProviderOptions {
  /**
   * Which API to use:
   * - 'completions': Chat Completions API (OpenAI-compatible, default)
   * - 'responses': Responses API (OpenAI Responses-compatible, stateful)
   * - 'messages': Messages API (Anthropic-compatible)
   */
  api?: XAIAPIMode;
}

/**
 * xAI provider with configurable API mode
 *
 * xAI's APIs are compatible with OpenAI and Anthropic SDKs, supporting three API modes:
 * - Chat Completions API (OpenAI-compatible) - default, recommended
 * - Responses API (OpenAI Responses-compatible) - stateful conversations
 * - Messages API (Anthropic-compatible) - for migration from Anthropic
 *
 * @example
 * // Using the Chat Completions API (default)
 * const model = xai('grok-4');
 *
 * @example
 * // Using the Responses API (stateful)
 * const model = xai('grok-4', { api: 'responses' });
 *
 * @example
 * // Using the Messages API (Anthropic-compatible)
 * const model = xai('grok-4', { api: 'messages' });
 */
export interface XAIProvider extends Provider<XAIProviderOptions> {
  /**
   * Create a model reference
   * @param modelId - The model identifier (e.g., 'grok-4', 'grok-4.1-fast', 'grok-3-mini')
   * @param options - Provider options including API selection
   */
  (modelId: string, options?: XAIProviderOptions): ModelReference<XAIProviderOptions>;

  /** Provider name */
  readonly name: 'xai';

  /** Provider version */
  readonly version: string;

  /** Supported modalities */
  readonly modalities: {
    llm: LLMHandler<XAILLMParamsUnion>;
  };
}

/**
 * Create the xAI provider
 */
function createXAIProvider(): XAIProvider {
  // Track which API mode is currently active for the modalities
  // Default to 'completions' (recommended for most use cases)
  let currentApiMode: XAIAPIMode = 'completions';

  // Create handlers eagerly so we can inject provider reference
  const completionsHandler = createCompletionsLLMHandler();
  const responsesHandler = createResponsesLLMHandler();
  const messagesHandler = createMessagesLLMHandler();

  const fn = function (
    modelId: string,
    options?: XAIProviderOptions
  ): ModelReference<XAIProviderOptions> {
    const apiMode = options?.api ?? 'completions';
    currentApiMode = apiMode;
    return { modelId, provider };
  };

  // Create a dynamic modalities object that returns the correct handler
  const modalities = {
    get llm(): LLMHandler<XAILLMParamsUnion> {
      switch (currentApiMode) {
        case 'responses':
          return responsesHandler as unknown as LLMHandler<XAILLMParamsUnion>;
        case 'messages':
          return messagesHandler as unknown as LLMHandler<XAILLMParamsUnion>;
        case 'completions':
        default:
          return completionsHandler as unknown as LLMHandler<XAILLMParamsUnion>;
      }
    },
  };

  // Define properties
  Object.defineProperties(fn, {
    name: {
      value: 'xai',
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

  const provider = fn as XAIProvider;

  // Inject provider reference into all handlers (spec compliance)
  completionsHandler._setProvider?.(provider as unknown as LLMProvider<XAICompletionsParams>);
  responsesHandler._setProvider?.(provider as unknown as LLMProvider<XAIResponsesParams>);
  messagesHandler._setProvider?.(provider as unknown as LLMProvider<XAIMessagesParams>);

  return provider;
}

/**
 * xAI provider
 *
 * Supports three API modes:
 * - Chat Completions API (default, OpenAI-compatible)
 * - Responses API (stateful, OpenAI Responses-compatible)
 * - Messages API (Anthropic-compatible)
 *
 * xAI's Grok models support:
 * - Real-time search via Live Search API (deprecated Dec 2025) or Agent Tools API
 * - Reasoning with `reasoning_effort` parameter (for Grok 3 Mini)
 * - Tool/function calling
 * - Image input
 * - Streaming responses
 * - Structured output (JSON mode)
 *
 * @example
 * ```ts
 * import { xai } from './providers/xai';
 * import { llm } from './core/llm';
 *
 * // Using Chat Completions API (default, recommended)
 * const model = llm({
 *   model: xai('grok-4'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Using Responses API (stateful conversations)
 * const statefulModel = llm({
 *   model: xai('grok-4', { api: 'responses' }),
 *   params: {
 *     max_output_tokens: 1000,
 *     store: true, // Enable stateful storage
 *   }
 * });
 *
 * // Continue a previous conversation
 * const continuedModel = llm({
 *   model: xai('grok-4', { api: 'responses' }),
 *   params: {
 *     previous_response_id: 'resp_123...',
 *   }
 * });
 *
 * // Using Messages API (Anthropic-compatible)
 * const anthropicModel = llm({
 *   model: xai('grok-4', { api: 'messages' }),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Using reasoning effort (Grok 3 Mini only)
 * const reasoningModel = llm({
 *   model: xai('grok-3-mini'),
 *   params: {
 *     max_tokens: 1000,
 *     reasoning_effort: 'high', // 'low' or 'high'
 *   }
 * });
 *
 * // Using Live Search (deprecated Dec 2025)
 * const searchModel = llm({
 *   model: xai('grok-4'),
 *   params: {
 *     max_tokens: 1000,
 *     search_parameters: {
 *       mode: 'auto',
 *       sources: ['web', 'x', 'news'],
 *     }
 *   }
 * });
 *
 * // Generate
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 */
export const xai = createXAIProvider();

// Re-export types
export type {
  XAICompletionsParams,
  XAIResponsesParams,
  XAIMessagesParams,
  XAIConfig,
  XAIAPIMode,
  XAIModelOptions,
  XAIModelReference,
  XAISearchParameters,
  XAIAgentTool,
} from './types.ts';
