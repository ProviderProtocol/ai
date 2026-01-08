/**
 * OpenRouter-specific types for the Unified Provider Protocol.
 *
 * This module defines types for both the Chat Completions API and the
 * Responses API (beta), including request/response formats, streaming
 * events, and OpenRouter-specific features like model routing.
 *
 * @module types
 */

/**
 * Parameters for OpenRouter's Chat Completions API.
 *
 * These parameters are passed through to the `/api/v1/chat/completions` endpoint.
 * Includes standard OpenAI-compatible parameters plus OpenRouter-specific features
 * like model routing and provider preferences.
 *
 * @see {@link https://openrouter.ai/docs/api-reference/chat-completions | OpenRouter Chat Completions API}
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
   * Output modalities for multimodal generation.
   * Set to `['text', 'image']` to enable image generation with compatible models.
   * @see {@link https://openrouter.ai/docs/guides/overview/multimodal/image-generation}
   */
  modalities?: Array<'text' | 'image'>;

  /**
   * Image generation configuration for Gemini models.
   * Only applies when `modalities` includes 'image'.
   * @see {@link https://openrouter.ai/docs/guides/overview/multimodal/image-generation}
   */
  image_config?: OpenRouterImageConfig;

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
 * Image generation configuration for OpenRouter.
 *
 * Used with Gemini image generation models to control output dimensions.
 *
 * @see {@link https://openrouter.ai/docs/guides/overview/multimodal/image-generation}
 */
export interface OpenRouterImageConfig {
  /**
   * Aspect ratio for generated images.
   * Supported values range from '1:1' (1024×1024) to '21:9' (1536×672).
   */
  aspect_ratio?: string;

  /**
   * Resolution level for generated images.
   * - '1K': Standard resolution
   * - '2K': Higher resolution
   * - '4K': Highest resolution
   */
  image_size?: '1K' | '2K' | '4K';
}

/**
 * Parameters for OpenRouter's Responses API (beta).
 *
 * These parameters are passed through to the `/api/v1/responses` endpoint.
 * The Responses API uses a different structure than Chat Completions and
 * supports features like reasoning configuration.
 *
 * @see {@link https://openrouter.ai/docs/api-reference/responses | OpenRouter Responses API}
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

  /**
   * Output modalities for multimodal generation.
   * Set to `['text', 'image']` to enable image generation with compatible models.
   * @see {@link https://openrouter.ai/docs/guides/overview/multimodal/image-generation}
   */
  modalities?: Array<'text' | 'image'>;

  /**
   * Image generation configuration.
   * Only applies when `modalities` includes 'image'.
   * @see {@link https://openrouter.ai/docs/guides/overview/multimodal/image-generation}
   */
  image_config?: OpenRouterImageConfig;
}

/**
 * API mode selection for OpenRouter provider.
 *
 * - `'completions'`: Chat Completions API (stable, recommended)
 * - `'responses'`: Responses API (beta)
 */
export type OpenRouterAPIMode = 'completions' | 'responses';

/**
 * Options for creating an OpenRouter model reference.
 */
export interface OpenRouterModelOptions {
  /** Which API to use for this model. */
  api?: OpenRouterAPIMode;
}

/**
 * Model reference with OpenRouter-specific options.
 */
export interface OpenRouterModelReference {
  /** The model identifier in `provider/model` format. */
  modelId: string;
  /** Optional API selection. */
  options?: OpenRouterModelOptions;
}

/**
 * Configuration for the OpenRouter provider.
 */
export interface OpenRouterConfig {
  /** Which API to use: 'completions' (default) or 'responses' (beta). */
  api?: 'completions' | 'responses';
}

/**
 * Provider routing preferences for OpenRouter.
 *
 * Controls how OpenRouter selects and routes requests to upstream providers.
 *
 * @see {@link https://openrouter.ai/docs/guides/routing/provider-selection | Provider Selection}
 */
