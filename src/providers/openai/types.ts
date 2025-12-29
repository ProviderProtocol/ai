/**
 * OpenAI-specific LLM parameters
 * These are passed through to the relevant OpenAI APIs
 */
export interface OpenAILLMParams {
  /** Maximum number of tokens to generate */
  max_tokens?: number;

  /** Maximum completion tokens (preferred over max_tokens for newer models) */
  max_completion_tokens?: number;

  /** Maximum output tokens (Responses API) */
  max_output_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Frequency penalty (-2.0 - 2.0) */
  frequency_penalty?: number;

  /** Presence penalty (-2.0 - 2.0) */
  presence_penalty?: number;

  /** Custom stop sequences */
  stop?: string | string[];

  /** Number of completions to generate */
  n?: number;

  /** Enable logprobs */
  logprobs?: boolean;

  /** Number of top logprobs to return (0-20) */
  top_logprobs?: number;

  /** Seed for deterministic sampling (beta) */
  seed?: number;

  /** User identifier for abuse detection */
  user?: string;

  /** Logit bias map (Chat Completions API) */
  logit_bias?: Record<string, number>;

  /** Verbosity control (Chat Completions API) */
  verbosity?: 'low' | 'medium' | 'high';

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Reasoning effort for reasoning models */
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

  /** Reasoning configuration (Responses API) */
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    summary?: string;
  };

  /** Service tier */
  service_tier?: 'auto' | 'default' | 'flex' | 'priority';

  /** Truncation strategy (Responses API) */
  truncation?: 'auto' | 'disabled';

  /** Fields to include in Responses API output */
  include?: string[];

  /** Background processing (Responses API) */
  background?: boolean;

  /** Continue from a previous response (Responses API) */
  previous_response_id?: string;

  /** Store completion for distillation */
  store?: boolean;

  /** Metadata key-value pairs */
  metadata?: Record<string, string>;

  /** Response format for structured output (Chat Completions API only) */
  response_format?: OpenAIResponseFormat;

  /**
   * Predicted Output configuration for faster regeneration
   * Improves response times when large parts of the response are known ahead of time
   * Most useful when regenerating a file with only minor changes
   */
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };

  /**
   * Stable identifier for caching similar requests (replaces user field)
   * Used to optimize cache hit rates
   */
  prompt_cache_key?: string;

  /**
   * Retention policy for prompt cache
   * Set to "24h" to enable extended prompt caching up to 24 hours
   */
  prompt_cache_retention?: '24h';

  /**
   * Stable identifier for abuse detection
   * Recommend hashing username or email address
   */
  safety_identifier?: string;
}

/**
 * API mode for OpenAI provider
 */
export type OpenAIAPIMode = 'responses' | 'completions';

/**
 * Model options when creating a model reference
 */
export interface OpenAIModelOptions {
  /** Which API to use */
  api?: OpenAIAPIMode;
}

/**
 * Model reference with OpenAI-specific options
 */
export interface OpenAIModelReference {
  modelId: string;
  options?: OpenAIModelOptions;
}

/**
 * OpenAI provider configuration
 */
export interface OpenAIConfig {
  /** Which API to use: 'responses' (modern) or 'completions' (legacy) */
  api?: 'responses' | 'completions';
}

// ============================================
// Chat Completions API Types
// ============================================

/**
 * Chat Completions API request body
 */
export interface OpenAICompletionsRequest {
  model: string;
  messages: OpenAICompletionsMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  stop?: string | string[];
  max_tokens?: number;
  max_completion_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  user?: string;
  seed?: number;
  tools?: OpenAICompletionsTool[];
  tool_choice?: OpenAIToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: OpenAIResponseFormat;
  reasoning_effort?: string;
  verbosity?: 'low' | 'medium' | 'high';
  service_tier?: string;
  store?: boolean;
  metadata?: Record<string, string>;
  /** Predicted output for faster regeneration */
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };
  /** Stable identifier for caching (replaces user) */
  prompt_cache_key?: string;
  /** Retention policy for prompt cache */
  prompt_cache_retention?: string;
  /** Stable identifier for abuse detection */
  safety_identifier?: string;
}

