/**
 * @fileoverview OpenResponses Provider
 *
 * Implements support for the OpenResponses specification - an open-source,
 * multi-provider standard for interoperable LLM interfaces.
 *
 * The OpenResponses provider allows connecting to any server implementing
 * the OpenResponses API specification, including OpenAI, OpenRouter,
 * and self-hosted implementations.
 *
 * @see {@link https://www.openresponses.org OpenResponses Specification}
 * @module providers/responses
 */

import type { Provider, ModelReference, ProviderConfig } from '../../types/provider.ts';
import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';
import type { ResponsesProviderOptions } from './types.ts';

/**
 * Extended config interface that includes the internal responses context.
 */
interface ResponsesProviderConfig extends ProviderConfig {
  _responsesContext?: {
    host: string;
    apiKeyEnv: string;
  };
}

/**
 * Type alias for the OpenResponses provider with its options.
 */
export type ResponsesProvider = Provider<ResponsesProviderOptions>;

/**
 * OpenResponses provider singleton.
 *
 * Implements the OpenResponses specification for multi-provider, interoperable
 * LLM interfaces. This provider works with any server implementing the
 * OpenResponses API, including:
 *
 * - OpenAI (`https://api.openai.com/v1`)
 * - OpenRouter (`https://openrouter.ai/api/v1`)
 * - Self-hosted servers
 * - Any OpenResponses-compatible endpoint
 *
 * @example Using with OpenAI
 * ```typescript
 * import { responses } from './providers/responses';
 * import { llm } from './core/llm';
 *
 * const model = llm({
 *   model: responses('gpt-5.2', { host: 'https://api.openai.com/v1' }),
 *   params: { max_output_tokens: 1000 }
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Using with OpenRouter
 * ```typescript
 * const model = llm({
 *   model: responses('openai/gpt-4o', {
 *     host: 'https://openrouter.ai/api/v1',
 *     apiKeyEnv: 'OPENROUTER_API_KEY'
 *   }),
 *   params: { max_output_tokens: 1000 }
 * });
 * ```
 *
 * @example Using with a self-hosted server
 * ```typescript
 * const model = llm({
 *   model: responses('llama-3.3-70b', {
 *     host: 'http://localhost:8080/v1',
 *     apiKeyEnv: 'LOCAL_API_KEY'
 *   }),
 *   params: { max_output_tokens: 1000 }
 * });
 * ```
 *
 * @see {@link https://www.openresponses.org OpenResponses Specification}
 */
export const responses = createProvider<ResponsesProviderOptions>({
  name: 'responses',
  version: '1.0.0',
  handlers: {
    llm: createLLMHandler(),
  },
  createModelReference: (
    modelId: string,
    options: ResponsesProviderOptions | undefined,
    provider: Provider<ResponsesProviderOptions>
  ): ModelReference<ResponsesProviderOptions> => {
    if (!options?.host) {
      throw new Error(
        'OpenResponses provider requires a host option. Usage: responses("model-id", { host: "https://api.example.com/v1" })'
      );
    }

    const providerConfig: ResponsesProviderConfig = {
      _responsesContext: {
        host: options.host,
        apiKeyEnv: options.apiKeyEnv ?? 'OPENRESPONSES_API_KEY',
      },
    };

    return {
      modelId,
      provider,
      options,
      providerConfig,
    };
  },
}) as ResponsesProvider;

export type {
  ResponsesProviderOptions,
  ResponsesParams,
  ResponsesRequest,
  ResponsesResponse,
  ResponsesStreamEvent,
  ResponsesUsage,
  ResponsesInputItem,
  ResponsesOutputItem,
  ResponsesContentPart,
  ResponsesFunctionTool,
  ResponsesBuiltInTool,
  ResponsesToolUnion,
  ResponsesHeaders,
} from './types.ts';
