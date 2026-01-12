import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';
import { createEmbeddingHandler } from './embed.ts';

/**
 * Ollama provider for local LLM inference.
 *
 * Ollama runs models locally on your machine, eliminating the need for API keys
 * and external network calls. This makes it ideal for development, testing,
 * and privacy-sensitive applications.
 *
 * **Supported Models:**
 * - Llama 3.x (Meta's latest open-weight models)
 * - Mistral / Mixtral (Mistral AI's efficient models)
 * - Gemma (Google's lightweight models)
 * - Qwen (Alibaba's multilingual models)
 * - DeepSeek (DeepSeek's code and reasoning models)
 * - Phi (Microsoft's small language models)
 * - CodeLlama (Code-specialized Llama variants)
 * - And many more from the Ollama model library
 *
 * **Prerequisites:**
 * 1. Install Ollama from https://ollama.ai
 * 2. Pull a model: `ollama pull llama3.2`
 * 3. Ensure Ollama is running (default: http://localhost:11434)
 *
 * **Note on Tool Calling:**
 * For tool/function calling, Ollama recommends using their OpenAI-compatible
 * API endpoint. Use the OpenAI provider with `baseUrl` pointed to Ollama instead.
 *
 * @example Basic usage with local model
 * ```typescript
 * import { llm } from 'provider-protocol';
 * import { ollama } from 'provider-protocol/ollama';
 *
 * const model = llm({ model: ollama('llama3.2') });
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Custom Ollama server URL
 * ```typescript
 * import { llm } from 'provider-protocol';
 * import { ollama } from 'provider-protocol/ollama';
 *
 * const model = llm({
 *   model: ollama('llama3.2'),
 *   config: { baseUrl: 'http://my-ollama-server:11434' },
 * });
 * ```
 *
 * @example Streaming responses
 * ```typescript
 * const model = llm({ model: ollama('llama3.2') });
 * const stream = model.stream('Write a poem');
 *
 * for await (const event of stream) {
 *   if (event.type === 'text_delta') {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 *
 * @example Using model parameters
 * ```typescript
 * const model = llm({
 *   model: ollama('llama3.2'),
 *   params: {
 *     temperature: 0.9,
 *     top_p: 0.95,
 *     num_predict: 500,
 *   },
 * });
 * const result = await model.generate('Be creative!');
 * ```
 *
 * @see {@link OllamaLLMParams} for available model parameters
 */
export const ollama = createProvider({
  name: 'ollama',
  version: '1.0.0',
  handlers: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
  },
});

export type { OllamaLLMParams, OllamaHeaders } from './types.ts';
export type { OllamaEmbedParams } from './embed.ts';
