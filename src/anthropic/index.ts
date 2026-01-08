/**
 * Anthropic provider for UPP (Unified Provider Protocol)
 *
 * This module exports the Anthropic provider for use with Claude models.
 * Anthropic's Claude models are known for their strong reasoning capabilities
 * and safety-focused design.
 *
 * @example
 * ```ts
 * import { anthropic } from '@providerprotocol/ai/anthropic';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with Claude
 * const model = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   params: { max_tokens: 1000 }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('Explain quantum computing.');
 * console.log(turn.response.text);
 * ```
 *
 * @packageDocumentation
 */

export { anthropic, tools } from '../providers/anthropic/index.ts';
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
} from '../providers/anthropic/index.ts';