export interface OpenRouterProviderPreferences {
  /** Allow fallback to other providers if the primary is unavailable. */
  allow_fallbacks?: boolean;
  /** Require that the provider supports all specified parameters. */
  require_parameters?: boolean;
  /** Data collection policy: 'allow' or 'deny'. */
  data_collection?: 'allow' | 'deny';
  /** Ordered list of preferred provider slugs. */
  order?: string[];
  /** List of provider slugs to exclude from routing. */
  ignore?: string[];
  /** Preferred quantization levels (e.g., 'fp16', 'int8'). */
  quantizations?: string[];
}

// ============================================================================
// Chat Completions API Types
// ============================================================================

/**
 * Request body for OpenRouter's Chat Completions API.
 *
 * This is the internal representation sent to the `/api/v1/chat/completions` endpoint.
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
  // Multimodal generation
  modalities?: Array<'text' | 'image'>;
  image_config?: OpenRouterImageConfig;
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
 * Union type for all Chat Completions message roles.
 */
export type OpenRouterCompletionsMessage =
  | OpenRouterSystemMessage
  | OpenRouterUserMessage
  | OpenRouterAssistantMessage
  | OpenRouterToolMessage;

/**
 * System content block for system messages with cache_control support.
 */
export interface OpenRouterSystemContent {
  /** Content type identifier. */
  type: 'text';
  /** The text content. */
  text: string;
  /** Cache control for prompt caching. */
  cache_control?: OpenRouterCacheControl;
}

/**
 * System message in Chat Completions format.
 */
export interface OpenRouterSystemMessage {
  /** Message role identifier. */
  role: 'system';
  /** System prompt content - string or array with cache_control. */
  content: string | OpenRouterSystemContent[];
  /** Optional name for the system. */
  name?: string;
}

/**
 * User message in Chat Completions format.
 */
export interface OpenRouterUserMessage {
  /** Message role identifier. */
  role: 'user';
  /** User content as string or array of content parts. */
  content: string | OpenRouterUserContent[];
  /** Optional user name. */
  name?: string;
}

/**
 * Assistant message in Chat Completions format.
 */
export interface OpenRouterAssistantMessage {
  /** Message role identifier. */
  role: 'assistant';
  /** Text content from the assistant, or null if only tool calls. */
  content?: string | null;
  /** Optional assistant name. */
  name?: string;
  /** Tool calls made by the assistant. */
  tool_calls?: OpenRouterToolCall[];
  /**
   * Generated images from image generation models.
   * Present when the request included `modalities: ['text', 'image']`.
   */
  images?: OpenRouterGeneratedImage[];
}

/**
 * Generated image from an image generation model response.
 */
export interface OpenRouterGeneratedImage {
  /** Content type identifier. */
  type: 'image_url';
  /** Image URL configuration. */
  image_url: {
    /** Base64-encoded data URL of the generated image. */
    url: string;
  };
}

/**
 * Tool result message in Chat Completions format.
 */
export interface OpenRouterToolMessage {
  /** Message role identifier. */
  role: 'tool';
  /** Tool execution result as string. */
  content: string;
  /** ID of the tool call this result corresponds to. */
  tool_call_id: string;
  /** Optional tool name. */
  name?: string;
}

/**
 * Cache control configuration for prompt caching.
 *
 * Used by Anthropic-backed and Gemini-backed models on OpenRouter to enable
 * prompt prefix caching for cost reduction.
 *
 * @see {@link https://openrouter.ai/docs/guides/best-practices/prompt-caching}
 */
export interface OpenRouterCacheControl {
  /** Cache type (currently only 'ephemeral' is supported). */
  type: 'ephemeral';
  /** Optional TTL for extended cache retention. */
  ttl?: '1h';
}

/**
 * Union type for user message content parts.
 */
export type OpenRouterUserContent = OpenRouterTextContent | OpenRouterImageContent;

/**
 * Text content part in a user message.
 */
export interface OpenRouterTextContent {
  /** Content type identifier. */
  type: 'text';
  /** The text content. */
  text: string;
  /**
   * Cache control for prompt caching (Anthropic/Gemini models).
   * Only supported on text content blocks.
   */
  cache_control?: OpenRouterCacheControl;
}

