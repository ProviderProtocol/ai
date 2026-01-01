// ============================================
// Audio Configuration Types
// ============================================

/**
 * Audio output configuration for Chat Completions
 */
export interface OpenAIAudioConfig {
  /** Audio format */
  format: 'wav' | 'aac' | 'mp3' | 'flac' | 'opus' | 'pcm16';
  /** Voice to use for audio generation */
  voice:
    | 'alloy'
    | 'ash'
    | 'ballad'
    | 'coral'
    | 'echo'
    | 'sage'
    | 'shimmer'
    | 'verse'
    | 'marin'
    | 'cedar';
}

// ============================================
// Web Search Configuration Types
// ============================================

/**
 * User location for web search context (Responses API format)
 * Fields are at the same level as type
 */
export interface OpenAIWebSearchUserLocation {
  /** Location type - must be 'approximate' */
  type: 'approximate';
  /** City name */
  city?: string;
  /** ISO 3166-1 country code (e.g., "US") */
  country?: string;
  /** Region/state name */
  region?: string;
  /** IANA timezone (e.g., "America/New_York") */
  timezone?: string;
}

/**
 * User location for web search context (Chat Completions API format)
 * Fields are nested under 'approximate' object
 */
export interface OpenAICompletionsWebSearchUserLocation {
  /** Location type - must be 'approximate' */
  type: 'approximate';
  /** Approximate location details */
  approximate: {
    /** City name */
    city?: string;
    /** ISO 3166-1 country code (e.g., "US") */
    country?: string;
    /** Region/state name */
    region?: string;
    /** IANA timezone (e.g., "America/New_York") */
    timezone?: string;
  };
}

/**
 * Web search options for Chat Completions API
 * Use with gpt-5-search-api-* models
 */
export interface OpenAIWebSearchOptions {
  /**
   * Context size for search results
   * Controls how much context from web results to include
   */
  search_context_size?: 'low' | 'medium' | 'high';
  /** User location for localizing search results */
  user_location?: OpenAICompletionsWebSearchUserLocation | null;
}

/**
 * OpenAI Chat Completions API parameters
 * These are passed through to the /v1/chat/completions endpoint
 */
export interface OpenAICompletionsParams {
  /** Maximum number of tokens to generate (legacy, prefer max_completion_tokens) */
  max_tokens?: number;

  /** Maximum completion tokens (preferred for newer models) */
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

  /** Seed for deterministic sampling (beta, deprecated) */
  seed?: number;

  /** User identifier (deprecated, use safety_identifier or prompt_cache_key) */
  user?: string;

  /** Logit bias map */
  logit_bias?: Record<string, number>;

  /** Verbosity control */
  verbosity?: 'low' | 'medium' | 'high';

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Reasoning effort for reasoning models */
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

  /** Service tier */
  service_tier?: 'auto' | 'default' | 'flex' | 'scale' | 'priority';

  /** Store completion for distillation */
  store?: boolean;

  /** Metadata key-value pairs (max 16, keys max 64 chars, values max 512 chars) */
  metadata?: Record<string, string>;

  /** Response format for structured output */
  response_format?: OpenAIResponseFormat;

  /**
   * Predicted Output configuration for faster regeneration
   * Improves response times when large parts of the response are known ahead of time
   */
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };

  /**
   * Stable identifier for caching similar requests
   * Used to optimize cache hit rates (replaces user field)
   */
  prompt_cache_key?: string;

  /**
   * Retention policy for prompt cache
   * Set to "24h" to enable extended prompt caching up to 24 hours
   */
  prompt_cache_retention?: 'in-memory' | '24h';

  /**
   * Stable identifier for abuse detection
   * Recommend hashing username or email address
   */
  safety_identifier?: string;

  /**
   * Output modalities to generate
   * Default: ["text"]. Use ["text", "audio"] for audio-capable models
   */
  modalities?: Array<'text' | 'audio'>;

  /**
   * Audio output configuration
   * Required when modalities includes "audio"
   */
  audio?: OpenAIAudioConfig | null;

  /**
   * Web search configuration
   * Enables the model to search the web for up-to-date information
   */
  web_search_options?: OpenAIWebSearchOptions;
}

/**
 * Prompt template reference for Responses API
 */
