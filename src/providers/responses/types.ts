/**
 * @fileoverview OpenResponses Provider Type Definitions
 *
 * This module contains TypeScript type definitions for the OpenResponses provider,
 * implementing the open-source OpenResponses specification for multi-provider
 * interoperable LLM interfaces.
 *
 * The OpenResponses spec is based on OpenAI's Responses API but designed to be
 * provider-agnostic, allowing any compatible server to be used.
 *
 * @see {@link https://www.openresponses.org OpenResponses Specification}
 * @module providers/responses/types
 */

// ============================================
// Provider Options
// ============================================

/**
 * Configuration options for creating an OpenResponses model reference.
 *
 * The `host` option allows targeting any OpenResponses-compatible server,
 * making this provider work with OpenAI, self-hosted servers, or any
 * implementation of the OpenResponses specification.
 *
 * @example Using with OpenAI
 * ```typescript
 * const model = responses('gpt-5.2', {
 *   host: 'https://api.openai.com/v1'
 * });
 * ```
 *
 * @example Using with a self-hosted server
 * ```typescript
 * const model = responses('llama-3.3-70b', {
 *   host: 'http://localhost:8080/v1',
 *   apiKeyEnv: 'LOCAL_API_KEY'
 * });
 * ```
 */
export interface ResponsesProviderOptions {
  /**
   * The base URL for the OpenResponses-compatible API.
   * The `/responses` endpoint will be appended to this URL.
   *
   * @example 'https://api.openai.com/v1'
   * @example 'https://openrouter.ai/api/v1'
   * @example 'http://localhost:8080/v1'
   */
  host: string;

  /**
   * Environment variable name containing the API key.
   * Defaults to 'OPENRESPONSES_API_KEY'.
   *
   * @example 'OPENAI_API_KEY'
   * @example 'OPENROUTER_API_KEY'
   */
  apiKeyEnv?: string;
}

// ============================================
// LLM Parameters
// ============================================

/**
 * Parameters for the OpenResponses API.
 *
 * These parameters follow the OpenResponses specification and are passed
 * directly to the `/responses` endpoint.
 *
 * @see {@link https://www.openresponses.org/spec OpenResponses Spec}
 */
export interface ResponsesParams {
  /** Maximum output tokens (minimum 16) */
  max_output_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Presence penalty for new tokens */
  presence_penalty?: number;

  /** Frequency penalty for new tokens */
  frequency_penalty?: number;

  /** Number of top logprobs to return (0-20) */
  top_logprobs?: number;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /**
   * Reasoning configuration (for reasoning models).
   * Supported on gpt-5 and o-series models.
   */
  reasoning?: {
    /** Reasoning effort level */
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    /** Include summary of reasoning */
    summary?: 'auto' | 'concise' | 'detailed';
  };

  /** Service tier */
  service_tier?: 'auto' | 'default' | 'flex' | 'priority';

  /** Truncation strategy */
  truncation?: 'auto' | 'disabled';

  /**
   * Fields to include in output.
   * @example ['reasoning.encrypted_content', 'message.output_text.logprobs']
   */
  include?: string[];

  /** Background processing - run response asynchronously */
  background?: boolean;

  /** Continue from a previous response */
  previous_response_id?: string;

  /** Store response for continuation */
  store?: boolean;

  /** Metadata key-value pairs (max 16, keys max 64 chars, values max 512 chars) */
  metadata?: Record<string, string>;

  /** Maximum total calls to built-in tools */
  max_tool_calls?: number;

  /** Stable identifier for caching similar requests (max 64 chars) */
  prompt_cache_key?: string;

  /** Stable identifier for abuse detection (max 64 chars) */
  safety_identifier?: string;

  /**
   * Text format configuration.
   * Controls output format (text, json_object, json_schema) and verbosity.
   */
  text?: ResponsesTextConfig;

  /**
   * Built-in tools from the OpenResponses specification.
   * Currently supports function tools; provider-specific built-in tools
   * may be added via the tools array.
   */
  tools?: ResponsesBuiltInTool[];
}

// ============================================
// Text Configuration
// ============================================

/**
 * Text output configuration for structured output.
 */
export interface ResponsesTextConfig {
  /** Text output format */
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

  /** Verbosity level for responses */
  verbosity?: 'low' | 'medium' | 'high';
}

// ============================================
// Request Types
// ============================================

/**
 * Request body for the OpenResponses API.
 */
export interface ResponsesRequest {
  model: string;
  input: string | ResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  top_logprobs?: number;
  stream?: boolean;
  tools?: ResponsesToolUnion[];
  tool_choice?: ResponsesToolChoice;
  parallel_tool_calls?: boolean;
  text?: ResponsesTextConfig;
  truncation?: 'auto' | 'disabled';
  store?: boolean;
  metadata?: Record<string, string>;
  reasoning?: {
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    summary?: 'auto' | 'concise' | 'detailed';
  };
  service_tier?: string;
  include?: string[];
  background?: boolean;
  previous_response_id?: string;
  max_tool_calls?: number;
  prompt_cache_key?: string;
  safety_identifier?: string;
}

