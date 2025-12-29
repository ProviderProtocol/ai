import type { Provider, ModelReference } from '../../types/provider.ts';
import { createResponsesLLMHandler } from './llm.responses.ts';
import { createCompletionsLLMHandler } from './llm.completions.ts';

/**
 * OpenAI API mode
 * - 'responses': Uses the new Responses API (default, recommended)
 * - 'completions': Uses the legacy Chat Completions API (for compatibility with LM Studio, etc.)
 */
export type OpenAIAPIMode = 'responses' | 'completions';

/**
 * Options for creating an OpenAI model reference
 */
export interface OpenAIModelOptions {
  /**
   * Which API to use
   * @default 'responses'
   */
  api?: OpenAIAPIMode;
}

/**
 * Extended model reference that includes API mode
 */
export interface OpenAIModelReference extends ModelReference {
  readonly api: OpenAIAPIMode;
}

// Cache providers by API mode to avoid creating new handlers for each call
const providerCache: Map<OpenAIAPIMode, Provider> = new Map();

/**
 * Get or create provider for the specified API mode
 */
function getProvider(api: OpenAIAPIMode): Provider {
  let provider = providerCache.get(api);

  if (!provider) {
    const handler = api === 'responses'
      ? createResponsesLLMHandler()
      : createCompletionsLLMHandler();

    const fn = function (modelId: string): ModelReference {
      return { modelId, provider: provider! };
    };

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
        value: { llm: handler },
        writable: false,
        configurable: true,
      },
    });

    provider = fn as Provider;
    providerCache.set(api, provider);
  }

  return provider;
}

/**
 * OpenAI provider factory
 *
 * Creates model references for OpenAI models. By default uses the new Responses API,
 * but can be configured to use the legacy Chat Completions API for compatibility
 * with OpenAI-compatible services like LM Studio.
 *
 * @example
 * // Default: Uses Responses API (recommended for OpenAI)
 * const gpt = llm({ model: openai('gpt-4o') });
 *
 * @example
 * // Use Chat Completions API (for LM Studio, Ollama, etc.)
 * const local = llm({ model: openai('my-model', { api: 'completions' }) });
 *
 * @param modelId - The model identifier (e.g., 'gpt-4o', 'gpt-4o-mini')
 * @param options - Optional configuration
 * @returns A model reference that can be passed to llm()
 */
export function openai(modelId: string, options?: OpenAIModelOptions): OpenAIModelReference {
  const api = options?.api ?? 'responses';
  const provider = getProvider(api);

  return {
    modelId,
    provider,
    api,
  };
}

// Attach static properties to the function for provider introspection
Object.defineProperties(openai, {
  name: {
    value: 'openai',
    writable: false,
    configurable: true,
  },
});

// Re-export types
export type { OpenAILLMParams } from './types.ts';
