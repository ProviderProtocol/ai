/**
 * OpenRouter Chat Completions API parameters
 * These are passed through to the /api/v1/chat/completions endpoint
 */
export interface OpenRouterCompletionsParams {
  /** Maximum number of tokens to generate */
  max_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Top-k sampling (not available for OpenAI models) */
  top_k?: number;

  /** Frequency penalty (-2.0 - 2.0) */
  frequency_penalty?: number;

  /** Presence penalty (-2.0 - 2.0) */
  presence_penalty?: number;

  /** Repetition penalty (0.0 - 2.0) */
  repetition_penalty?: number;

  /** Custom stop sequences */
  stop?: string | string[];

  /** Seed for deterministic sampling */
  seed?: number;

  /** User identifier for abuse detection */
  user?: string;

  /** Enable logprobs */
  logprobs?: boolean;

  /** Number of top logprobs to return */
  top_logprobs?: number;

  /** Logit bias map */
  logit_bias?: Record<number, number>;

  /** Minimum probability threshold (0.0 - 1.0) */
  min_p?: number;

  /** Top-a sampling threshold (0.0 - 1.0) */
  top_a?: number;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Response format for structured output */
  response_format?: OpenRouterResponseFormat;

  /**
   * Prompt transforms to apply
   * See: https://openrouter.ai/docs/guides/features/message-transforms
   */
  transforms?: string[];

  /**
   * Multiple models for routing
   * See: https://openrouter.ai/docs/guides/features/model-routing
   */
  models?: string[];

  /**
   * Routing strategy (e.g., 'fallback')
   */
  route?: 'fallback';

  /**
   * Provider routing preferences
   * See: https://openrouter.ai/docs/guides/routing/provider-selection
   */
  provider?: OpenRouterProviderPreferences;

  /**
   * Predicted output for latency optimization
   */
  prediction?: {
    type: 'content';
    content: string;
  };

  /**
   * Debug options (streaming only)
   */
  debug?: {
    /** If true, returns the transformed request body sent to the provider */
    echo_upstream_body?: boolean;
  };
}

/**
 * OpenRouter Responses API parameters (Beta)
 * These are passed through to the /api/v1/responses endpoint
 */
export interface OpenRouterResponsesParams {
  /** Maximum output tokens */
  max_output_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /**
   * Reasoning configuration
   */
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
}

/**
 * API mode for OpenRouter provider
 */
export type OpenRouterAPIMode = 'completions' | 'responses';

/**
 * Model options when creating a model reference
 */
export interface OpenRouterModelOptions {
  /** Which API to use */
  api?: OpenRouterAPIMode;
}

/**
 * Model reference with OpenRouter-specific options
 */
export interface OpenRouterModelReference {
  modelId: string;
  options?: OpenRouterModelOptions;
}

/**
 * OpenRouter provider configuration
 */
export interface OpenRouterConfig {
  /** Which API to use: 'completions' (default) or 'responses' (beta) */
  api?: 'completions' | 'responses';
}

/**
 * Provider routing preferences
 */
export interface OpenRouterProviderPreferences {
  /** Allow fallback to other providers */
  allow_fallbacks?: boolean;
  /** Require specific parameters to be supported */
  require_parameters?: boolean;
  /** Data collection policy */
  data_collection?: 'allow' | 'deny';
  /** Order of provider preference */
  order?: string[];
  /** Ignore specific providers */
  ignore?: string[];
  /** Quantization preferences */
  quantizations?: string[];
}

// ============================================
// Chat Completions API Types
// ============================================

/**
 * Chat Completions API request body
 */
export interface OpenRouterCompletionsRequest {
  model: string;
  messages?: OpenRouterCompletionsMessage[];
  prompt?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  top_a?: number;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  repetition_penalty?: number;
  logit_bias?: Record<number, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  user?: string;
  seed?: number;
  tools?: OpenRouterCompletionsTool[];
  tool_choice?: OpenRouterToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: OpenRouterResponseFormat;
  prediction?: {
    type: 'content';
    content: string;
  };
  // OpenRouter-specific
  transforms?: string[];
  models?: string[];
  route?: 'fallback';
  provider?: OpenRouterProviderPreferences;
  debug?: {
    echo_upstream_body?: boolean;
  };
}

/**
 * Chat Completions message format
 */
export type OpenRouterCompletionsMessage =
  | OpenRouterSystemMessage
  | OpenRouterUserMessage
  | OpenRouterAssistantMessage
  | OpenRouterToolMessage;

