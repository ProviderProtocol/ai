/**
 * @fileoverview LLM types for language model inference.
 *
 * Defines the interfaces for configuring and executing LLM inference,
 * including options, instances, requests, responses, and capabilities.
 *
 * @module types/llm
 */

import type { Message, AssistantMessage } from './messages.ts';
import type { ContentBlock } from './content.ts';
import type { Tool, ToolUseStrategy } from './tool.ts';
import type { JSONSchema } from './schema.ts';
import type { Turn, TokenUsage } from './turn.ts';
import type { StreamEvent, StreamResult } from './stream.ts';
import type {
  ModelReference,
  ProviderConfig,
  LLMProvider,
} from './provider.ts';
import type { Thread } from './thread.ts';

/**
 * Structural type for model input that accepts any ModelReference.
 * Uses structural typing to avoid generic variance issues with Provider generics.
 * The nested types use `unknown` to accept any provider parameter types.
 */
type ModelInput = {
  readonly modelId: string;
  readonly provider: {
    readonly name: string;
    readonly version: string;
    readonly modalities: {
      // Use unknown for the handler to accept any LLMHandler regardless of TParams
      llm?: unknown;
    };
  };
};

/**
 * LLM capabilities declare what a provider's API supports.
 *
 * These are API-level capabilities, not individual model capabilities.
 * If a user attempts to use a feature with a model that doesn't support it,
 * the provider's API will return an error.
 *
 * Capabilities are static and do not vary per-request or per-model.
 *
 * @example
 * ```typescript
 * const capabilities: LLMCapabilities = {
 *   streaming: true,
 *   tools: true,
 *   structuredOutput: true,
 *   imageInput: true,
 *   videoInput: false,
 *   audioInput: false
 * };
 * ```
 */
export interface LLMCapabilities {
  /** Provider API supports streaming responses */
  streaming: boolean;

  /** Provider API supports tool/function calling */
  tools: boolean;

  /** Provider API supports native structured output (JSON schema) */
  structuredOutput: boolean;

  /** Provider API supports image input in messages */
  imageInput: boolean;

  /** Provider API supports video input in messages */
  videoInput: boolean;

  /** Provider API supports audio input in messages */
  audioInput: boolean;

  /** Provider API supports image generation output (via modalities or built-in tools) */
  imageOutput?: boolean;
}

/**
 * Valid input types for inference.
 *
 * Inference input can be a simple string, a Message object, or
 * a raw ContentBlock for multimodal input.
 */
export type InferenceInput = string | Message | ContentBlock;

/**
 * Options for creating an LLM instance with the llm() function.
 *
 * @typeParam TParams - Provider-specific parameter type
 *
 * @example
 * ```typescript
 * const options: LLMOptions = {
 *   model: openai('gpt-4'),
 *   system: 'You are a helpful assistant.',
 *   params: { temperature: 0.7, max_tokens: 1000 },
 *   tools: [weatherTool, searchTool],
 *   toolStrategy: { maxIterations: 5 }
 * };
 *
 * const instance = llm(options);
 * ```
 */
export interface LLMOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: ModelInput;

  /** Provider infrastructure configuration (optional - uses env vars if omitted) */
  config?: ProviderConfig;

  /** Model-specific parameters (temperature, max_tokens, etc.) */
  params?: TParams;

  /**
   * System prompt for all inferences.
   *
   * Can be a simple string or a provider-specific array format:
   * - Anthropic: `[{type: 'text', text: '...', cache_control?: {...}}]`
   * - Google: `[{text: '...'}, {text: '...'}]` (parts array)
   *
   * Array formats are passed through directly to the provider.
   */
  system?: string | unknown[];

  /** Tools available to the model */
  tools?: Tool[];

  /** Tool execution strategy */
  toolStrategy?: ToolUseStrategy;

  /** Structured output schema (JSON Schema) */
  structure?: JSONSchema;
}

/**
 * LLM instance returned by the llm() function.
 *
 * Provides methods for generating responses and streaming output,
 * with access to the bound model and capabilities.
 *
 * @typeParam TParams - Provider-specific parameter type
 *
 * @example
 * ```typescript
 * const instance = llm({ model: openai('gpt-4') });
 *
 * // Simple generation
 * const turn = await instance.generate('Hello!');
 * console.log(turn.response.text);
 *
 * // Streaming
 * const stream = instance.stream('Tell me a story');
 * for await (const event of stream) {
 *   if (event.type === 'text_delta') {
 *     process.stdout.write(event.delta.text ?? '');
 *   }
 * }
 * const finalTurn = await stream.turn;
 * ```
 */
