import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * OpenAI provider
 * Supports LLM modality with GPT models
 */
export const openai = createProvider({
  name: 'openai',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

// Re-export types
export type { OpenAILLMParams } from './types.ts';
