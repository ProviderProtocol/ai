/**
 * @fileoverview Google Vertex AI provider for the Universal Provider Protocol.
 *
 * Supports multiple AI model endpoints:
 * - Gemini (native): Google's Generative AI models
 * - Claude (partner): Anthropic models via rawPredict
 * - Mistral (partner): Mistral models via rawPredict
 * - MaaS (OpenAI-compatible): DeepSeek, gpt-oss, etc.
 *
 * ## Authentication
 *
 * Two authentication methods are supported:
 *
 * **Express Mode (API Key)** - Set `VERTEX_API_KEY` environment variable.
 * Only usable for Gemini models, or other models if specified in the Vertex AI documentation.
 * Uses the global endpoint: `aiplatform.googleapis.com`
 *
 * **OAuth (Access Token)** - Set `GOOGLE_ACCESS_TOKEN` and `GOOGLE_CLOUD_PROJECT`.
 * Works with all endpoints. Optionally set `GOOGLE_CLOUD_LOCATION` (defaults to `global`).
 *
 * The provider automatically selects API key authentication when `VERTEX_API_KEY` is set,
 * falling back to OAuth otherwise.
 *
 * @example Gemini (default)
 * ```typescript
 * import { vertex } from '@providerprotocol/ai/vertex';
 * import { llm } from '@providerprotocol/ai';
 *
 * const gemini = llm({
 *   model: vertex('gemini-3-flash-preview'),
 * });
 * ```
 *
 * @example Claude via Vertex
 * ```typescript
 * const claude = llm({
 *   model: vertex('claude-sonnet-4-5@20250929', { endpoint: 'claude' }),
 *   config: { location: 'global' },
 *   params: { max_tokens: 1024 },
 * });
 * ```
 *
 * @example Mistral via Vertex
 * ```typescript
 * const mistral = llm({
 *   model: vertex('mistral-medium-3', { endpoint: 'mistral' }),
 * });
 * ```
 *
 * @example DeepSeek/MaaS via Vertex
 * ```typescript
 * const deepseek = llm({
 *   model: vertex('deepseek-ai/deepseek-r1-0528-maas', { endpoint: 'maas' }),
 * });
 * ```
 */

import type {
  Provider,
  ModelReference,
  LLMProvider,
} from '../../types/provider.ts';
import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult } from '../../types/llm.ts';
import { createGeminiLLMHandler } from './llm.gemini.ts';
import { createClaudeLLMHandler } from './llm.claude.ts';
import { createMistralLLMHandler } from './llm.mistral.ts';
import { createMaaSLLMHandler } from './llm.maas.ts';
import type {
  VertexProviderOptions,
  VertexEndpoint,
  VertexGeminiParams,
  VertexClaudeParams,
  VertexMistralParams,
  VertexMaaSParams,
} from './types.ts';
import { cache } from './cache.ts';

/**
 * Union type for all Vertex AI parameter types.
 */
export type VertexLLMParams =
  | VertexGeminiParams
  | VertexClaudeParams
  | VertexMistralParams
  | VertexMaaSParams;

/**
 * Extended model reference that includes endpoint information.
 *
 * This is used internally to preserve the endpoint selection made when
 * creating the model reference, ensuring static capability resolution.
 */
interface VertexModelReference extends ModelReference<VertexProviderOptions> {
  readonly endpoint: VertexEndpoint;
}

/**
 * Vertex AI provider interface with configurable endpoint selection.
 *
 * Vertex AI provides access to multiple AI model families through Google Cloud:
 * - Native Gemini models with full feature support
 * - Partner models (Claude, Mistral) via rawPredict endpoints
 * - MaaS models (DeepSeek, gpt-oss) via OpenAI-compatible endpoints
 */
export interface VertexProvider extends Provider<VertexProviderOptions> {
  /**
   * Creates a model reference for the specified model ID.
   *
   * @param modelId - The model identifier
   *   - Gemini: `gemini-3-flash-preview`, `gemini-2.5-pro`, etc.
   *   - Claude: `claude-sonnet-4-5@20250929`, `claude-haiku-4-5@20251001`, etc.
   *   - Mistral: `mistral-medium-3`, `mistral-small-2503`, `codestral-2`, etc.
   *   - MaaS: `deepseek-ai/deepseek-r1-0528-maas`, `openai/gpt-oss-120b-maas`, etc.
   * @param options - Endpoint selection and configuration
   * @returns A model reference for use with llm()
   */
  (modelId: string, options?: VertexProviderOptions): VertexModelReference;