export interface LLMInstance<TParams = unknown> {
  /**
   * Executes inference and returns the complete Turn.
   *
   * Supports multiple calling patterns:
   * - Single input: `generate('Hello')`
   * - Multiple inputs: `generate('Context...', 'Question?')`
   * - With history: `generate(messages, 'Follow-up?')`
   * - With thread: `generate(thread, 'Next message')`
   *
   * @param historyOrInput - History (Message[] or Thread) or first input
   * @param input - Additional inputs to include in the request
   * @returns Promise resolving to the complete Turn
   */
  generate(
    historyOrInput: Message[] | Thread | InferenceInput,
    ...input: InferenceInput[]
  ): Promise<Turn>;

  /**
   * Executes streaming inference.
   *
   * Returns an async iterable of stream events that can also
   * be awaited for the final Turn.
   *
   * @param historyOrInput - History (Message[] or Thread) or first input
   * @param input - Additional inputs to include in the request
   * @returns StreamResult that yields events and resolves to Turn
   */
  stream(
    historyOrInput: Message[] | Thread | InferenceInput,
    ...input: InferenceInput[]
  ): StreamResult;

  /** The bound model instance */
  readonly model: BoundLLMModel<TParams>;

  /** Current system prompt (string or provider-specific array format) */
  readonly system: string | unknown[] | undefined;

  /** Current model parameters */
  readonly params: TParams | undefined;

  /** Provider API capabilities */
  readonly capabilities: LLMCapabilities;
}

/**
 * Request passed from the llm() core to providers.
 *
 * Contains all information needed by a provider to execute inference.
 * The config is required here because llm() resolves defaults before
 * passing to providers.
 *
 * @typeParam TParams - Provider-specific parameter type
 * @internal
 */
export interface LLMRequest<TParams = unknown> {
  /** All messages for this request (history + new input) */
  messages: Message[];

  /**
   * System prompt - string or provider-specific array format.
   * Arrays are passed through directly to the provider.
   */
  system?: string | unknown[];

  /** Model-specific parameters (passed through unchanged) */
  params?: TParams;

  /** Tools available for this request */
  tools?: Tool[];

  /** Structured output schema (if requested) */
  structure?: JSONSchema;

  /** Provider infrastructure config (resolved by llm() core) */
  config: ProviderConfig;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Raw provider response from a single inference cycle.
 *
 * Does not include tool loop handling - that's managed by llm() core.
 *
 * @internal
 */
export interface LLMResponse {
  /** The assistant's response message */
  message: AssistantMessage;

  /** Token usage for this cycle */
  usage: TokenUsage;

  /** Stop reason from the provider */
  stopReason: string;

  /**
   * Structured output data extracted by the provider.
   * Present when a structure schema was requested and successfully extracted.
   */
  data?: unknown;
}

/**
 * Raw provider stream result.
 *
 * An async iterable of stream events with a Promise that resolves
 * to the complete response after streaming finishes.
 *
 * @internal
 */
export interface LLMStreamResult extends AsyncIterable<StreamEvent> {
  /** Promise resolving to the complete response */
  readonly response: Promise<LLMResponse>;
}

/**
 * Bound LLM model - full definition.
 *
 * Represents a model bound to a specific provider and model ID,
 * ready to execute inference requests.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface BoundLLMModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Reference to the parent provider */
  readonly provider: LLMProvider<TParams>;

  /** Provider API capabilities */
  readonly capabilities: LLMCapabilities;

  /**
   * Executes a single non-streaming inference request.
   *
   * @param request - The inference request
   * @returns Promise resolving to the response
   */
  complete(request: LLMRequest<TParams>): Promise<LLMResponse>;

  /**
   * Executes a single streaming inference request.
   *
   * @param request - The inference request
   * @returns Stream result with events and final response
   */
  stream(request: LLMRequest<TParams>): LLMStreamResult;
}

/**
 * LLM Handler interface for providers.
 *
 * Implemented by providers to enable language model capabilities.
 *
 * @typeParam TParams - Provider-specific parameter type
 */
export interface LLMHandler<TParams = unknown> {
  /**
   * Binds a model ID to create an executable model instance.
   *
   * @param modelId - The model identifier to bind
   * @returns A bound LLM model ready for inference
   */
  bind(modelId: string): BoundLLMModel<TParams>;

  /**
   * Sets the parent provider reference.
   * Called by createProvider() after the provider is constructed.
   *
   * @param provider - The parent provider
   * @internal
   */
  _setProvider?(provider: LLMProvider<TParams>): void;
}
