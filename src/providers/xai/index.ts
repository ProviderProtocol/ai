import type {
  Provider,
  ModelReference,
  LLMHandler,
  LLMProvider,
  ImageProvider,
} from '../../types/provider.ts';
import type { ImageHandler } from '../../types/image.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createMessagesLLMHandler } from './llm.messages.ts';
import { createImageHandler, type XAIImageParams } from './image.ts';
import type { XAICompletionsParams, XAIResponsesParams, XAIMessagesParams, XAIConfig, XAIAPIMode } from './types.ts';

/**
 * Union type for LLM parameters across all xAI API modes.
 * This type enables the provider to handle parameters from any of the three APIs.
 */
type XAILLMParamsUnion = XAICompletionsParams | XAIResponsesParams | XAIMessagesParams;

/**
 * Configuration options for creating xAI model references.
 */
export interface XAIProviderOptions {
  /**
   * The API mode to use for this model.
   *
   * - `'completions'`: Chat Completions API (OpenAI-compatible, default, recommended)
   * - `'responses'`: Responses API (OpenAI Responses-compatible, supports stateful conversations)
   * - `'messages'`: Messages API (Anthropic-compatible, for easy migration from Anthropic)
   *
   * @default 'completions'
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
    image: ImageHandler<XAIImageParams>;
  };
}

/**
 * Creates the xAI provider instance with support for all three API modes.
 *
 * @returns The configured xAI provider
 */
function createXAIProvider(): XAIProvider {
  let currentApiMode: XAIAPIMode = 'completions';

  const completionsHandler = createCompletionsLLMHandler();
  const responsesHandler = createResponsesLLMHandler();
  const messagesHandler = createMessagesLLMHandler();
  const imageHandler = createImageHandler();

  const fn = function (
    modelId: string,
    options?: XAIProviderOptions
  ): ModelReference<XAIProviderOptions> {
    const apiMode = options?.api ?? 'completions';
    currentApiMode = apiMode;
    return { modelId, provider };
  };

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
    image: imageHandler,
  };

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

  completionsHandler._setProvider?.(provider as unknown as LLMProvider<XAICompletionsParams>);
  responsesHandler._setProvider?.(provider as unknown as LLMProvider<XAIResponsesParams>);
  messagesHandler._setProvider?.(provider as unknown as LLMProvider<XAIMessagesParams>);
  imageHandler._setProvider?.(provider as unknown as ImageProvider<XAIImageParams>);

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

// Re-export tools and types
export { tools } from './types.ts';
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
  XAIHeaders,
  XAIBuiltInTool,
  XAIWebSearchTool,
  XAIXSearchTool,
  XAICodeExecutionTool,
  XAIFileSearchTool,
  XAIMcpTool,
  XAIServerSideToolUsage,
} from './types.ts';

export type { XAIImageParams } from './image.ts';