/**
 * Chat Completions message format
 */
export type OpenAICompletionsMessage =
  | OpenAISystemMessage
  | OpenAIUserMessage
  | OpenAIAssistantMessage
  | OpenAIToolMessage;

export interface OpenAISystemMessage {
  role: 'system' | 'developer';
  content: string;
  name?: string;
}

export interface OpenAIUserMessage {
  role: 'user';
  content: string | OpenAIUserContent[];
  name?: string;
}

export interface OpenAIAssistantMessage {
  role: 'assistant';
  content?: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  refusal?: string | null;
}

export interface OpenAIToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * User content types
 */
export type OpenAIUserContent = OpenAITextContent | OpenAIImageContent;

export interface OpenAITextContent {
  type: 'text';
  text: string;
}

export interface OpenAIImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Tool call format
 */
export interface OpenAIToolCall {
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
export interface OpenAICompletionsTool {
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
    strict?: boolean;
  };
}

/**
 * Tool choice options
 */
export type OpenAIToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Response format
 */
export type OpenAIResponseFormat =
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
export interface OpenAICompletionsResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAICompletionsChoice[];
  usage: OpenAIUsage;
  system_fingerprint?: string;
  service_tier?: string;
}

export interface OpenAICompletionsChoice {
  index: number;
  message: OpenAIAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: OpenAILogprobs | null;
}

export interface OpenAILogprobs {
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

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
}

/**
 * Chat Completions streaming event types
 */
export interface OpenAICompletionsStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAICompletionsStreamChoice[];
  usage?: OpenAIUsage | null;
  system_fingerprint?: string;
  service_tier?: string;
}

export interface OpenAICompletionsStreamChoice {
  index: number;
  delta: OpenAICompletionsStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: OpenAILogprobs | null;
}

export interface OpenAICompletionsStreamDelta {
  role?: 'assistant';
  content?: string | null;
  tool_calls?: OpenAIStreamToolCall[];
  refusal?: string | null;
}

export interface OpenAIStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

// ============================================
// Responses API Types
// ============================================

/**
 * Responses API request body
 */
export interface OpenAIResponsesRequest {
  model: string;
  input: string | OpenAIResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: OpenAIResponsesTool[];
  tool_choice?: OpenAIResponsesToolChoice;
  parallel_tool_calls?: boolean;
  text?: OpenAIResponsesTextConfig;
  truncation?: 'auto' | 'disabled';
  store?: boolean;
  metadata?: Record<string, string>;
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    summary?: string;
  };
  service_tier?: string;
  include?: string[];
  background?: boolean;
  previous_response_id?: string;
}

/**
 * Responses API input item
 */
export type OpenAIResponsesInputItem =
  | OpenAIResponsesSystemItem
  | OpenAIResponsesUserItem
  | OpenAIResponsesAssistantItem
  | OpenAIResponsesFunctionCallInputItem
  | OpenAIResponsesToolResultItem;

export interface OpenAIResponsesSystemItem {
  type: 'message';
  role: 'system' | 'developer';
  content: string | OpenAIResponsesContentPart[];
}

export interface OpenAIResponsesUserItem {
  type: 'message';
  role: 'user';
  content: string | OpenAIResponsesContentPart[];
}

export interface OpenAIResponsesAssistantItem {
  type: 'message';
  role: 'assistant';
  content: string | OpenAIResponsesContentPart[];
}

export interface OpenAIResponsesFunctionCallInputItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenAIResponsesToolResultItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/**
 * Content parts for Responses API
 */
export type OpenAIResponsesContentPart =
  | OpenAIResponsesTextPart
  | OpenAIResponsesImagePart
  | OpenAIResponsesFunctionCallPart;

