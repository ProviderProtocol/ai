/**
 * xAI Chat Completions API parameters (OpenAI-compatible)
 * These are passed through to the /v1/chat/completions endpoint
 */
export interface XAICompletionsParams {
  /** Maximum number of tokens to generate */
  max_tokens?: number;

  /** Maximum completion tokens */
  max_completion_tokens?: number;

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

  /** Seed for deterministic sampling */
  seed?: number;

  /** User identifier for abuse detection */
  user?: string;

  /** Logit bias map */
  logit_bias?: Record<string, number>;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /**
   * Reasoning effort for Grok 3 Mini models
   * Note: Only 'low' and 'high' are supported by xAI
   */
  reasoning_effort?: 'low' | 'high';

  /** Store completion */
  store?: boolean;

  /** Metadata key-value pairs */
  metadata?: Record<string, string>;

  /** Response format for structured output */
  response_format?: XAIResponseFormat;

  /**
   * Live Search parameters (deprecated, will be removed Dec 15, 2025)
   * Use Agent Tools API instead for new implementations
   */
  search_parameters?: XAISearchParameters;
}

/**
 * xAI Responses API parameters (OpenAI Responses-compatible)
 * These are passed through to the /v1/responses endpoint
 */
export interface XAIResponsesParams {
  /** Maximum output tokens */
  max_output_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Reasoning configuration */
  reasoning?: {
    effort?: 'low' | 'high';
    /** Include encrypted reasoning content for continuation */
    encrypted_content?: boolean;
  };

  /** Truncation strategy */
  truncation?: 'auto' | 'disabled';

  /** Fields to include in output */
  include?: string[];

  /** Continue from a previous response */
  previous_response_id?: string;

  /** Store response for continuation */
  store?: boolean;

  /** Store messages on xAI servers (default: true) */
  store_messages?: boolean;

  /** Metadata key-value pairs */
  metadata?: Record<string, string>;

  /**
   * Live Search parameters (deprecated, will be removed Dec 15, 2025)
   * Use Agent Tools API instead for new implementations
   */
  search_parameters?: XAISearchParameters;
}

/**
 * xAI Messages API parameters (Anthropic-compatible)
 * These are passed through to the /v1/messages endpoint
 */
export interface XAIMessagesParams {
  /** Maximum number of tokens to generate */
  max_tokens?: number;

  /** Temperature for randomness (0.0 - 1.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Top-k sampling */
  top_k?: number;

  /** Custom stop sequences */
  stop_sequences?: string[];

  /** Metadata for the request */
  metadata?: {
    user_id?: string;
  };

  /** Extended thinking configuration */
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
}

/**
 * API mode for xAI provider
 */
export type XAIAPIMode = 'completions' | 'responses' | 'messages';

/**
 * Model options when creating a model reference
 */
export interface XAIModelOptions {
  /** Which API to use */
  api?: XAIAPIMode;
}

/**
 * Model reference with xAI-specific options
 */
export interface XAIModelReference {
  modelId: string;
  options?: XAIModelOptions;
}

/**
 * xAI provider configuration
 */
export interface XAIConfig {
  /** Which API to use: 'completions', 'responses', or 'messages' */
  api?: XAIAPIMode;
}

/**
 * Live Search parameters (deprecated)
 */
export interface XAISearchParameters {
  /** Search mode */
  mode?: 'auto' | 'on' | 'off';
  /** Limit search to specific date range */
  from_date?: string;
  /** End date for search range */
  to_date?: string;
  /** Sources to search */
  sources?: Array<'web' | 'x' | 'news' | 'rss'>;
  /** Maximum number of search results */
  max_search_results?: number;
}

/**
 * Server-side agentic tools
 */
export interface XAIAgentTool {
  type: 'web_search' | 'x_search' | 'code_execution';
}

// ============================================
// Chat Completions API Types (OpenAI-compatible)
// ============================================

/**
 * Chat Completions API request body
 */
export interface XAICompletionsRequest {
  model: string;
  messages: XAICompletionsMessage[];
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
  tools?: XAICompletionsTool[];
  tool_choice?: XAIToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: XAIResponseFormat;
  reasoning_effort?: string;
  store?: boolean;
  metadata?: Record<string, string>;
  search_parameters?: XAISearchParameters;
}

/**
 * Chat Completions message format
 */
export type XAICompletionsMessage =
  | XAISystemMessage
  | XAIUserMessage
  | XAIAssistantMessage
  | XAIToolMessage;

export interface XAISystemMessage {
  role: 'system';
  content: string;
  name?: string;
}

export interface XAIUserMessage {
  role: 'user';
  content: string | XAIUserContent[];
  name?: string;
}