  /** Provider identifier. Always 'vertex'. */
  readonly name: 'vertex';

  /** Semantic version of this provider implementation. */
  readonly version: string;

  /**
   * Supported modalities.
   * LLM handler delegates to endpoint-specific handlers based on the model's endpoint.
   */
  readonly modalities: {
    llm: LLMHandler<VertexLLMParams>;
  };

  /**
   * Cache utilities for Gemini models.
   *
   * @see {@link cache} for detailed documentation
   */
  readonly cache: typeof cache;
}

/**
 * Registry for tracking model endpoint associations.
 *
 * Maps modelId to endpoint for lookup during handler binding.
 * Uses WeakRef-like pattern to avoid memory leaks in long-running processes.
 */
const modelEndpointRegistry = new Map<string, VertexEndpoint>();

/**
 * Common interface for bound LLM models, abstracting away the parameter type.
 * This allows us to work with any endpoint's bound model without union type issues.
 */
interface BoundModelProxy {
  readonly modelId: string;
  readonly capabilities: import('../../types/llm.ts').LLMCapabilities;
  complete(request: LLMRequest<VertexLLMParams>): Promise<LLMResponse>;
  stream(request: LLMRequest<VertexLLMParams>): LLMStreamResult;
}

/**
 * Creates a proxy that adapts a typed BoundLLMModel to the common interface.
 */
function createBoundModelProxy<TParams>(
  model: BoundLLMModel<TParams>
): BoundModelProxy {
  return {
    modelId: model.modelId,
    capabilities: model.capabilities,
    complete(request: LLMRequest<VertexLLMParams>): Promise<LLMResponse> {
      return model.complete(request as LLMRequest<TParams>);
    },
    stream(request: LLMRequest<VertexLLMParams>): LLMStreamResult {
      return model.stream(request as LLMRequest<TParams>);
    },
  };
}

/**
 * Creates a unified LLM handler that delegates to endpoint-specific handlers.
 *
 * This handler resolves the appropriate endpoint handler at bind time based
 * on the model's registered endpoint, ensuring capabilities are static for
 * each bound model instance.
 */
function createUnifiedLLMHandler(
  geminiHandler: LLMHandler<VertexGeminiParams>,
  claudeHandler: LLMHandler<VertexClaudeParams>,
  mistralHandler: LLMHandler<VertexMistralParams>,
  maasHandler: LLMHandler<VertexMaaSParams>,
  getProvider: () => LLMProvider<VertexLLMParams>
): LLMHandler<VertexLLMParams> {
  return {
    bind(modelId: string): BoundLLMModel<VertexLLMParams> {
      const endpoint = modelEndpointRegistry.get(modelId) ?? 'gemini';

      let proxy: BoundModelProxy;

      switch (endpoint) {
        case 'claude':
          proxy = createBoundModelProxy(claudeHandler.bind(modelId));
          break;
        case 'mistral':
          proxy = createBoundModelProxy(mistralHandler.bind(modelId));
          break;
        case 'maas':
          proxy = createBoundModelProxy(maasHandler.bind(modelId));
          break;
        case 'gemini':
        default:
          proxy = createBoundModelProxy(geminiHandler.bind(modelId));
          break;
      }

      return {
        modelId: proxy.modelId,
        capabilities: proxy.capabilities,

        get provider(): LLMProvider<VertexLLMParams> {
          return getProvider();
        },

        complete(request: LLMRequest<VertexLLMParams>): Promise<LLMResponse> {
          return proxy.complete(request);
        },

        stream(request: LLMRequest<VertexLLMParams>): LLMStreamResult {
          return proxy.stream(request);
        },
      };
    },

    _setProvider(provider: LLMProvider<VertexLLMParams>): void {
      geminiHandler._setProvider?.(provider as LLMProvider<VertexGeminiParams>);
      claudeHandler._setProvider?.(provider as LLMProvider<VertexClaudeParams>);
      mistralHandler._setProvider?.(provider as LLMProvider<VertexMistralParams>);
      maasHandler._setProvider?.(provider as LLMProvider<VertexMaaSParams>);
    },
  };
}

/**
 * Factory function to create the Vertex AI provider singleton.
 */