export interface OpenAIResponsesTextPart {
  type: 'input_text' | 'output_text';
  text: string;
}

export interface OpenAIResponsesImagePart {
  type: 'input_image';
  image_url?: string;
  image?: string; // base64
  detail?: 'auto' | 'low' | 'high';
}

export interface OpenAIResponsesFunctionCallPart {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * Tool definition for Responses API
 */
export interface OpenAIResponsesTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  strict?: boolean;
}

/**
 * Tool choice for Responses API
 */
export type OpenAIResponsesToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; name: string };

/**
 * Text configuration for structured output
 */
export interface OpenAIResponsesTextConfig {
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
export interface OpenAIResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  model: string;
  output: OpenAIResponsesOutputItem[];
  usage: OpenAIResponsesUsage;
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress';
  error?: {
    code: string;
    message: string;
  };
  incomplete_details?: {
    reason: string;
  };
}

export type OpenAIResponsesOutputItem =
  | OpenAIResponsesMessageOutput
  | OpenAIResponsesFunctionCallOutput;

export interface OpenAIResponsesMessageOutput {
  type: 'message';
  id: string;
  role: 'assistant';
  content: OpenAIResponsesOutputContent[];
  status: 'completed' | 'in_progress';
}

export interface OpenAIResponsesFunctionCallOutput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: 'completed' | 'in_progress';
}

export type OpenAIResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

export interface OpenAIResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    text_tokens?: number;
    image_tokens?: number;
    audio_tokens?: number;
  };
  output_tokens_details?: {
    text_tokens?: number;
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
}

/**
 * Responses API streaming event types
 */
export type OpenAIResponsesStreamEvent =
  | OpenAIResponseCreatedEvent
  | OpenAIResponseInProgressEvent
  | OpenAIResponseCompletedEvent
  | OpenAIResponseFailedEvent
  | OpenAIResponseOutputItemAddedEvent
  | OpenAIResponseOutputItemDoneEvent
  | OpenAIResponseContentPartAddedEvent
  | OpenAIResponseContentPartDoneEvent
  | OpenAIResponseTextDeltaEvent
  | OpenAIResponseTextDoneEvent
  | OpenAIResponseRefusalDeltaEvent
  | OpenAIResponseRefusalDoneEvent
  | OpenAIResponseFunctionCallArgumentsDeltaEvent
  | OpenAIResponseFunctionCallArgumentsDoneEvent
  | OpenAIResponseErrorEvent;

export interface OpenAIResponseCreatedEvent {
  type: 'response.created';
  response: OpenAIResponsesResponse;
}

export interface OpenAIResponseInProgressEvent {
  type: 'response.in_progress';
  response: OpenAIResponsesResponse;
}

export interface OpenAIResponseCompletedEvent {
  type: 'response.completed';
  response: OpenAIResponsesResponse;
}

export interface OpenAIResponseFailedEvent {
  type: 'response.failed';
  response: OpenAIResponsesResponse;
}

export interface OpenAIResponseOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponseOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponseContentPartAddedEvent {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  part: OpenAIResponsesOutputContent;
}

export interface OpenAIResponseContentPartDoneEvent {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  part: OpenAIResponsesOutputContent;
}

export interface OpenAIResponseTextDeltaEvent {
  type: 'response.output_text.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenAIResponseTextDoneEvent {
  type: 'response.output_text.done';
  output_index: number;
  content_index: number;
  text: string;
}

export interface OpenAIResponseRefusalDeltaEvent {
  type: 'response.refusal.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenAIResponseRefusalDoneEvent {
  type: 'response.refusal.done';
  output_index: number;
  content_index: number;
  refusal: string;
}

export interface OpenAIResponseFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  item_id: string;
  delta: string;
  call_id?: string;
}

export interface OpenAIResponseFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  item_id: string;
  name: string;
  arguments: string;
  call_id?: string;
}

export interface OpenAIResponseErrorEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
  };
}