export interface OpenAIPromptTemplate {
  /** Prompt template ID */
  id: string;
  /** Variables to fill into the template */
  variables?: Record<string, string>;
}

/**
 * Conversation reference for Responses API
 * Items from this conversation are prepended to input_items
 */
export interface OpenAIConversation {
  /** Conversation ID */
  id: string;
}

/**
 * OpenAI Responses API parameters
 * These are passed through to the /v1/responses endpoint
 */
export interface OpenAIResponsesParams {
  /** Maximum output tokens */
  max_output_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Number of top logprobs to return (0-20) */
  top_logprobs?: number;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Reasoning configuration (for gpt-5 and o-series models) */
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    /** Include summary of reasoning */
    summary?: 'auto' | 'concise' | 'detailed';
  };

  /** Service tier */
  service_tier?: 'auto' | 'default' | 'flex' | 'scale' | 'priority';

  /** Truncation strategy */
  truncation?: 'auto' | 'disabled';

  /**
   * Fields to include in output
   * Supported values:
   * - 'web_search_call.action.sources': Include web search sources
   * - 'code_interpreter_call.outputs': Include code execution outputs
   * - 'computer_call_output.output.image_url': Include computer call images
   * - 'file_search_call.results': Include file search results
   * - 'message.input_image.image_url': Include input image URLs
   * - 'message.output_text.logprobs': Include logprobs with messages
   * - 'reasoning.encrypted_content': Include encrypted reasoning tokens
   */
  include?: string[];

  /** Background processing - run response asynchronously */
  background?: boolean;

  /** Continue from a previous response (cannot use with conversation) */
  previous_response_id?: string;

  /**
   * Conversation context - items prepended to input_items
   * Cannot be used with previous_response_id
   */
  conversation?: string | OpenAIConversation;

  /** Store response for continuation */
  store?: boolean;

  /** Metadata key-value pairs (max 16, keys max 64 chars, values max 512 chars) */
  metadata?: Record<string, string>;

  /**
   * Maximum total calls to built-in tools in a response
   * Applies across all built-in tool calls, not per tool
   */
  max_tool_calls?: number;

  /**
   * Reference to a prompt template and its variables
   */
  prompt?: OpenAIPromptTemplate;

  /**
   * Stable identifier for caching similar requests
   * Used to optimize cache hit rates (replaces user field)
   */
  prompt_cache_key?: string;

  /**
   * Retention policy for prompt cache
   * Set to "24h" to enable extended prompt caching up to 24 hours
   */
  prompt_cache_retention?: 'in-memory' | '24h';

  /**
   * Stable identifier for abuse detection
   * Recommend hashing username or email address
   */
  safety_identifier?: string;

  /** User identifier (deprecated, use safety_identifier or prompt_cache_key) */
  user?: string;

  /**
   * Built-in tools for the Responses API
   * Use the tool helper constructors: tools.webSearch(), tools.imageGeneration(), etc.
   *
   * @example
   * ```ts
   * import { tools } from 'provider-protocol/openai';
   *
   * const model = llm({
   *   model: openai('gpt-4o'),
   *   params: {
   *     tools: [
   *       tools.webSearch(),
   *       tools.imageGeneration({ quality: 'high' }),
   *     ],
   *   },
   * });
   * ```
   */
  tools?: OpenAIBuiltInTool[];
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
  /** Output modalities (text, audio) */
  modalities?: Array<'text' | 'audio'>;
  /** Audio output configuration */
  audio?: OpenAIAudioConfig | null;
  /** Web search configuration */
  web_search_options?: OpenAIWebSearchOptions;
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
  top_logprobs?: number;
  stream?: boolean;
  tools?: OpenAIResponsesToolUnion[];
  tool_choice?: OpenAIResponsesToolChoice;
  parallel_tool_calls?: boolean;
  text?: OpenAIResponsesTextConfig;
  truncation?: 'auto' | 'disabled';
  store?: boolean;
  metadata?: Record<string, string>;
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    summary?: 'auto' | 'concise' | 'detailed';
  };
  service_tier?: string;
  include?: string[];
  background?: boolean;
  previous_response_id?: string;
  /** Conversation context (cannot use with previous_response_id) */
  conversation?: string | OpenAIConversation;
  /** Maximum total calls to built-in tools */
  max_tool_calls?: number;
  /** Prompt template reference */
  prompt?: OpenAIPromptTemplate;
  /** Stable identifier for caching (replaces user) */
  prompt_cache_key?: string;
  /** Retention policy for prompt cache */
  prompt_cache_retention?: 'in-memory' | '24h';
  /** Stable identifier for abuse detection */
  safety_identifier?: string;
  /** User identifier (deprecated) */
  user?: string;
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
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesImageGenerationOutput
  | OpenAIResponsesWebSearchOutput;

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

