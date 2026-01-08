/**
 * @fileoverview Anthropic API type definitions.
 *
 * Contains TypeScript interfaces for Anthropic's Messages API request/response
 * structures, streaming events, and provider-specific parameters.
 */

/**
 * Provider-specific parameters for Anthropic Claude models.
 *
 * These parameters are passed through to the Anthropic Messages API and
 * control model behavior such as sampling, token limits, and extended thinking.
 *
 * @example
 * ```typescript
 * const params: AnthropicLLMParams = {
 *   max_tokens: 4096,
 *   temperature: 0.7,
 *   thinking: { type: 'enabled', budget_tokens: 10000 },
 * };
 * ```
 */
export interface AnthropicLLMParams {
  /** Maximum number of tokens to generate. Defaults to model maximum if not specified. */
  max_tokens?: number;

  /** Sampling temperature from 0.0 (deterministic) to 1.0 (maximum randomness). */
  temperature?: number;

  /** Nucleus sampling threshold. Only tokens with cumulative probability <= top_p are considered. */
  top_p?: number;

  /** Top-k sampling. Only the k most likely tokens are considered at each step. */
  top_k?: number;

  /** Custom sequences that will cause the model to stop generating. */
  stop_sequences?: string[];

  /** Request metadata for tracking and analytics. */
  metadata?: {
    /** Unique identifier for the end user making the request. */
    user_id?: string;
  };

  /** Extended thinking configuration for complex reasoning tasks. */
  thinking?: {
    /** Must be 'enabled' to activate extended thinking. */
    type: 'enabled';
    /** Token budget for the thinking process. */
    budget_tokens: number;
  };

  /**
   * Service tier selection for capacity routing.
   * - `auto`: Automatically select based on availability (default)
   * - `standard_only`: Only use standard capacity, never priority
   */
  service_tier?: 'auto' | 'standard_only';
}

/**
 * System content block for structured system prompts with caching support.
 *
 * When system is provided as an array, each block can have cache_control.
 */
export interface AnthropicSystemContent {
  /** Content type discriminator. */
  type: 'text';
  /** The text content. */
  text: string;
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
}

/**
 * Request body structure for Anthropic's Messages API.
 *
 * This interface represents the full request payload sent to the
 * `/v1/messages` endpoint.
 */
export interface AnthropicRequest {
  /** The model identifier (e.g., 'claude-sonnet-4-20250514'). */
  model: string;
  /** Maximum tokens to generate in the response. */
  max_tokens?: number;
  /** Conversation messages in Anthropic's format. */
  messages: AnthropicMessage[];
  /** System prompt - string for simple prompts, array for caching support. */
  system?: string | AnthropicSystemContent[];
  /** Sampling temperature. */
  temperature?: number;
  /** Nucleus sampling threshold. */
  top_p?: number;
  /** Top-k sampling value. */
  top_k?: number;
  /** Stop sequences to halt generation. */
  stop_sequences?: string[];
  /** Enable Server-Sent Events streaming. */
  stream?: boolean;
  /** Available tools for function calling. */
  tools?: AnthropicTool[];
  /** Tool selection strategy. */
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  /** Request metadata for tracking. */
  metadata?: { user_id?: string };
  /** Extended thinking configuration. */
  thinking?: { type: 'enabled'; budget_tokens: number };
  /** Capacity tier selection. */
  service_tier?: 'auto' | 'standard_only';
}

/**
 * A single message in an Anthropic conversation.
 *
 * Messages alternate between 'user' and 'assistant' roles. Content can be
 * a simple string or an array of typed content blocks.
 */
export interface AnthropicMessage {
  /** The role of the message sender. */
  role: 'user' | 'assistant';
  /** Message content as string or structured content blocks. */
  content: AnthropicContent[] | string;
}

/**
 * Union type for all Anthropic content block types.
 *
 * Used in both request messages and response content arrays.
 */
export type AnthropicContent =
  | AnthropicTextContent
  | AnthropicImageContent
  | AnthropicToolUseContent
  | AnthropicToolResultContent;