export interface XAIAssistantMessage {
  role: 'assistant';
  content?: string | null;
  name?: string;
  tool_calls?: XAIToolCall[];
  refusal?: string | null;
}

export interface XAIToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * User content types
 */
export type XAIUserContent = XAITextContent | XAIImageContent;

export interface XAITextContent {
  type: 'text';
  text: string;
}

export interface XAIImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Tool call format
 */
export interface XAIToolCall {
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
export interface XAICompletionsTool {
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
export type XAIToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Response format
 */
export type XAIResponseFormat =
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
export interface XAICompletionsResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: XAICompletionsChoice[];
  usage: XAIUsage;
  system_fingerprint?: string;
  /** Citations from live search */
  citations?: string[];
  /** Inline citations in response */
  inline_citations?: Array<{ text: string; url: string }>;
}

export interface XAICompletionsChoice {
  index: number;
  message: XAIAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: XAILogprobs | null;
}

export interface XAILogprobs {
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

export interface XAIUsage {
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
  };
}

/**
 * Chat Completions streaming event types
 */
export interface XAICompletionsStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: XAICompletionsStreamChoice[];
  usage?: XAIUsage | null;
  system_fingerprint?: string;
}

export interface XAICompletionsStreamChoice {
  index: number;
  delta: XAICompletionsStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: XAILogprobs | null;
}

export interface XAICompletionsStreamDelta {
  role?: 'assistant';
  content?: string | null;
  tool_calls?: XAIStreamToolCall[];
  refusal?: string | null;
}

export interface XAIStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

// ============================================
// Responses API Types (OpenAI Responses-compatible)
// ============================================

/**
 * Responses API request body
 */
export interface XAIResponsesRequest {
  model: string;
  input: string | XAIResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: XAIResponsesTool[];
  tool_choice?: XAIResponsesToolChoice;
  parallel_tool_calls?: boolean;
  text?: XAIResponsesTextConfig;
  truncation?: 'auto' | 'disabled';
  store?: boolean;
  metadata?: Record<string, string>;
  reasoning?: {
    effort?: 'low' | 'high';
  };
  include?: string[];
  previous_response_id?: string;
  search_parameters?: XAISearchParameters;
}

/**
 * Responses API input item
 */
export type XAIResponsesInputItem =
  | XAIResponsesSystemItem
  | XAIResponsesUserItem
  | XAIResponsesAssistantItem
  | XAIResponsesFunctionCallInputItem
  | XAIResponsesToolResultItem;

export interface XAIResponsesSystemItem {
  type: 'message';
  role: 'system' | 'developer';
  content: string | XAIResponsesContentPart[];
}

export interface XAIResponsesUserItem {
  type: 'message';
  role: 'user';
  content: string | XAIResponsesContentPart[];
}

export interface XAIResponsesAssistantItem {
  type: 'message';
  role: 'assistant';
  content: string | XAIResponsesContentPart[];
}

export interface XAIResponsesFunctionCallInputItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface XAIResponsesToolResultItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/**
 * Content parts for Responses API
 */
export type XAIResponsesContentPart =
  | XAIResponsesTextPart
  | XAIResponsesImagePart
  | XAIResponsesFunctionCallPart;

export interface XAIResponsesTextPart {
  type: 'input_text' | 'output_text';
  text: string;
}

export interface XAIResponsesImagePart {
  type: 'input_image';
  image_url?: string;
  image?: string; // base64
  detail?: 'auto' | 'low' | 'high';
}

export interface XAIResponsesFunctionCallPart {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * Tool definition for Responses API
 */
export interface XAIResponsesTool {
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
export type XAIResponsesToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; name: string };

/**
 * Text configuration for structured output
 */
export interface XAIResponsesTextConfig {
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
export interface XAIResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  model: string;
  output: XAIResponsesOutputItem[];
  usage: XAIResponsesUsage;
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress';
  error?: {
    code: string;
    message: string;
  };
  incomplete_details?: {
    reason: string;
  };
  /** Citations from live search */
  citations?: string[];
  /** Inline citations in response */
  inline_citations?: Array<{ text: string; url: string }>;
}

export type XAIResponsesOutputItem =
  | XAIResponsesMessageOutput
  | XAIResponsesFunctionCallOutput;

export interface XAIResponsesMessageOutput {
  type: 'message';
  id: string;
  role: 'assistant';
  content: XAIResponsesOutputContent[];
  status: 'completed' | 'in_progress';
}

export interface XAIResponsesFunctionCallOutput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: 'completed' | 'in_progress';
}

export type XAIResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