export interface OpenAIResponsesImageGenerationOutput {
  type: 'image_generation_call';
  id: string;
  result?: string;
  status: 'completed' | 'in_progress';
}

export interface OpenAIResponsesWebSearchOutput {
  type: 'web_search_call';
  id: string;
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

// ============================================
// Built-in Tools for Responses API
// ============================================

/**
 * Web search tool for Responses API
 * Enables the model to search the web for up-to-date information
 */
export interface OpenAIWebSearchTool {
  type: 'web_search';
  /**
   * Context size for search results
   * Controls how much context from web results to include
   */
  search_context_size?: 'low' | 'medium' | 'high';
  /** User location for localizing search results */
  user_location?: OpenAIWebSearchUserLocation | null;
}

/**
 * File search tool for Responses API
 * Enables the model to search through uploaded files
 */
export interface OpenAIFileSearchTool {
  type: 'file_search';
  /** File search configuration */
  file_search?: {
    /** Vector store IDs to search */
    vector_store_ids: string[];
    /** Maximum number of results to return */
    max_num_results?: number;
    /** Ranking options for search results */
    ranking_options?: {
      /** Ranker to use */
      ranker?: 'auto' | 'default_2024_08_21';
      /** Score threshold (0-1) */
      score_threshold?: number;
    };
    /** Filters to apply */
    filters?: Record<string, unknown>;
  };
}

/**
 * Code interpreter container configuration
 */
export interface OpenAICodeInterpreterContainer {
  /** Container type - 'auto' creates a new container */
  type: 'auto';
  /** Memory limit for the container (e.g., '1g', '4g') */
  memory_limit?: string;
  /** File IDs to make available in the container */
  file_ids?: string[];
}

/**
 * Code interpreter tool for Responses API
 * Allows the model to write and run Python code
 */
export interface OpenAICodeInterpreterTool {
  type: 'code_interpreter';
  /** Code interpreter configuration */
  code_interpreter?: {
    /** Container configuration */
    container: string | OpenAICodeInterpreterContainer;
  };
}

/**
 * Computer tool environment configuration
 */
export interface OpenAIComputerEnvironment {
  /** Environment type */
  type: 'browser' | 'mac' | 'windows' | 'linux' | 'ubuntu';
}

/**
 * Computer tool for Responses API
 * Enables the model to interact with computer interfaces
 */
export interface OpenAIComputerTool {
  type: 'computer';
  /** Computer tool configuration */
  computer?: {
    /** Display width in pixels */
    display_width: number;
    /** Display height in pixels */
    display_height: number;
    /** Environment configuration */
    environment?: OpenAIComputerEnvironment;
  };
}

/**
 * Image generation tool for Responses API
 */
export interface OpenAIImageGenerationTool {
  type: 'image_generation';
  /** Background transparency */
  background?: 'transparent' | 'opaque' | 'auto';
  /** Input image formats supported */
  input_image_mask?: boolean;
  /** Model to use for generation */
  model?: string;
  /** Moderation level */
  moderation?: 'auto' | 'low';
  /** Output compression */
  output_compression?: number;
  /** Output format */
  output_format?: 'png' | 'jpeg' | 'webp';
  /** Partial images during streaming */
  partial_images?: number;
  /** Image quality */
  quality?: 'auto' | 'high' | 'medium' | 'low';
  /** Image size */
  size?: 'auto' | '1024x1024' | '1024x1536' | '1536x1024';
}

/**
 * MCP (Model Context Protocol) server configuration
 */
export interface OpenAIMcpServerConfig {
  /** Server URL */
  url: string;
  /** Server name for identification */
  name?: string;
  /** Tool configuration for the server */
  tool_configuration?: {
    /** Allowed tools from this server */
    allowed_tools?: string[] | { type: 'all' };
  };
  /** Headers to send with requests */
  headers?: Record<string, string>;
  /** Allowed resources */
  allowed_resources?: string[];
  /** Require approval for tool calls */
  require_approval?: 'always' | 'never' | { type: 'except'; tools: string[] };
}

/**
 * MCP tool for Responses API
 * Enables connections to MCP servers
 */
export interface OpenAIMcpTool {
  type: 'mcp';
  /** MCP server configurations */
  mcp?: {
    /** Server configuration */
    server: OpenAIMcpServerConfig;
  };
}

/**
 * Union type for all Responses API built-in tools
 */
export type OpenAIBuiltInTool =
  | OpenAIWebSearchTool
  | OpenAIFileSearchTool
  | OpenAICodeInterpreterTool
  | OpenAIComputerTool
  | OpenAIImageGenerationTool
  | OpenAIMcpTool;

/**
 * Combined tool type for Responses API (built-in or function)
 */
export type OpenAIResponsesToolUnion = OpenAIResponsesTool | OpenAIBuiltInTool;

// ============================================
// Tool Helper Constructors
// ============================================

/**
 * Helper to create a web search tool
 * Note: Configuration options are passed at the top level, not nested
 */
export function webSearchTool(options?: {
  search_context_size?: 'low' | 'medium' | 'high';
  user_location?: OpenAIWebSearchUserLocation | null;
}): OpenAIWebSearchTool {
  if (options) {
    return {
      type: 'web_search',
      ...options,
    } as OpenAIWebSearchTool;
  }
  return { type: 'web_search' };
}

/**
 * Helper to create a file search tool
 */
export function fileSearchTool(options: {
  vector_store_ids: string[];
  max_num_results?: number;
  ranking_options?: {
    ranker?: 'auto' | 'default_2024_08_21';
    score_threshold?: number;
  };
  filters?: Record<string, unknown>;
}): OpenAIFileSearchTool {
  return {
    type: 'file_search',
    file_search: options,
  };
}

/**
 * Helper to create a code interpreter tool
 */
export function codeInterpreterTool(options?: {
  container?: string | OpenAICodeInterpreterContainer;
}): OpenAICodeInterpreterTool {
  return {
    type: 'code_interpreter',
    ...(options?.container && { code_interpreter: { container: options.container } }),
  };
}

/**
 * Helper to create a computer tool
 */
export function computerTool(options: {
  display_width: number;
  display_height: number;
  environment?: OpenAIComputerEnvironment;
}): OpenAIComputerTool {
  return {
    type: 'computer',
    computer: options,
  };
}

/**
 * Helper to create an image generation tool
 * Note: Configuration options are passed at the top level, not nested
 */
export function imageGenerationTool(options?: {
  background?: 'transparent' | 'opaque' | 'auto';
  model?: string;
  quality?: 'auto' | 'high' | 'medium' | 'low';
  size?: 'auto' | '1024x1024' | '1024x1536' | '1536x1024';
  output_format?: 'png' | 'jpeg' | 'webp';
}): OpenAIImageGenerationTool {
  if (options) {
    return {
      type: 'image_generation',
      ...options,
    };
  }
  return { type: 'image_generation' };
}

/**
 * Helper to create an MCP tool
 */
export function mcpTool(options: {
  url: string;
  name?: string;
  allowed_tools?: string[] | { type: 'all' };
  headers?: Record<string, string>;
  require_approval?: 'always' | 'never' | { type: 'except'; tools: string[] };
}): OpenAIMcpTool {
  const { url, name, allowed_tools, headers, require_approval } = options;
  return {
    type: 'mcp',
    mcp: {
      server: {
        url,
        name,
        ...(allowed_tools && { tool_configuration: { allowed_tools } }),
        headers,
        require_approval,
      },
    },
  };
}

/**
 * Namespace for tool helper constructors
 */
export const tools = {
  webSearch: webSearchTool,
  fileSearch: fileSearchTool,
  codeInterpreter: codeInterpreterTool,
  computer: computerTool,
  imageGeneration: imageGenerationTool,
  mcp: mcpTool,
};
