import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Google Gemini provider
 * Supports LLM modality with Gemini models
 */
export const google = createProvider({
  name: 'google',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

// Re-export types
export type { GoogleLLMParams } from './types.ts';