export interface XAIResponsesUsage {
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
export type XAIResponsesStreamEvent =
  | XAIResponseCreatedEvent
  | XAIResponseInProgressEvent
  | XAIResponseCompletedEvent
  | XAIResponseFailedEvent
  | XAIResponseOutputItemAddedEvent
  | XAIResponseOutputItemDoneEvent
  | XAIResponseContentPartAddedEvent
  | XAIResponseContentPartDoneEvent
  | XAIResponseTextDeltaEvent
  | XAIResponseTextDoneEvent
  | XAIResponseRefusalDeltaEvent
  | XAIResponseRefusalDoneEvent
  | XAIResponseFunctionCallArgumentsDeltaEvent
  | XAIResponseFunctionCallArgumentsDoneEvent
  | XAIResponseErrorEvent;

export interface XAIResponseCreatedEvent {
  type: 'response.created';
  response: XAIResponsesResponse;
}

export interface XAIResponseInProgressEvent {
  type: 'response.in_progress';
  response: XAIResponsesResponse;
}

export interface XAIResponseCompletedEvent {
  type: 'response.completed';
  response: XAIResponsesResponse;
}

export interface XAIResponseFailedEvent {
  type: 'response.failed';
  response: XAIResponsesResponse;
}

export interface XAIResponseOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: XAIResponsesOutputItem;
}

export interface XAIResponseOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: XAIResponsesOutputItem;
}

export interface XAIResponseContentPartAddedEvent {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  part: XAIResponsesOutputContent;
}

export interface XAIResponseContentPartDoneEvent {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  part: XAIResponsesOutputContent;
}

export interface XAIResponseTextDeltaEvent {
  type: 'response.output_text.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

export interface XAIResponseTextDoneEvent {
  type: 'response.output_text.done';
  output_index: number;
  content_index: number;
  text: string;
}

export interface XAIResponseRefusalDeltaEvent {
  type: 'response.refusal.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

export interface XAIResponseRefusalDoneEvent {
  type: 'response.refusal.done';
  output_index: number;
  content_index: number;
  refusal: string;
}

export interface XAIResponseFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  item_id: string;
  delta: string;
  call_id?: string;
}

export interface XAIResponseFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  item_id: string;
  name: string;
  arguments: string;
  call_id?: string;
}

export interface XAIResponseErrorEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
  };
}

// ============================================
// Messages API Types (Anthropic-compatible)
// ============================================

/**
 * Messages API request body
 */
export interface XAIMessagesRequest {
  model: string;
  max_tokens?: number;
  messages: XAIMessagesMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: XAIMessagesTool[];
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  metadata?: { user_id?: string };
  thinking?: { type: 'enabled'; budget_tokens: number };
}

/**
 * Messages API message format
 */
export interface XAIMessagesMessage {
  role: 'user' | 'assistant';
  content: XAIMessagesContent[] | string;
}

/**
 * Messages API content types
 */
export type XAIMessagesContent =
  | XAIMessagesTextContent
  | XAIMessagesImageContent
  | XAIMessagesToolUseContent
  | XAIMessagesToolResultContent;

export interface XAIMessagesTextContent {
  type: 'text';
  text: string;
}

export interface XAIMessagesImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface XAIMessagesToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface XAIMessagesToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | XAIMessagesContent[];
  is_error?: boolean;
}

/**
 * Messages API tool format
 */
export interface XAIMessagesTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Messages API response format
 */
export interface XAIMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: XAIMessagesResponseContent[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export type XAIMessagesResponseContent =
  | XAIMessagesTextContent
  | XAIMessagesToolUseContent
  | XAIMessagesThinkingContent;

export interface XAIMessagesThinkingContent {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

/**
 * Messages API streaming event types
 */
export type XAIMessagesStreamEvent =
  | XAIMessagesMessageStartEvent
  | XAIMessagesContentBlockStartEvent
  | XAIMessagesContentBlockDeltaEvent
  | XAIMessagesContentBlockStopEvent
  | XAIMessagesMessageDeltaEvent
  | XAIMessagesMessageStopEvent
  | XAIMessagesPingEvent
  | XAIMessagesErrorEvent;

export interface XAIMessagesMessageStartEvent {
  type: 'message_start';
  message: XAIMessagesResponse;
}

export interface XAIMessagesContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: XAIMessagesResponseContent;
}

export interface XAIMessagesContentBlockDeltaEvent {
  type: 'content_block_delta';
  /** Index may be omitted by xAI (unlike Anthropic) - use tracked currentIndex as fallback */
  index?: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'signature_delta'; signature: string }
    | { type: 'input_json_delta'; partial_json: string };
}

export interface XAIMessagesContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface XAIMessagesMessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: string | null;
    stop_sequence: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

export interface XAIMessagesMessageStopEvent {
  type: 'message_stop';
}

export interface XAIMessagesPingEvent {
  type: 'ping';
}

export interface XAIMessagesErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}
