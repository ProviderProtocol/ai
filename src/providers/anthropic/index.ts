import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Anthropic provider
 * Supports LLM modality with Claude models
 */
export const anthropic = createProvider({
  name: 'anthropic',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

// Re-export types
export type { AnthropicLLMParams } from './types.ts';
