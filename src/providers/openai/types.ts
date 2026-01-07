/**
 * @fileoverview OpenAI Provider Type Definitions
 *
 * This module contains all TypeScript type definitions for the OpenAI provider,
 * including types for both the Chat Completions API and the Responses API.
 *
 * The types are organized into sections:
 * - Audio Configuration Types
 * - Web Search Configuration Types
 * - Chat Completions API Parameters and Types
 * - Responses API Parameters and Types
 * - Built-in Tools for Responses API
 * - Tool Helper Constructors
 *
 * @module providers/openai/types
 */

// ============================================
// Audio Configuration Types
// ============================================

/**
 * Audio output configuration for Chat Completions API.
 *
 * Enables audio output generation when using models that support
 * the audio modality. Requires `modalities: ['text', 'audio']`.
 */
export interface OpenAIAudioConfig {
  /** Audio format for the generated output */
  format: 'wav' | 'aac' | 'mp3' | 'flac' | 'opus' | 'pcm16';
  /** Voice model to use for audio generation */
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
 * User location for web search context in the Responses API.
 *
 * Used to localize web search results based on the user's approximate location.
 * In the Responses API, location fields are at the same level as the type field.
 *
 * @see {@link OpenAICompletionsWebSearchUserLocation} for the Chat Completions API version
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
 * User location for web search context in the Chat Completions API.
 *
 * Used to localize web search results based on the user's approximate location.
 * In the Completions API, location fields are nested under an `approximate` object.
 *
 * @see {@link OpenAIWebSearchUserLocation} for the Responses API version
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
 * Web search configuration options for the Chat Completions API.
 *
 * Enables web search capabilities when using search-enabled models.
 * Use with models that support web search (e.g., gpt-4o-search-preview).
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
 * Parameters for the OpenAI Chat Completions API.
 *
 * These parameters are passed directly to the `/v1/chat/completions` endpoint.
 * The Chat Completions API is the legacy API for chat interactions with
 * OpenAI models. For the modern API with built-in tools, see {@link OpenAIResponsesParams}.
 *
 * @example
 * ```typescript
 * const params: OpenAICompletionsParams = {
 *   temperature: 0.7,
 *   max_tokens: 1000,
 *   reasoning_effort: 'medium'
 * };
 * ```
 *
 * @see {@link OpenAIResponsesParams} for the modern Responses API parameters
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
 * Reference to a prompt template stored in OpenAI's system.
 *
 * Allows using pre-defined prompt templates with variable substitution.
 */
export interface OpenAIPromptTemplate {
  /** Prompt template ID */
  id: string;
  /** Variables to fill into the template */
  variables?: Record<string, string>;
}

/**
 * Reference to an existing conversation for the Responses API.
 *
 * Items from this conversation are prepended to the input items,
 * enabling multi-turn conversations without resending full history.
 * Cannot be used together with `previous_response_id`.
 */
export interface OpenAIConversation {
  /** Conversation ID */
  id: string;
}

/**
 * Parameters for the OpenAI Responses API.
 *
 * These parameters are passed directly to the `/v1/responses` endpoint.
 * The Responses API is the modern, recommended API that supports built-in
 * tools like web search, image generation, file search, and code interpreter.
 *
 * @example Basic usage
 * ```typescript
 * const params: OpenAIResponsesParams = {
 *   max_output_tokens: 1000,
 *   temperature: 0.7,
 *   reasoning: { effort: 'medium' }
 * };
 * ```
 *
 * @example With built-in tools
 * ```typescript
 * import { tools } from './types';
 *
 * const params: OpenAIResponsesParams = {
 *   max_output_tokens: 2000,
 *   tools: [tools.webSearch(), tools.imageGeneration()]
 * };
 * ```
 *
 * @see {@link OpenAICompletionsParams} for the legacy Chat Completions API parameters
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
 * The API mode for the OpenAI provider.
 *
 * - `'responses'` - Modern Responses API (recommended)
 * - `'completions'` - Legacy Chat Completions API
 */
export type OpenAIAPIMode = 'responses' | 'completions';

/**
 * Options when creating an OpenAI model reference.
 */
export interface OpenAIModelOptions {
  /** Which API to use */
  api?: OpenAIAPIMode;
}

/**
 * Model reference with OpenAI-specific options.
 * Used internally to track the selected model and API mode.
 */
export interface OpenAIModelReference {
  /** The OpenAI model identifier (e.g., 'gpt-4o', 'o1-preview') */
  modelId: string;
  /** Optional model-specific options */
  options?: OpenAIModelOptions;
}

/**
 * Configuration options for the OpenAI provider.
 */
export interface OpenAIConfig {
  /** Which API to use: 'responses' (modern) or 'completions' (legacy) */
  api?: 'responses' | 'completions';
}

// ============================================
// Chat Completions API Types
// ============================================

/**
 * Request body for the OpenAI Chat Completions API.
 *
 * This interface represents the full request structure sent to
 * `/v1/chat/completions`. Most fields are optional and passed through
 * from {@link OpenAICompletionsParams}.
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
 * Union type for all message types in the Chat Completions API.
 */
export type OpenAICompletionsMessage =
  | OpenAISystemMessage
  | OpenAIUserMessage
  | OpenAIAssistantMessage
  | OpenAIToolMessage;

/** System or developer message for setting context and instructions */
export interface OpenAISystemMessage {
  role: 'system' | 'developer';
  content: string;
  name?: string;
}

/** User message with text or multimodal content */
export interface OpenAIUserMessage {
  role: 'user';
  content: string | OpenAIUserContent[];
  name?: string;
}

/** Assistant message containing the model's response */
export interface OpenAIAssistantMessage {
  role: 'assistant';
  content?: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  refusal?: string | null;
}

/** Tool result message providing output from a function call */
export interface OpenAIToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * Union type for user content parts (text or image).
 */
export type OpenAIUserContent = OpenAITextContent | OpenAIImageContent;

/** Text content part */
export interface OpenAITextContent {
  type: 'text';
  text: string;
}

/** Image content part with URL reference */
export interface OpenAIImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Tool call structure in assistant messages.
 * Represents a function call requested by the model.
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
 * Tool definition for the Chat Completions API.
 * Functions are defined with JSON Schema parameters.
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
 * Tool choice options for controlling function calling behavior.
 */
export type OpenAIToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Response format options for structured output.
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
 * Response structure from the Chat Completions API.
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

/** A single choice from a completion response */
export interface OpenAICompletionsChoice {
  index: number;
  message: OpenAIAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: OpenAILogprobs | null;
}

/** Log probability information for tokens */
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

/** Token usage statistics from the API response */
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
 * Streaming chunk structure from the Chat Completions API.
 * Sent via SSE during streaming responses.
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

/** A streaming choice containing incremental content */
export interface OpenAICompletionsStreamChoice {
  index: number;
  delta: OpenAICompletionsStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: OpenAILogprobs | null;
}

/** Incremental content delta in a streaming chunk */
export interface OpenAICompletionsStreamDelta {
  role?: 'assistant';
  content?: string | null;
  tool_calls?: OpenAIStreamToolCall[];
  refusal?: string | null;
}

/** Incremental tool call data in a streaming chunk */
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
 * Request body for the OpenAI Responses API.
 *
 * This interface represents the full request structure sent to
 * `/v1/responses`. Supports both function tools and built-in tools.
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
 * Union type for all input item types in the Responses API.
 */
export type OpenAIResponsesInputItem =
  | OpenAIResponsesSystemItem
  | OpenAIResponsesUserItem
  | OpenAIResponsesAssistantItem
  | OpenAIResponsesFunctionCallInputItem
  | OpenAIResponsesToolResultItem;

/** System or developer message input item */
export interface OpenAIResponsesSystemItem {
  type: 'message';
  role: 'system' | 'developer';
  content: string | OpenAIResponsesContentPart[];
}

/** User message input item */
export interface OpenAIResponsesUserItem {
  type: 'message';
  role: 'user';
  content: string | OpenAIResponsesContentPart[];
}

/** Assistant message input item (for conversation history) */
export interface OpenAIResponsesAssistantItem {
  type: 'message';
  role: 'assistant';
  content: string | OpenAIResponsesContentPart[];
}

/** Function call input item (precedes function_call_output) */
export interface OpenAIResponsesFunctionCallInputItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/** Function call output (tool result) input item */
export interface OpenAIResponsesToolResultItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/**
 * Union type for content parts in the Responses API.
 */
export type OpenAIResponsesContentPart =
  | OpenAIResponsesTextPart
  | OpenAIResponsesImagePart
  | OpenAIResponsesFunctionCallPart;

/** Text content part (input or output) */
export interface OpenAIResponsesTextPart {
  type: 'input_text' | 'output_text';
  text: string;
}

/** Image content part */
export interface OpenAIResponsesImagePart {
  type: 'input_image';
  image_url?: string;
  image?: string;
  detail?: 'auto' | 'low' | 'high';
}

/** Function call content part (embedded in messages) */
export interface OpenAIResponsesFunctionCallPart {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * Function tool definition for the Responses API.
 * Uses a flatter structure than Chat Completions.
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
 * Tool choice options for the Responses API.
 */
export type OpenAIResponsesToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; name: string };

/**
 * Text output configuration for structured output in the Responses API.
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
 * Response structure from the Responses API.
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

/**
 * Union type for all output item types in Responses API responses.
 */
export type OpenAIResponsesOutputItem =
  | OpenAIResponsesMessageOutput
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesImageGenerationOutput
  | OpenAIResponsesWebSearchOutput;

/** Assistant message output item */
export interface OpenAIResponsesMessageOutput {
  type: 'message';
  id: string;
  role: 'assistant';
  content: OpenAIResponsesOutputContent[];
  status: 'completed' | 'in_progress';
}

/** Function call output item (tool call requested by model) */
export interface OpenAIResponsesFunctionCallOutput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: 'completed' | 'in_progress';
}