export interface OpenRouterSystemMessage {
  role: 'system';
  content: string;
  name?: string;
}

export interface OpenRouterUserMessage {
  role: 'user';
  content: string | OpenRouterUserContent[];
  name?: string;
}

export interface OpenRouterAssistantMessage {
  role: 'assistant';
  content?: string | null;
  name?: string;
  tool_calls?: OpenRouterToolCall[];
}

export interface OpenRouterToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name?: string;
}

/**
 * User content types
 */
export type OpenRouterUserContent = OpenRouterTextContent | OpenRouterImageContent;

export interface OpenRouterTextContent {
  type: 'text';
  text: string;
}

export interface OpenRouterImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Tool call format
 */
export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool definition for Chat Completions
 */
export interface OpenRouterCompletionsTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

/**
 * Tool choice options
 */
export type OpenRouterToolChoice =
  | 'none'
  | 'auto'
  | { type: 'function'; function: { name: string } };

/**
 * Response format
 */
export type OpenRouterResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        description?: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    };

/**
 * Chat Completions response format
 */
export interface OpenRouterCompletionsResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenRouterCompletionsChoice[];
  usage: OpenRouterUsage;
  system_fingerprint?: string;
}

export interface OpenRouterCompletionsChoice {
  index: number;
  message: OpenRouterAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: OpenRouterLogprobs | null;
}

export interface OpenRouterLogprobs {
  content?: Array<{
    token: string;
    logprob: number;
    bytes?: number[];
    top_logprobs?: Array<{
      token: string;
      logprob: number;
      bytes?: number[];
    }>;
  }>;
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Chat Completions streaming event types
 */
export interface OpenRouterCompletionsStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenRouterCompletionsStreamChoice[];
  usage?: OpenRouterUsage | null;
  system_fingerprint?: string;
}

export interface OpenRouterCompletionsStreamChoice {
  index: number;
  delta: OpenRouterCompletionsStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: OpenRouterLogprobs | null;
}

export interface OpenRouterCompletionsStreamDelta {
  role?: 'assistant';
  content?: string | null;
  tool_calls?: OpenRouterStreamToolCall[];
}

export interface OpenRouterStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

// ============================================
// Responses API Types (Beta)
// ============================================

/**
 * Responses API request body
 */
export interface OpenRouterResponsesRequest {
  model: string;
  input: string | OpenRouterResponsesInputItem[];
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: OpenRouterResponsesTool[];
  tool_choice?: OpenRouterResponsesToolChoice;
  parallel_tool_calls?: boolean;
  text?: OpenRouterResponsesTextConfig;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
}

/**
 * Responses API input item
 */
export type OpenRouterResponsesInputItem =
  | OpenRouterResponsesSystemItem
  | OpenRouterResponsesUserItem
  | OpenRouterResponsesAssistantItem
  | OpenRouterResponsesFunctionCallInputItem
  | OpenRouterResponsesToolResultItem;

export interface OpenRouterResponsesSystemItem {
  type: 'message';
  role: 'system';
  content: string | OpenRouterResponsesContentPart[];
}

export interface OpenRouterResponsesUserItem {
  type: 'message';
  role: 'user';
  content: string | OpenRouterResponsesContentPart[];
}

export interface OpenRouterResponsesAssistantItem {
  type: 'message';
  role: 'assistant';
  id: string;
  status: 'completed' | 'in_progress';
  content: OpenRouterResponsesContentPart[];
}

export interface OpenRouterResponsesFunctionCallInputItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenRouterResponsesToolResultItem {
  type: 'function_call_output';
  id: string;
  call_id: string;
  output: string;
}

/**
 * Content parts for Responses API
 */
export type OpenRouterResponsesContentPart =
  | OpenRouterResponsesInputTextPart
  | OpenRouterResponsesOutputTextPart
  | OpenRouterResponsesImagePart
  | OpenRouterResponsesFunctionCallPart;

/** @deprecated Use OpenRouterResponsesInputTextPart or OpenRouterResponsesOutputTextPart */
export type OpenRouterResponsesTextPart = OpenRouterResponsesInputTextPart | OpenRouterResponsesOutputTextPart;

export interface OpenRouterResponsesInputTextPart {
  type: 'input_text';
  text: string;
}

export interface OpenRouterResponsesOutputTextPart {
  type: 'output_text';
  text: string;
  annotations?: unknown[];
}

