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
 * LLMCapabilities declares what the provider's API supports, not individual model capabilities.
 * If a user attempts to use a feature with a model that doesn't support it,
 * the provider's API will return an error—this is expected behavior.
 *
 * Capabilities are static - they are constant for the lifetime of the provider instance
 * and do not vary per-request or per-model.
 */
export interface LLMCapabilities {
  /** Provider API supports streaming responses */
  streaming: boolean;

  /** Provider API supports tool/function calling */
  tools: boolean;

  /** Provider API supports native structured output (JSON schema) */
  structuredOutput: boolean;

  /** Provider API supports image input */
  imageInput: boolean;

  /** Provider API supports video input */
  videoInput: boolean;

  /** Provider API supports audio input */
  audioInput: boolean;
}

/**
 * Input types for inference
 */
export type InferenceInput = string | Message | ContentBlock;

/**
 * Options for llm() function
 */
export interface LLMOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: ModelReference<any>;

  /** Provider infrastructure configuration (optional - uses env vars if omitted) */
  config?: ProviderConfig;

  /** Model-specific parameters (temperature, max_tokens, etc.) */
  params?: TParams;

  /** System prompt for all inferences */
  system?: string;

  /** Tools available to the model */
  tools?: Tool[];

  /** Tool execution strategy */
  toolStrategy?: ToolUseStrategy;

  /** Structured output schema (JSON Schema) */
  structure?: JSONSchema;
}

/**
 * LLM instance returned by llm()
 */
export interface LLMInstance<TParams = unknown> {
  /**
   * Execute inference and return complete Turn
   *
   * @overload No history - single input
   * generate(input: InferenceInput): Promise<Turn>
   *
   * @overload No history - multiple inputs
   * generate(...inputs: InferenceInput[]): Promise<Turn>
   *
   * @overload With history
   * generate(history: Message[] | Thread, ...inputs: InferenceInput[]): Promise<Turn>
   */
  generate(
    historyOrInput: Message[] | Thread | InferenceInput,
    ...input: InferenceInput[]
  ): Promise<Turn>;

  /**
   * Execute streaming inference
   *
   * @overload No history - single input
   * stream(input: InferenceInput): StreamResult
   *
   * @overload No history - multiple inputs
   * stream(...inputs: InferenceInput[]): StreamResult
   *
   * @overload With history
   * stream(history: Message[] | Thread, ...inputs: InferenceInput[]): StreamResult
   */
  stream(
    historyOrInput: Message[] | Thread | InferenceInput,
    ...input: InferenceInput[]
  ): StreamResult;

  /** The bound model */
  readonly model: BoundLLMModel<TParams>;

  /** Current system prompt */
  readonly system: string | undefined;

  /** Current parameters */
  readonly params: TParams | undefined;

  /** Provider API capabilities */
  readonly capabilities: LLMCapabilities;
}

/**
 * Request passed from llm() core to providers
 * Note: config is required here because llm() core resolves defaults
 * before passing to providers
 */
export interface LLMRequest<TParams = unknown> {
  /** All messages for this request (history + new input) */
  messages: Message[];

  /** System prompt */
  system?: string;

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
 * Raw provider response (single cycle, no tool loop)
 */
export interface LLMResponse {
  message: AssistantMessage;
  usage: TokenUsage;
  stopReason: string;

  /**
   * Structured output data extracted by the provider.
   * Present when a structure schema was requested and the provider
   * successfully extracted the data (via tool call or native JSON mode).
   * Providers handle their own extraction logic - core just uses this value.
   */
  data?: unknown;
}

/**
 * Raw provider stream result
 */
export interface LLMStreamResult extends AsyncIterable<StreamEvent> {
  readonly response: Promise<LLMResponse>;
}

/**
 * Bound LLM model - full definition
 */
export interface BoundLLMModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Reference to the parent provider */
  readonly provider: LLMProvider<TParams>;

  /** Provider API capabilities */
  readonly capabilities: LLMCapabilities;

  /** Execute a single non-streaming inference request */
  complete(request: LLMRequest<TParams>): Promise<LLMResponse>;

  /** Execute a single streaming inference request */
  stream(request: LLMRequest<TParams>): LLMStreamResult;
}

/**
 * LLM Handler for providers
 */
export interface LLMHandler<TParams = unknown> {
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundLLMModel<TParams>;

  /**
   * Internal: Set the parent provider reference.
   * Called by createProvider() after the provider is constructed.
   * This allows bind() to return models with the correct provider reference.
   * @internal
   */
  _setProvider?(provider: LLMProvider<TParams>): void;
}