/** Image generation output item (from built-in image generation tool) */
export interface OpenAIResponsesImageGenerationOutput {
  type: 'image_generation_call';
  id: string;
  result?: string;
  status: 'completed' | 'in_progress';
}

/** Web search output item (from built-in web search tool) */
export interface OpenAIResponsesWebSearchOutput {
  type: 'web_search_call';
  id: string;
  status: 'completed' | 'in_progress';
}

/** Output content types (text or refusal) */
export type OpenAIResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

/** Token usage statistics for Responses API */
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
 * Union type for all streaming events from the Responses API.
 * The Responses API uses granular events for different stages of response generation.
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
 * Creates a web search tool configuration for the Responses API.
 *
 * The web search tool enables the model to search the web for up-to-date information.
 *
 * @param options - Optional configuration for search behavior and user location
 * @returns A web search tool configuration object
 *
 * @example
 * ```typescript
 * // Basic web search
 * const search = webSearchTool();
 *
 * // With configuration
 * const searchWithLocation = webSearchTool({
 *   search_context_size: 'high',
 *   user_location: {
 *     type: 'approximate',
 *     city: 'San Francisco',
 *     country: 'US'
 *   }
 * });
 * ```
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
 * Creates a file search tool configuration for the Responses API.
 *
 * The file search tool enables the model to search through files in vector stores.
 *
 * @param options - Configuration including vector store IDs and search options
 * @returns A file search tool configuration object
 *
 * @example
 * ```typescript
 * const fileSearch = fileSearchTool({
 *   vector_store_ids: ['vs_abc123'],
 *   max_num_results: 10
 * });
 * ```
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
 * Creates a code interpreter tool configuration for the Responses API.
 *
 * The code interpreter tool allows the model to write and execute Python code
 * in a sandboxed environment.
 *
 * @param options - Optional container configuration
 * @returns A code interpreter tool configuration object
 *
 * @example
 * ```typescript
 * // Default configuration
 * const interpreter = codeInterpreterTool();
 *
 * // With custom container settings
 * const customInterpreter = codeInterpreterTool({
 *   container: {
 *     type: 'auto',
 *     memory_limit: '4g',
 *     file_ids: ['file_abc123']
 *   }
 * });
 * ```
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
 * Creates a computer tool configuration for the Responses API.
 *
 * The computer tool enables the model to interact with computer interfaces
 * through mouse and keyboard actions.
 *
 * @param options - Display configuration and environment settings
 * @returns A computer tool configuration object
 *
 * @example
 * ```typescript
 * const computer = computerTool({
 *   display_width: 1920,
 *   display_height: 1080,
 *   environment: { type: 'browser' }
 * });
 * ```
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
 * Creates an image generation tool configuration for the Responses API.
 *
 * The image generation tool allows the model to generate images based on prompts.
 *
 * @param options - Optional image generation settings
 * @returns An image generation tool configuration object
 *
 * @example
 * ```typescript
 * // Default configuration
 * const imageGen = imageGenerationTool();
 *
 * // With custom settings
 * const customImageGen = imageGenerationTool({
 *   quality: 'high',
 *   size: '1024x1024',
 *   background: 'transparent'
 * });
 * ```
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
 * Creates an MCP (Model Context Protocol) tool configuration for the Responses API.
 *
 * The MCP tool enables connections to external MCP servers, allowing the model
 * to use tools and resources provided by those servers.
 *
 * @param options - MCP server configuration
 * @returns An MCP tool configuration object
 *
 * @example
 * ```typescript
 * const mcp = mcpTool({
 *   url: 'https://mcp-server.example.com',
 *   name: 'my-mcp-server',
 *   allowed_tools: ['tool1', 'tool2']
 * });
 * ```
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
 * Namespace object containing all tool helper constructors.
 *
 * Provides a convenient way to create built-in tool configurations
 * for the Responses API.
 *
 * @example
 * ```typescript
 * import { tools } from './types';
 *
 * const params = {
 *   tools: [
 *     tools.webSearch(),
 *     tools.imageGeneration({ quality: 'high' }),
 *     tools.codeInterpreter()
 *   ]
 * };
 * ```
 */
export const tools = {
  /** Creates a web search tool configuration */
  webSearch: webSearchTool,
  /** Creates a file search tool configuration */
  fileSearch: fileSearchTool,
  /** Creates a code interpreter tool configuration */
  codeInterpreter: codeInterpreterTool,
  /** Creates a computer tool configuration */
  computer: computerTool,
  /** Creates an image generation tool configuration */
  imageGeneration: imageGenerationTool,
  /** Creates an MCP tool configuration */
  mcp: mcpTool,
};
