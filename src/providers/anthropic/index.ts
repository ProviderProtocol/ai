import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Anthropic provider instance for the Universal Provider Protocol.
 *
 * Provides access to Claude language models through a unified interface.
 * Currently supports the LLM modality with full streaming, tool use,
 * structured output, and image input capabilities.
 *
 * @example
 * ```typescript
 * import { anthropic } from './providers/anthropic';
 *
 * const claude = anthropic.llm.bind('claude-sonnet-4-20250514');
 * const response = await claude.complete({
 *   messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
 *   config: { apiKey: 'sk-...' },
 * });
 * ```
 *
 * @see {@link AnthropicLLMParams} for provider-specific parameters
 */
export const anthropic = createProvider({
  name: 'anthropic',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

export type { AnthropicLLMParams, AnthropicHeaders } from './types.ts';