export interface OpenRouterResponsesImagePart {
  type: 'input_image';
  image_url?: string;
  image?: string; // base64
  detail?: 'auto' | 'low' | 'high';
}

export interface OpenRouterResponsesFunctionCallPart {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * Tool definition for Responses API
 */
export interface OpenRouterResponsesTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Tool choice for Responses API
 */
export type OpenRouterResponsesToolChoice =
  | 'none'
  | 'auto'
  | { type: 'function'; name: string };

/**
 * Text configuration for structured output
 */
export interface OpenRouterResponsesTextConfig {
  format?:
    | { type: 'text' }
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        name: string;
        description?: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
}

/**
 * Responses API response format
 */
export interface OpenRouterResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  model: string;
  output: OpenRouterResponsesOutputItem[];
  usage: OpenRouterResponsesUsage;
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress';
  error?: {
    code: string;
    message: string;
  };
  incomplete_details?: {
    reason: string;
  };
}

export type OpenRouterResponsesOutputItem =
  | OpenRouterResponsesMessageOutput
  | OpenRouterResponsesFunctionCallOutput;

export interface OpenRouterResponsesMessageOutput {
  type: 'message';
  id: string;
  role: 'assistant';
  content: OpenRouterResponsesOutputContent[];
  status: 'completed' | 'in_progress';
}

export interface OpenRouterResponsesFunctionCallOutput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: 'completed' | 'in_progress';
}

export type OpenRouterResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

export interface OpenRouterResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * Responses API streaming event types
 */
export type OpenRouterResponsesStreamEvent =
  | OpenRouterResponseCreatedEvent
  | OpenRouterResponseInProgressEvent
  | OpenRouterResponseCompletedEvent
  | OpenRouterResponseFailedEvent
  | OpenRouterResponseOutputItemAddedEvent
  | OpenRouterResponseOutputItemDoneEvent
  | OpenRouterResponseContentPartAddedEvent
  | OpenRouterResponseContentPartDoneEvent
  | OpenRouterResponseTextDeltaEvent
  | OpenRouterResponseTextDoneEvent
  | OpenRouterResponseRefusalDeltaEvent
  | OpenRouterResponseRefusalDoneEvent
  | OpenRouterResponseFunctionCallArgumentsDeltaEvent
  | OpenRouterResponseFunctionCallArgumentsDoneEvent
  | OpenRouterResponseReasoningDeltaEvent
  | OpenRouterResponseErrorEvent;

export interface OpenRouterResponseCreatedEvent {
  type: 'response.created';
  response: OpenRouterResponsesResponse;
}

export interface OpenRouterResponseInProgressEvent {
  type: 'response.in_progress';
  response: OpenRouterResponsesResponse;
}

export interface OpenRouterResponseCompletedEvent {
  type: 'response.completed' | 'response.done';
  response: OpenRouterResponsesResponse;
}

export interface OpenRouterResponseFailedEvent {
  type: 'response.failed';
  response: OpenRouterResponsesResponse;
}

export interface OpenRouterResponseOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: OpenRouterResponsesOutputItem;
}

export interface OpenRouterResponseOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: OpenRouterResponsesOutputItem;
}

export interface OpenRouterResponseContentPartAddedEvent {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  part: OpenRouterResponsesOutputContent;
}

export interface OpenRouterResponseContentPartDoneEvent {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  part: OpenRouterResponsesOutputContent;
}

export interface OpenRouterResponseTextDeltaEvent {
  type: 'response.content_part.delta' | 'response.output_text.delta';
  response_id?: string;
  output_index: number;
  content_index?: number;
  delta: string;
}

export interface OpenRouterResponseTextDoneEvent {
  type: 'response.output_text.done' | 'response.content_part.done';
  output_index: number;
  content_index?: number;
  text: string;
}

export interface OpenRouterResponseRefusalDeltaEvent {
  type: 'response.refusal.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenRouterResponseRefusalDoneEvent {
  type: 'response.refusal.done';
  output_index: number;
  content_index: number;
  refusal: string;
}

export interface OpenRouterResponseFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  item_id: string;
  delta: string;
  call_id?: string;
}

export interface OpenRouterResponseFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  item_id: string;
  name: string;
  arguments: string;
  call_id?: string;
}

export interface OpenRouterResponseReasoningDeltaEvent {
  type: 'response.reasoning.delta';
  delta: string;
}

export interface OpenRouterResponseErrorEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
  };
}