// ============================================
// Input Item Types
// ============================================

/**
 * Union type for all input item types.
 */
export type ResponsesInputItem =
  | ResponsesSystemItem
  | ResponsesUserItem
  | ResponsesAssistantItem
  | ResponsesFunctionCallInputItem
  | ResponsesToolResultItem
  | ResponsesReasoningInputItem
  | ResponsesItemReference;

/**
 * Reference to a previous item by ID.
 */
export interface ResponsesItemReference {
  type: 'item_reference';
  id: string;
}

/**
 * Reasoning input item for multi-turn context preservation.
 */
export interface ResponsesReasoningInputItem {
  type: 'reasoning';
  id: string;
  summary: Array<{ type: 'summary_text'; text: string }>;
  encrypted_content?: string;
}

/** System message input item */
export interface ResponsesSystemItem {
  type: 'message';
  role: 'system' | 'developer';
  content: string | ResponsesContentPart[];
}

/** User message input item */
export interface ResponsesUserItem {
  type: 'message';
  role: 'user';
  content: string | ResponsesContentPart[];
}

/** Assistant message input item */
export interface ResponsesAssistantItem {
  type: 'message';
  role: 'assistant';
  content: string | ResponsesContentPart[];
}

/** Function call input item */
export interface ResponsesFunctionCallInputItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/** Function call output (tool result) input item */
export interface ResponsesToolResultItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

// ============================================
// Content Part Types
// ============================================

/**
 * Union type for content parts.
 */
export type ResponsesContentPart =
  | ResponsesTextPart
  | ResponsesImagePart
  | ResponsesFilePart
  | ResponsesVideoPart
  | ResponsesOutputTextPart
  | ResponsesFunctionCallPart;

/** Text input content part */
export interface ResponsesTextPart {
  type: 'input_text';
  text: string;
}

/** Text output content part */
export interface ResponsesOutputTextPart {
  type: 'output_text';
  text: string;
}

/** Image content part */
export interface ResponsesImagePart {
  type: 'input_image';
  /** Image URL or base64 data URL */
  image_url?: string;
  /** Base64 image data (alternative to image_url) */
  image?: string;
  /** Detail level for image processing */
  detail?: 'auto' | 'low' | 'high';
}

/** File content part (PDFs, documents) */
export interface ResponsesFilePart {
  type: 'input_file';
  filename?: string;
  /** Base64 data URL */
  file_data?: string;
  /** URL to fetch the file from */
  file_url?: string;
  /** Pre-uploaded file ID */
  file_id?: string;
}

/** Video content part */
export interface ResponsesVideoPart {
  type: 'input_video';
  /** Base64 video data */
  video?: string;
  /** URL to fetch the video from */
  video_url?: string;
}

/** Function call content part */
export interface ResponsesFunctionCallPart {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

// ============================================
// Tool Types
// ============================================

/**
 * Function tool definition.
 */
export interface ResponsesFunctionTool {
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
 * Built-in tool placeholder for provider-specific tools.
 * Providers implementing OpenResponses may add their own built-in tools.
 */
export interface ResponsesBuiltInTool {
  type: string;
  [key: string]: unknown;
}

/**
 * Combined tool type (function or built-in).
 */
export type ResponsesToolUnion = ResponsesFunctionTool | ResponsesBuiltInTool;

/**
 * Tool choice options.
 */
export type ResponsesToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; name: string };

// ============================================
// Response Types
// ============================================

/**
 * Response from the OpenResponses API.
 */
export interface ResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  completed_at?: number;
  model: string;
  output: ResponsesOutputItem[];
  usage: ResponsesUsage;
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress' | 'queued';
  error?: {
    code: string;
    message: string;
    param?: string;
  };
  incomplete_details?: {
    reason: string;
  };
}

/**
 * Union type for all output item types.
 */
export type ResponsesOutputItem =
  | ResponsesMessageOutput
  | ResponsesFunctionCallOutput
  | ResponsesReasoningOutput;

/** Assistant message output item */
export interface ResponsesMessageOutput {
  type: 'message';
  id: string;
  role: 'assistant';
  content: ResponsesOutputContent[];
  status: 'completed' | 'in_progress';
}

/** Function call output item */
export interface ResponsesFunctionCallOutput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: 'completed' | 'in_progress';
}

/** Reasoning output item */
export interface ResponsesReasoningOutput {
  type: 'reasoning';
  id: string;
  summary: Array<{ type: 'summary_text'; text: string }>;
  status: 'completed' | 'in_progress' | null;
  encrypted_content?: string;
}

/** Output content types */
export type ResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string }
  | { type: 'reasoning_text'; text: string }
  | { type: 'summary_text'; text: string };

/** Token usage statistics */
export interface ResponsesUsage {
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
  };
}

// ============================================
// Streaming Event Types
// ============================================

/**
 * Union type for all streaming events.
 */