/**
 * Image content part in a user message.
 */
export interface OpenRouterImageContent {
  /** Content type identifier. */
  type: 'image_url';
  /** Image URL configuration. */
  image_url: {
    /** Image URL (can be data URL or HTTP URL). */
    url: string;
    /** Image detail level for vision models. */
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Tool call made by the assistant in a Chat Completions response.
 */
export interface OpenRouterToolCall {
  /** Unique identifier for this tool call. */
  id: string;
  /** Tool type (currently only 'function' is supported). */
  type: 'function';
  /** Function call details. */
  function: {
    /** Name of the function to call. */
    name: string;
    /** JSON-encoded arguments for the function. */
    arguments: string;
  };
}

/**
 * Tool definition for Chat Completions API.
 */
export interface OpenRouterCompletionsTool {
  /** Tool type (currently only 'function' is supported). */
  type: 'function';
  /** Function definition. */
  function: {
    /** Function name. */
    name: string;
    /** Description of what the function does. */
    description: string;
    /** JSON Schema for function parameters. */
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

/**
 * Tool choice configuration for Chat Completions.
 *
 * - `'none'`: Model will not call any tools
 * - `'auto'`: Model decides whether to call tools
 * - Object: Force a specific function call
 */
export type OpenRouterToolChoice =
  | 'none'
  | 'auto'
  | { type: 'function'; function: { name: string } };

/**
 * Response format configuration for structured output.
 */
export type OpenRouterResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        /** Schema name for identification. */
        name: string;
        /** Optional schema description. */
        description?: string;
        /** JSON Schema definition. */
        schema: Record<string, unknown>;
        /** Enable strict schema validation. */
        strict?: boolean;
      };
    };

/**
 * Response from OpenRouter's Chat Completions API.
 */
export interface OpenRouterCompletionsResponse {
  /** Unique response identifier. */
  id: string;
  /** Object type identifier. */
  object: 'chat.completion';
  /** Unix timestamp of when the response was created. */
  created: number;
  /** Model used for generation. */
  model: string;
  /** Array of completion choices. */
  choices: OpenRouterCompletionsChoice[];
  /** Token usage statistics. */
  usage: OpenRouterUsage;
  /** System fingerprint for reproducibility. */
  system_fingerprint?: string;
}

/**
 * A single completion choice in a Chat Completions response.
 */
export interface OpenRouterCompletionsChoice {
  /** Index of this choice in the choices array. */
  index: number;
  /** The assistant's response message. */
  message: OpenRouterAssistantMessage;
  /** Reason the model stopped generating. */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  /** Log probability information (if requested). */
  logprobs?: OpenRouterLogprobs | null;
}

/**
 * Log probability information for generated tokens.
 */
export interface OpenRouterLogprobs {
  /** Array of token log probabilities. */
  content?: Array<{
    /** The generated token. */
    token: string;
    /** Log probability of this token. */
    logprob: number;
    /** Byte representation of the token. */
    bytes?: number[];
    /** Top alternative tokens and their probabilities. */
    top_logprobs?: Array<{
      token: string;
      logprob: number;
      bytes?: number[];
    }>;
  }>;
}

/**
 * Token usage statistics for Chat Completions.
 */
export interface OpenRouterUsage {
  /** Number of tokens in the input prompt. */
  prompt_tokens: number;
  /** Number of tokens generated in the completion. */
  completion_tokens: number;
  /** Total tokens (prompt + completion). */
  total_tokens: number;
  /** Details about prompt token breakdown including cache metrics. */
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
}

/**
 * A single chunk in a Chat Completions streaming response.
 */
export interface OpenRouterCompletionsStreamChunk {
  /** Response identifier (same for all chunks in a stream). */
  id: string;
  /** Object type identifier. */
  object: 'chat.completion.chunk';
  /** Unix timestamp of when the chunk was created. */
  created: number;
  /** Model used for generation. */
  model: string;
  /** Array of delta choices. */
  choices: OpenRouterCompletionsStreamChoice[];
  /** Token usage (only present in final chunk if stream_options.include_usage is true). */
  usage?: OpenRouterUsage | null;
  /** System fingerprint for reproducibility. */
  system_fingerprint?: string;
}

/**
 * A single choice in a streaming chunk.
 */
export interface OpenRouterCompletionsStreamChoice {
  /** Index of this choice. */
  index: number;
  /** Delta content for this chunk. */
  delta: OpenRouterCompletionsStreamDelta;
  /** Finish reason (only present in final chunk). */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  /** Log probability information. */
  logprobs?: OpenRouterLogprobs | null;
}

/**
 * Delta content in a streaming chunk.
 */
export interface OpenRouterCompletionsStreamDelta {
  /** Role (only present in first chunk). */
  role?: 'assistant';
  /** Text content delta. */
  content?: string | null;
  /** Tool call deltas. */
  tool_calls?: OpenRouterStreamToolCall[];
  /**
   * Generated images (typically sent in final chunk for image generation models).
   */
  images?: OpenRouterGeneratedImage[];
}

/**
 * Incremental tool call data in a streaming chunk.
 */
export interface OpenRouterStreamToolCall {
  /** Index of this tool call (for parallel tool calls). */
  index: number;
  /** Tool call ID (only in first chunk for this tool call). */
  id?: string;
  /** Tool type. */
  type?: 'function';
  /** Function call data delta. */
  function?: {
    /** Function name (only in first chunk for this tool call). */
    name?: string;
    /** Incremental JSON arguments. */
    arguments?: string;
  };
}

// ============================================================================
// Responses API Types (Beta)
// ============================================================================

/**
 * Request body for OpenRouter's Responses API (beta).
 *
 * Uses a different structure than Chat Completions, with input items
 * instead of messages.
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
 * Union type for all Responses API input items.
 */
export type OpenRouterResponsesInputItem =
  | OpenRouterResponsesSystemItem
  | OpenRouterResponsesUserItem
  | OpenRouterResponsesAssistantItem
  | OpenRouterResponsesFunctionCallInputItem
  | OpenRouterResponsesToolResultItem;

/**
 * System message input item for Responses API.
 */
export interface OpenRouterResponsesSystemItem {
  /** Item type identifier. */
  type: 'message';
  /** Role identifier. */
  role: 'system';
  /** System prompt content. */
  content: string | OpenRouterResponsesContentPart[];
}

/**
 * User message input item for Responses API.
 */
export interface OpenRouterResponsesUserItem {
  /** Item type identifier. */
  type: 'message';
  /** Role identifier. */
  role: 'user';
  /** User content. */
  content: string | OpenRouterResponsesContentPart[];
}

/**
 * Assistant message input item for Responses API.
 */
export interface OpenRouterResponsesAssistantItem {
  /** Item type identifier. */
  type: 'message';
  /** Role identifier. */
  role: 'assistant';
  /** Message identifier. */
  id: string;
  /** Message completion status. */
  status: 'completed' | 'in_progress';
  /** Message content parts. */
  content: OpenRouterResponsesContentPart[];
}

/**
 * Function call input item for Responses API (used in multi-turn conversations).
 */
export interface OpenRouterResponsesFunctionCallInputItem {
  /** Item type identifier. */
  type: 'function_call';
  /** Unique item identifier. */
  id: string;
  /** Call identifier for matching with output. */
  call_id: string;
  /** Function name. */
  name: string;
  /** JSON-encoded function arguments. */
  arguments: string;
}

/**
 * Tool result input item for Responses API.
 */
export interface OpenRouterResponsesToolResultItem {
  /** Item type identifier. */
  type: 'function_call_output';
  /** Unique item identifier. */
  id: string;
  /** Call identifier to match with function_call. */
  call_id: string;
  /** Tool execution result. */
  output: string;
}

/**
 * Union type for Responses API content parts.
 */
export type OpenRouterResponsesContentPart =
  | OpenRouterResponsesInputTextPart
  | OpenRouterResponsesOutputTextPart
  | OpenRouterResponsesImagePart
  | OpenRouterResponsesFunctionCallPart;

/**
 * @deprecated Use OpenRouterResponsesInputTextPart or OpenRouterResponsesOutputTextPart
 */
export type OpenRouterResponsesTextPart = OpenRouterResponsesInputTextPart | OpenRouterResponsesOutputTextPart;

/**
 * Input text content part for Responses API.
 */
export interface OpenRouterResponsesInputTextPart {
  /** Content type identifier. */
  type: 'input_text';
  /** The text content. */
  text: string;
}

/**
 * Output text content part from Responses API.
 */
export interface OpenRouterResponsesOutputTextPart {
  /** Content type identifier. */
  type: 'output_text';
  /** The generated text. */
  text: string;
  /** Optional annotations (e.g., citations). */
  annotations?: unknown[];
}

/**
 * Image content part for Responses API.
 */
export interface OpenRouterResponsesImagePart {
  /** Content type identifier. */
  type: 'input_image';
  /** Image URL (HTTP or data URL). */
  image_url?: string;
  /** Base64-encoded image data. */
  image?: string;
  /** Image detail level for vision models. */
  detail?: 'auto' | 'low' | 'high';
}

/**
 * Function call content part in Responses API.
 */
export interface OpenRouterResponsesFunctionCallPart {
  /** Content type identifier. */
  type: 'function_call';
  /** Unique item identifier. */
  id: string;
  /** Call identifier for matching with output. */
  call_id: string;
  /** Function name. */
  name: string;
  /** JSON-encoded function arguments. */
  arguments: string;
}

/**
 * Tool definition for Responses API.
 */
export interface OpenRouterResponsesTool {
  /** Tool type (currently only 'function' is supported). */
  type: 'function';
  /** Function name. */
  name: string;
  /** Description of what the function does. */
  description: string;
  /** JSON Schema for function parameters. */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Tool choice configuration for Responses API.
 */
export type OpenRouterResponsesToolChoice =
  | 'none'
  | 'auto'
  | { type: 'function'; name: string };

/**
 * Text configuration for structured output in Responses API.
 */
export interface OpenRouterResponsesTextConfig {
  /** Output format configuration. */
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
 * Response from OpenRouter's Responses API.
 */
export interface OpenRouterResponsesResponse {
  /** Unique response identifier. */
  id: string;
  /** Object type identifier. */
  object: 'response';
  /** Unix timestamp of when the response was created. */
  created_at: number;
  /** Model used for generation. */
  model: string;
  /** Output items from the response. */
  output: OpenRouterResponsesOutputItem[];
  /** Token usage statistics. */
  usage: OpenRouterResponsesUsage;
  /** Response status. */
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress';
  /** Error details (only present if status is 'failed'). */
  error?: {
    code: string;
    message: string;
  };
  /** Details about incomplete response (only present if status is 'incomplete'). */
  incomplete_details?: {
    reason: string;
  };
}

/**
 * Union type for Responses API output items.
 */
export type OpenRouterResponsesOutputItem =
  | OpenRouterResponsesMessageOutput
  | OpenRouterResponsesFunctionCallOutput
  | OpenRouterResponsesImageGenerationOutput;

/**
 * Image generation output item from Responses API.
 */
export interface OpenRouterResponsesImageGenerationOutput {
  /** Item type identifier. */
  type: 'image_generation_call';
  /** Unique identifier for this output item. */
  id: string;
  /** Base64-encoded image data, or null if generation is in progress. */
  result?: string | null;
  /** Generation status. */
  status: 'in_progress' | 'completed' | 'generating' | 'failed';
}

/**
 * Message output item from Responses API.
 */
export interface OpenRouterResponsesMessageOutput {
  /** Item type identifier. */
  type: 'message';
  /** Message identifier. */
  id: string;
  /** Role identifier. */
  role: 'assistant';
  /** Message content parts. */
  content: OpenRouterResponsesOutputContent[];
  /** Message completion status. */
  status: 'completed' | 'in_progress';
}

/**
 * Function call output item from Responses API.
 */
export interface OpenRouterResponsesFunctionCallOutput {
  /** Item type identifier. */
  type: 'function_call';
  /** Unique item identifier. */
  id: string;
  /** Call identifier for matching with tool result. */
  call_id: string;
  /** Function name. */
  name: string;
  /** JSON-encoded function arguments. */
  arguments: string;
  /** Completion status. */
  status: 'completed' | 'in_progress';
}

/**
 * Union type for output content in Responses API.
 */
export type OpenRouterResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

/**
 * Token usage statistics for Responses API.
 */
export interface OpenRouterResponsesUsage {
  /** Number of tokens in the input. */
  input_tokens: number;
  /** Number of tokens in the output. */
  output_tokens: number;
  /** Total tokens (input + output). */
  total_tokens: number;
  /** Details about input token breakdown including cache metrics. */
  input_tokens_details?: {
    cached_tokens?: number;
  };
}

/**
 * Union type for all Responses API streaming events.
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

/** Emitted when a new response is created. */
export interface OpenRouterResponseCreatedEvent {
  type: 'response.created';
  response: OpenRouterResponsesResponse;
}

/** Emitted when response generation is in progress. */
export interface OpenRouterResponseInProgressEvent {
  type: 'response.in_progress';
  response: OpenRouterResponsesResponse;
}

/** Emitted when response generation is complete. */
export interface OpenRouterResponseCompletedEvent {
  type: 'response.completed' | 'response.done';
  response: OpenRouterResponsesResponse;
}

/** Emitted when response generation fails. */
export interface OpenRouterResponseFailedEvent {
  type: 'response.failed';
  response: OpenRouterResponsesResponse;
}

/** Emitted when a new output item is added to the response. */
export interface OpenRouterResponseOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: OpenRouterResponsesOutputItem;
}

/** Emitted when an output item is complete. */
export interface OpenRouterResponseOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: OpenRouterResponsesOutputItem;
}

/** Emitted when a new content part is added. */
export interface OpenRouterResponseContentPartAddedEvent {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  part: OpenRouterResponsesOutputContent;
}

/** Emitted when a content part is complete. */
export interface OpenRouterResponseContentPartDoneEvent {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  part: OpenRouterResponsesOutputContent;
}

/** Emitted for incremental text content. */
export interface OpenRouterResponseTextDeltaEvent {
  type: 'response.content_part.delta' | 'response.output_text.delta';
  response_id?: string;
  output_index: number;
  content_index?: number;
  delta: string;
}

/** Emitted when text content is complete. */
export interface OpenRouterResponseTextDoneEvent {
  type: 'response.output_text.done' | 'response.content_part.done';
  output_index: number;
  content_index?: number;
  text: string;
}

/** Emitted for incremental refusal content. */
export interface OpenRouterResponseRefusalDeltaEvent {
  type: 'response.refusal.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

/** Emitted when refusal content is complete. */
export interface OpenRouterResponseRefusalDoneEvent {
  type: 'response.refusal.done';
  output_index: number;
  content_index: number;
  refusal: string;
}

/** Emitted for incremental function call arguments. */
export interface OpenRouterResponseFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  item_id: string;
  delta: string;
  call_id?: string;
}

/** Emitted when function call arguments are complete. */
export interface OpenRouterResponseFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  item_id: string;
  name: string;
  arguments: string;
  call_id?: string;
}

/** Emitted for incremental reasoning content (for reasoning models). */
export interface OpenRouterResponseReasoningDeltaEvent {
  type: 'response.reasoning.delta';
  delta: string;
}

/** Emitted when an error occurs during streaming. */
export interface OpenRouterResponseErrorEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
  };
}

/**
 * OpenRouter-specific HTTP headers for API requests.
 *
 * @example
 * ```typescript
 * const headers: OpenRouterHeaders = {
 *   'HTTP-Referer': 'https://myapp.example.com',
 *   'X-Title': 'My Application',
 * };
 * ```
 */
export interface OpenRouterHeaders {
  /** Application URL for analytics and leaderboard tracking. */
  'HTTP-Referer'?: string;
  /** Application name for analytics display. */
  'X-Title'?: string;
  [key: string]: string | undefined;
}