function createVertexProvider(): VertexProvider {
  const geminiHandler = createGeminiLLMHandler();
  const claudeHandler = createClaudeLLMHandler();
  const mistralHandler = createMistralLLMHandler();
  const maasHandler = createMaaSLLMHandler();

  let providerRef: VertexProvider;

  const unifiedHandler = createUnifiedLLMHandler(
    geminiHandler,
    claudeHandler,
    mistralHandler,
    maasHandler,
    () => providerRef as LLMProvider<VertexLLMParams>
  );

  const fn = function (
    modelId: string,
    options?: VertexProviderOptions
  ): VertexModelReference {
    const endpoint = options?.endpoint ?? 'gemini';
    modelEndpointRegistry.set(modelId, endpoint);
    return { modelId, provider: providerRef, endpoint };
  };

  const modalities: { llm: LLMHandler<VertexLLMParams> } = {
    llm: unifiedHandler,
  };

  Object.defineProperties(fn, {
    name: {
      value: 'vertex',
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
    cache: {
      value: cache,
      writable: false,
      configurable: true,
    },
  });

  providerRef = fn as VertexProvider;

  unifiedHandler._setProvider?.(providerRef as LLMProvider<VertexLLMParams>);

  return providerRef;
}

/**
 * Vertex AI provider singleton.
 *
 * Google Vertex AI is a fully managed AI platform that provides access to
 * multiple AI model families through a unified API:
 *
 * **Gemini (Native)**
 * - Full support for Gemini models with all features
 * - Multimodal input (text, images, audio, video)
 * - Function calling, structured output, thinking
 *
 * **Claude (Partner)**
 * - Anthropic Claude models via rawPredict
 * - Near-identical to native Anthropic API
 * - Supports vision, tools, extended thinking
 *
 * **Mistral (Partner)**
 * - Mistral models via rawPredict
 * - OpenAI-compatible format
 * - Function calling, JSON mode
 *
 * **MaaS (Model-as-a-Service)**
 * - DeepSeek, gpt-oss, and other open models
 * - OpenAI-compatible chat/completions endpoint
 * - Supports reasoning/thinking mode for DeepSeek R1
 *
 * @example Basic Gemini usage
 * ```typescript
 * import { vertex } from 'provider-protocol/vertex';
 * import { llm } from 'provider-protocol';
 *
 * const model = llm({
 *   model: vertex('gemini-3-flash-preview'),
 *   config: {
 *     projectId: 'my-project',
 *     apiKey: process.env.GOOGLE_ACCESS_TOKEN,
 *   },
 *   params: { maxOutputTokens: 2048 },
 * });
 *
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Using Claude on Vertex
 * ```typescript
 * const claude = llm({
 *   model: vertex('claude-sonnet-4-5@20250929', { endpoint: 'claude' }),
 *   config: { projectId: 'my-project' },
 *   params: { max_tokens: 1024, temperature: 0.7 },
 * });
 * ```
 *
 * @example Using DeepSeek on Vertex
 * ```typescript
 * const deepseek = llm({
 *   model: vertex('deepseek-ai/deepseek-r1-0528-maas', { endpoint: 'maas' }),
 *   config: {
 *     projectId: 'my-project',
 *     location: 'us-central1',
 *   },
 *   params: { thinking: { type: 'enabled' } },
 * });
 * ```
 */
export const vertex = createVertexProvider();

export { cache } from './cache.ts';
export type {
  VertexCacheCreateOptions,
  VertexCacheListOptions,
  VertexCacheOptions,
} from './cache.ts';

export {
  vertexTools,
  googleSearchTool,
  codeExecutionTool,
  urlContextTool,
  googleMapsTool,
  enterpriseWebSearchTool,
  vertexAiSearchTool,
} from './types.ts';

export type {
  VertexProviderOptions,
  VertexEndpoint,
  VertexGeminiParams,
  VertexGeminiToolConfig,
  VertexClaudeParams,
  VertexClaudeCacheControl,
  VertexMistralParams,
  VertexMaaSParams,
  VertexAuthConfig,
  VertexHeaders,
  VertexCacheCreateRequest,
  VertexCacheResponse,
  VertexCacheUpdateRequest,
  VertexCacheListResponse,
  VertexGoogleSearchTool,
  VertexCodeExecutionTool,
  VertexUrlContextTool,
  VertexGoogleMapsTool,
  VertexEnterpriseWebSearchTool,
  VertexAISearchTool,
  VertexGeminiBuiltInTool,
  VertexRetrievalConfig,
} from './types.ts';