export type ResponsesStreamEvent =
  | ResponsesCreatedEvent
  | ResponsesQueuedEvent
  | ResponsesInProgressEvent
  | ResponsesCompletedEvent
  | ResponsesFailedEvent
  | ResponsesIncompleteEvent
  | ResponsesOutputItemAddedEvent
  | ResponsesOutputItemDoneEvent
  | ResponsesContentPartAddedEvent
  | ResponsesContentPartDoneEvent
  | ResponsesTextDeltaEvent
  | ResponsesTextDoneEvent
  | ResponsesRefusalDeltaEvent
  | ResponsesRefusalDoneEvent
  | ResponsesFunctionCallArgumentsDeltaEvent
  | ResponsesFunctionCallArgumentsDoneEvent
  | ResponsesReasoningDeltaEvent
  | ResponsesReasoningDoneEvent
  | ResponsesReasoningSummaryTextDeltaEvent
  | ResponsesReasoningSummaryTextDoneEvent
  | ResponsesReasoningSummaryPartAddedEvent
  | ResponsesReasoningSummaryPartDoneEvent
  | ResponsesAnnotationAddedEvent
  | ResponsesErrorEvent;

export interface ResponsesCreatedEvent {
  type: 'response.created';
  response: ResponsesResponse;
  sequence_number?: number;
}

export interface ResponsesQueuedEvent {
  type: 'response.queued';
  response: ResponsesResponse;
  sequence_number?: number;
}

export interface ResponsesInProgressEvent {
  type: 'response.in_progress';
  response: ResponsesResponse;
  sequence_number?: number;
}

export interface ResponsesCompletedEvent {
  type: 'response.completed';
  response: ResponsesResponse;
  sequence_number?: number;
}

export interface ResponsesFailedEvent {
  type: 'response.failed';
  response: ResponsesResponse;
  sequence_number?: number;
}

export interface ResponsesIncompleteEvent {
  type: 'response.incomplete';
  response: ResponsesResponse;
  sequence_number?: number;
}

export interface ResponsesOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: ResponsesOutputItem;
  sequence_number?: number;
}

export interface ResponsesOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: ResponsesOutputItem;
  sequence_number?: number;
}

export interface ResponsesContentPartAddedEvent {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  part: ResponsesOutputContent;
  sequence_number?: number;
}

export interface ResponsesContentPartDoneEvent {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  part: ResponsesOutputContent;
  sequence_number?: number;
}

export interface ResponsesTextDeltaEvent {
  type: 'response.output_text.delta';
  output_index: number;
  content_index: number;
  delta: string;
  sequence_number?: number;
}

export interface ResponsesTextDoneEvent {
  type: 'response.output_text.done';
  output_index: number;
  content_index: number;
  text: string;
  sequence_number?: number;
}

export interface ResponsesRefusalDeltaEvent {
  type: 'response.refusal.delta';
  output_index: number;
  content_index: number;
  delta: string;
  sequence_number?: number;
}

export interface ResponsesRefusalDoneEvent {
  type: 'response.refusal.done';
  output_index: number;
  content_index: number;
  refusal: string;
  sequence_number?: number;
}

export interface ResponsesFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  item_id: string;
  delta: string;
  call_id?: string;
  sequence_number?: number;
}

export interface ResponsesFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  item_id: string;
  name: string;
  arguments: string;
  call_id?: string;
  sequence_number?: number;
}

export interface ResponsesReasoningDeltaEvent {
  type: 'response.reasoning.delta';
  output_index: number;
  delta: string;
  sequence_number?: number;
}

export interface ResponsesReasoningDoneEvent {
  type: 'response.reasoning.done';
  output_index: number;
  text: string;
  sequence_number?: number;
}

export interface ResponsesReasoningSummaryTextDeltaEvent {
  type: 'response.reasoning_summary_text.delta';
  item_id: string;
  output_index: number;
  summary_index: number;
  delta: string;
  sequence_number?: number;
}

export interface ResponsesReasoningSummaryTextDoneEvent {
  type: 'response.reasoning_summary_text.done';
  item_id: string;
  output_index: number;
  summary_index: number;
  text: string;
  sequence_number?: number;
}

export interface ResponsesReasoningSummaryPartAddedEvent {
  type: 'response.reasoning_summary_part.added';
  output_index: number;
  summary_index: number;
  part: { type: 'summary_text'; text: string };
  sequence_number?: number;
}

export interface ResponsesReasoningSummaryPartDoneEvent {
  type: 'response.reasoning_summary_part.done';
  output_index: number;
  summary_index: number;
  part: { type: 'summary_text'; text: string };
  sequence_number?: number;
}

export interface ResponsesAnnotationAddedEvent {
  type: 'response.output_text.annotation.added';
  output_index: number;
  content_index: number;
  annotation_index: number;
  annotation: unknown;
  sequence_number?: number;
}

export interface ResponsesErrorEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
    param?: string;
  };
  sequence_number?: number;
}

// ============================================
// Custom Headers
// ============================================

/**
 * Custom HTTP headers for OpenResponses requests.
 */
export interface ResponsesHeaders {
  [key: string]: string | undefined;
}
