import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

/**
 * Ollama provider
 * Supports LLM modality with local Ollama models
 *
 * Ollama is a local LLM server that supports many open-source models including:
 * - Llama 3.x
 * - Mistral
 * - Mixtral
 * - Gemma
 * - Qwen
 * - DeepSeek
 * - Phi
 * - And many more
 *
 * @example
 * ```ts
 * import { llm } from 'provider-protocol';
 * import { ollama } from 'provider-protocol/ollama';
 *
 * const model = llm(ollama('llama3.2'));
 * const result = await model.generate('Hello, how are you?');
 * ```
 *
 * @example Custom server URL
 * ```ts
 * const model = llm(ollama('llama3.2'), {
 *   baseUrl: 'http://my-ollama-server:11434',
 * });
 * ```
 */
export const ollama = createProvider({
  name: 'ollama',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

// Re-export types
export type { OllamaLLMParams } from './types.ts';