/**
 * Cache control configuration for prompt caching.
 *
 * Marks content blocks for caching to reduce costs and latency
 * on subsequent requests with the same prefix.
 *
 * @example
 * ```typescript
 * const cacheControl: AnthropicCacheControl = {
 *   type: 'ephemeral',
 *   ttl: '1h' // Optional: extend to 1-hour cache
 * };
 * ```
 */
export interface AnthropicCacheControl {
  /** Cache type - only 'ephemeral' is supported */
  type: 'ephemeral';
  /** Optional TTL: '5m' (default) or '1h' for extended caching */
  ttl?: '5m' | '1h';
}

/**
 * Plain text content block.
 */
export interface AnthropicTextContent {
  /** Content type discriminator. */
  type: 'text';
  /** The text content. */
  text: string;
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
}

/**
 * Image content block for vision capabilities.
 *
 * Images can be provided as base64-encoded data or via URL.
 */
export interface AnthropicImageContent {
  /** Content type discriminator. */
  type: 'image';
  /** Image source configuration. */
  source: {
    /** How the image data is provided. */
    type: 'base64' | 'url';
    /** MIME type of the image (required for base64). */
    media_type?: string;
    /** Base64-encoded image data. */
    data?: string;
    /** URL to fetch the image from. */
    url?: string;
  };
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
}

/**
 * Tool use content block representing a function call by the assistant.
 *
 * Appears in assistant messages when the model invokes a tool.
 */
export interface AnthropicToolUseContent {
  /** Content type discriminator. */
  type: 'tool_use';
  /** Unique identifier for this tool invocation. */
  id: string;
  /** Name of the tool being called. */
  name: string;
  /** Arguments passed to the tool as a JSON object. */
  input: Record<string, unknown>;
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
}

/**
 * Tool result content block providing the output of a tool call.
 *
 * Sent in user messages to provide results for previous tool_use blocks.
 */
export interface AnthropicToolResultContent {
  /** Content type discriminator. */
  type: 'tool_result';
  /** ID of the tool_use block this result corresponds to. */
  tool_use_id: string;
  /** The result content (string or structured blocks). */
  content: string | AnthropicContent[];
  /** Whether the tool execution resulted in an error. */
  is_error?: boolean;
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
}

/**
 * Tool definition for Anthropic's function calling feature.
 *
 * Defines a callable function that the model can invoke during generation.
 */
export interface AnthropicTool {
  /** Unique name for the tool. */
  name: string;
  /** Description of what the tool does and when to use it. */
  description: string;
  /** JSON Schema defining the expected input parameters. */
  input_schema: {
    /** Schema type (always 'object' for tool inputs). */
    type: 'object';
    /** Property definitions for each parameter. */
    properties: Record<string, unknown>;
    /** List of required property names. */
    required?: string[];
  };
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
}

/**
 * Complete response from the Anthropic Messages API.
 *
 * Returned from non-streaming requests and contains the full
 * generated content along with usage statistics.
 */
export interface AnthropicResponse {
  /** Unique identifier for this response. */
  id: string;
  /** Response type (always 'message'). */
  type: 'message';
  /** Role of the responder (always 'assistant'). */
  role: 'assistant';
  /** Generated content blocks. */
  content: AnthropicResponseContent[];
  /** Model that generated this response. */
  model: string;
  /**
   * Reason the model stopped generating.
   * - `end_turn`: Natural completion
   * - `max_tokens`: Hit token limit
   * - `stop_sequence`: Hit a stop sequence
   * - `tool_use`: Model wants to use a tool
   * - `pause_turn`: Paused for extended thinking
   * - `refusal`: Model refused to respond
   */
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | null;
  /** The stop sequence that was matched, if any. */
  stop_sequence: string | null;
  /** Token usage statistics. */
  usage: {
    /** Tokens consumed by the input. */
    input_tokens: number;
    /** Tokens generated in the output. */
    output_tokens: number;
    /** Tokens used to create cache entries. */
    cache_creation_input_tokens?: number;
    /** Tokens read from cache. */
    cache_read_input_tokens?: number;
  };
}

/**
 * Union type for content blocks that can appear in API responses.
 *
 * Includes text, tool use, and thinking blocks.
 */
