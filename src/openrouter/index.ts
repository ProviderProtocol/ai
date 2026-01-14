/**
 * OpenRouter provider for UPP (Unified Provider Protocol)
 *
 * This module exports the OpenRouter provider for accessing hundreds of AI
 * models through a unified API, including models from OpenAI, Anthropic,
 * Google, Meta, Mistral, and many others.
 *
 * @example Basic usage with Chat Completions API
 * ```ts
 * import { openrouter } from '@providerprotocol/ai/openrouter';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Access OpenAI models through OpenRouter
 * const model = llm({
 *   model: openrouter('openai/gpt-4o'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 *
 * @example Using Anthropic models
 * ```ts
 * const claudeModel = llm({
 *   model: openrouter('anthropic/claude-3.5-sonnet'),
 *   params: { max_tokens: 1000 }
 * });
 * ```
 *
 * @example Using the Responses API (beta)
 * ```ts
 * const responsesModel = llm({
 *   model: openrouter('openai/gpt-4o', { api: 'responses' }),
 *   params: { max_output_tokens: 1000 }
 * });
 * ```
 *
 * @see {@link https://openrouter.ai/docs | OpenRouter Documentation}
 *
 * @packageDocumentation
 */

export { openrouter } from '../providers/openrouter/index.ts';
export type {
  OpenRouterCompletionsParams,
  OpenRouterResponsesParams,
  OpenRouterConfig,
  OpenRouterAPIMode,
  OpenRouterModelOptions,
  OpenRouterModelReference,
  OpenRouterProviderPreferences,
  OpenRouterEmbedParams,
  OpenRouterImageConfig,
  OpenRouterHeaders,
} from '../providers/openrouter/index.ts';
