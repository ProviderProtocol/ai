import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';
import type { Provider, ModelReference, ProviderConfig } from '../../types/provider.ts';
import type { BetaValue, AnthropicLLMParams } from './types.ts';

/**
 * Options for configuring an Anthropic model reference.
 *
 * @example
 * ```typescript
 * import { anthropic, betas } from 'provider-protocol/anthropic';
 *
 * // Enable structured outputs beta
 * const model = anthropic('claude-sonnet-4-20250514', {
 *   betas: [betas.structuredOutputs],
 * });
 *
 * // Enable multiple betas
 * const modelWithBetas = anthropic('claude-sonnet-4-20250514', {
 *   betas: [betas.structuredOutputs, betas.interleavedThinking],
 * });
 *
 * // Use string values for new/unlisted betas
 * const modelWithCustomBeta = anthropic('claude-sonnet-4-20250514', {
 *   betas: ['new-beta-2025-12-01'],
 * });
 * ```
 */
export interface AnthropicModelOptions {
  /**
   * Beta features to enable for this model.
   *
   * Use values from the `betas` export or pass arbitrary strings for new betas.
   * Multiple betas are combined into a comma-separated `anthropic-beta` header.
   */
  betas?: BetaValue[];
}

/**
 * Creates provider config from Anthropic model options.
 *
 * @param options - The model options containing betas
 * @returns Partial provider config with anthropic-beta header if betas provided
 */
function createProviderConfig(options?: AnthropicModelOptions): Partial<ProviderConfig> | undefined {
  if (!options?.betas || options.betas.length === 0) {
    return undefined;
  }

  // Combine betas into comma-separated header value
  const betaHeader = options.betas.join(',');

  return {
    headers: {
      'anthropic-beta': betaHeader,
    },
  };
}

// Create the base provider
const baseProvider = createProvider<AnthropicModelOptions>({
  name: 'anthropic',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

/**
 * Anthropic provider for the Universal Provider Protocol.
 *
 * Provides access to Claude language models through a unified interface.
 * Supports LLM modality with streaming, tool use, structured output,
 * and image input capabilities.
 *
 * @param modelId - The model identifier (e.g., 'claude-sonnet-4-20250514')
 * @param options - Optional configuration including beta features
 * @returns A model reference for use with `llm()`
 *
 * @example
 * ```typescript
 * import { anthropic, betas } from 'provider-protocol/anthropic';
 * import { llm } from 'provider-protocol';
 *
 * // Basic usage
 * const model = llm({ model: anthropic('claude-sonnet-4-20250514') });
 *
 * // With structured outputs beta
 * const modelWithBetas = llm({
 *   model: anthropic('claude-sonnet-4-20250514', {
 *     betas: [betas.structuredOutputs],
 *   }),
 *   structure: { properties: { name: { type: 'string' } } },
 * });
 *
 * // With multiple betas
 * const advancedModel = llm({
 *   model: anthropic('claude-sonnet-4-20250514', {
 *     betas: [betas.structuredOutputs, betas.tokenEfficientTools],
 *   }),
 * });
 * ```
 *
 * @see {@link betas} for available beta features
 * @see {@link AnthropicLLMParams} for provider-specific parameters
 */
function anthropicFactory(modelId: string, options?: AnthropicModelOptions): ModelReference<AnthropicModelOptions> {
  const providerConfig = createProviderConfig(options);
  return {
    modelId,
    provider: anthropic,
    ...(providerConfig && { providerConfig }),
  };
}

// Define properties on the factory function
Object.defineProperties(anthropicFactory, {
  name: {
    value: baseProvider.name,
    writable: false,
    configurable: true,
  },
  version: {
    value: baseProvider.version,
    writable: false,
    configurable: true,
  },
  modalities: {
    value: baseProvider.modalities,
    writable: false,
    configurable: true,
  },
});

export const anthropic = anthropicFactory as Provider<AnthropicModelOptions>;

export { tools, betas } from './types.ts';
export type { BetaKey, BetaValue } from './types.ts';
export type {
  AnthropicLLMParams,
  AnthropicHeaders,
  AnthropicBuiltInTool,
  AnthropicWebSearchTool,
  AnthropicComputerTool,
  AnthropicTextEditorTool,
  AnthropicBashTool,
  AnthropicCodeExecutionTool,
  AnthropicToolSearchTool,
  AnthropicUserLocation,
  AnthropicOutputFormat,
} from './types.ts';