export type AnthropicResponseContent =
  | AnthropicTextContent
  | AnthropicToolUseContent
  | AnthropicThinkingContent;

/**
 * Thinking content block from extended thinking feature.
 *
 * Contains the model's internal reasoning process when thinking is enabled.
 */
export interface AnthropicThinkingContent {
  /** Content type discriminator. */
  type: 'thinking';
  /** The model's thinking/reasoning text. */
  thinking: string;
  /** Cryptographic signature for thinking verification. */
  signature?: string;
}

/**
 * Union type for all Server-Sent Events from Anthropic's streaming API.
 *
 * Events are received in a specific order:
 * 1. message_start - Initial message metadata
 * 2. content_block_start - Beginning of each content block
 * 3. content_block_delta - Incremental content updates (multiple)
 * 4. content_block_stop - End of each content block
 * 5. message_delta - Final usage and stop reason
 * 6. message_stop - Stream complete
 */
export type AnthropicStreamEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockStartEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicContentBlockStopEvent
  | AnthropicMessageDeltaEvent
  | AnthropicMessageStopEvent
  | AnthropicPingEvent
  | AnthropicErrorEvent;

/**
 * Initial event containing message metadata and partial response.
 */
export interface AnthropicMessageStartEvent {
  /** Event type discriminator. */
  type: 'message_start';
  /** Partial response with id, model, and input token count. */
  message: AnthropicResponse;
}

/**
 * Signals the start of a new content block.
 */
export interface AnthropicContentBlockStartEvent {
  /** Event type discriminator. */
  type: 'content_block_start';
  /** Zero-based index of this content block. */
  index: number;
  /** Initial content block data (may be empty for streaming). */
  content_block: AnthropicResponseContent;
}

/**
 * Incremental update to a content block's content.
 *
 * Multiple delta events are sent as content is generated.
 */
export interface AnthropicContentBlockDeltaEvent {
  /** Event type discriminator. */
  type: 'content_block_delta';
  /** Index of the content block being updated. */
  index: number;
  /** The incremental content update. */
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'signature_delta'; signature: string }
    | { type: 'input_json_delta'; partial_json: string };
}

/**
 * Signals the end of a content block.
 */
export interface AnthropicContentBlockStopEvent {
  /** Event type discriminator. */
  type: 'content_block_stop';
  /** Index of the completed content block. */
  index: number;
}

/**
 * Final message update with stop reason and output token count.
 */
export interface AnthropicMessageDeltaEvent {
  /** Event type discriminator. */
  type: 'message_delta';
  /** Final message metadata. */
  delta: {
    /** Why the model stopped generating. */
    stop_reason: string | null;
    /** The stop sequence that was matched, if any. */
    stop_sequence: string | null;
  };
  /** Final usage statistics. */
  usage: {
    /** Total output tokens generated. */
    output_tokens: number;
  };
}

/**
 * Terminal event indicating the stream is complete.
 */
export interface AnthropicMessageStopEvent {
  /** Event type discriminator. */
  type: 'message_stop';
}

/**
 * Keep-alive event sent periodically during long operations.
 */
export interface AnthropicPingEvent {
  /** Event type discriminator. */
  type: 'ping';
}

/**
 * Error event indicating a problem during streaming.
 */
export interface AnthropicErrorEvent {
  /** Event type discriminator. */
  type: 'error';
  /** Error details. */
  error: {
    /** Error type identifier. */
    type: string;
    /** Human-readable error message. */
    message: string;
  };
}

/**
 * Anthropic-specific HTTP headers for API requests.
 *
 * @example
 * ```typescript
 * const headers: AnthropicHeaders = {
 *   'anthropic-beta': 'extended-cache-ttl-2025-04-11',
 * };
 * ```
 */
export interface AnthropicHeaders {
  /**
   * Beta features header.
   *
   * Comma-separated list of beta feature flags:
   * - `extended-cache-ttl-2025-04-11` - Enable 1-hour cache TTL
   * - `token-efficient-tools-2025-02-19` - Token-efficient tool encoding
   */
  'anthropic-beta'?: string;
  [key: string]: string | undefined;
}
