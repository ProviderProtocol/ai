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
 * Input types for inference
 */
export type InferenceInput = string | Message | ContentBlock;

/**
 * Options for llm() function
 */
export interface LLMOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: ModelReference;

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
}
