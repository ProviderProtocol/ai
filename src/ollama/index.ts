/**
 * Ollama provider for UPP (Unified Provider Protocol)
 *
 * This module exports the Ollama provider for local model inference.
 * Ollama runs models locally, eliminating the need for API keys and
 * external network calls. Ideal for development and privacy-sensitive
 * applications.
 *
 * @remarks
 * Prerequisites:
 * 1. Install Ollama from https://ollama.ai
 * 2. Pull a model: `ollama pull llama3.2`
 * 3. Ensure Ollama is running: `ollama serve`
 *
 * @example
 * ```ts
 * import { ollama } from '@providerprotocol/ai/ollama';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with a local model
 * const model = llm({
 *   model: ollama('llama3.2'),
 *   params: { num_predict: 500 }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('Write a haiku about coding.');
 * console.log(turn.response.text);
 * ```
 *
 * @packageDocumentation
 */

export { ollama } from '../providers/ollama/index.ts';
export type { OllamaLLMParams } from '../providers/ollama/index.ts';
