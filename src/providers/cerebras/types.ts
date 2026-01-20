/**
 * @fileoverview Cerebras Provider Type Definitions
 *
 * This module contains all TypeScript type definitions for the Cerebras provider,
 * including types for the Chat Completions API (OpenAI-compatible).
 *
 * @module providers/cerebras/types
 */

/**
 * Parameters for the Cerebras Chat Completions API.
 *
 * These parameters are passed directly to the `/v1/chat/completions` endpoint.
 * Cerebras's API is OpenAI-compatible with additional features like reasoning.
 *
 * @example
 * ```typescript
 * const params: CerebrasLLMParams = {
 *   temperature: 0.7,
 *   max_completion_tokens: 1000,
 *   top_p: 0.9
 * };
 * ```
 */
export interface CerebrasLLMParams {
  /** Maximum number of tokens to generate */
  max_completion_tokens?: number;

  /** Temperature for randomness (0 to 1.5, default: 1.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Custom stop sequences (max 4) */
  stop?: string[];

  /** Seed for deterministic sampling */
  seed?: number;

  /** User identifier for tracking */
  user?: string;

  /** Response format for structured output */
  response_format?: CerebrasResponseFormat;

  /**
   * Reasoning intensity for gpt-oss-120b model.
   * Controls how much reasoning/thinking the model does.
   */
  reasoning_effort?: 'low' | 'medium' | 'high';

  /**
   * How reasoning text appears in the response.
   * - `parsed`: Thinking in separate `reasoning` field
   * - `raw`: Thinking with `<think>...</think>` tags in content
   * - `hidden`: Thinking removed but counted in tokens
   * - `none`: Model's default behavior
   */
  reasoning_format?: 'parsed' | 'raw' | 'hidden' | 'none';

  /**
   * Whether to clear thinking content for zai-glm-4.7 model.
   * When true, removes thinking content from the response.
   */
  clear_thinking?: boolean;

  /** Whether to enable parallel tool calls (default: true) */
  parallel_tool_calls?: boolean;

  /**
   * Service tier selection for request prioritization.
   * - `priority`: Highest priority (dedicated endpoints only)
   * - `default`: Standard production workloads
   * - `auto`: Dynamic prioritization
   * - `flex`: Lowest priority, overflow/experimental
   */
  service_tier?: 'default' | 'priority' | 'auto' | 'flex';

  /** Maximum queue time in ms (50-20000) */
  queue_threshold?: number;

  /**
   * Predicted output for latency reduction.
   * Only supported on gpt-oss-120b and zai-glm-4.7.
   */
  prediction?: {
    type: 'content';
    content: string;
  };

  /** Tool choice configuration */
  tool_choice?: CerebrasToolChoice;

  /** Whether to return log probabilities of output tokens */
  logprobs?: boolean;

  /** Number of most likely tokens to return at each position (0-20). Requires logprobs=true. */
  top_logprobs?: number;
}

/**
 * Response format options for structured output.
 */
export type CerebrasResponseFormat =
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
 * Request body for the Cerebras Chat Completions API.
 */
export interface CerebrasRequest {
  model: string;
  messages: CerebrasMessage[];
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  stop?: string[];
  max_completion_tokens?: number;
  user?: string;
  seed?: number;
  tools?: CerebrasTool[];
  tool_choice?: CerebrasToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: CerebrasResponseFormat;
  reasoning_effort?: 'low' | 'medium' | 'high';
  reasoning_format?: 'parsed' | 'raw' | 'hidden' | 'none';
  clear_thinking?: boolean;
  service_tier?: string;
  queue_threshold?: number;
  prediction?: {
    type: 'content';
    content: string;
  };
  logprobs?: boolean;
  top_logprobs?: number;
}

/**
 * Union type for all message types in the Cerebras API.
 */
export type CerebrasMessage =
  | CerebrasSystemMessage
  | CerebrasUserMessage
  | CerebrasAssistantMessage
  | CerebrasToolMessage;

/** System message for setting context and instructions */
export interface CerebrasSystemMessage {
  role: 'system';
  content: string;
}

/** User message with text or multimodal content */
export interface CerebrasUserMessage {
  role: 'user';
  content: string | CerebrasUserContent[];
}

/** Assistant message containing the model's response */
export interface CerebrasAssistantMessage {
  role: 'assistant';
  content?: string | null;
  reasoning?: string;
  tool_calls?: CerebrasToolCall[];
}

/** Tool result message providing output from a function call */
export interface CerebrasToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * Union type for user content parts.
 */
export type CerebrasUserContent = CerebrasTextContent;

/** Text content part */
export interface CerebrasTextContent {
  type: 'text';
  text: string;
}

/**
 * Tool call structure in assistant messages.
 */
export interface CerebrasToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool definition for the Cerebras API.
 */
export interface CerebrasTool {
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
export type CerebrasToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Response structure from the Cerebras Chat Completions API.
 */
export interface CerebrasResponse {
  id: string;
  object: 'chat.completion';
  created?: number;
  model: string;
  choices: CerebrasChoice[];
  usage: CerebrasUsage;
  system_fingerprint?: string;
  time_info?: CerebrasTimeInfo;
}

/** A single choice from a completion response */
export interface CerebrasChoice {
  index: number;
  message: CerebrasAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/** Time information from the API response */
export interface CerebrasTimeInfo {
  queue_time?: number;
  prompt_time?: number;
  completion_time?: number;
  total_time?: number;
}

/** Token usage statistics from the API response */
export interface CerebrasUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
}

/**
 * Streaming chunk structure from the Cerebras API.
 */
export interface CerebrasStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created?: number;
  model: string;
  choices: CerebrasStreamChoice[];
  usage?: CerebrasUsage | null;
  system_fingerprint?: string;
  time_info?: CerebrasTimeInfo;
}

/** A streaming choice containing incremental content */
export interface CerebrasStreamChoice {
  index: number;
  delta: CerebrasStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/** Incremental content delta in a streaming chunk */
export interface CerebrasStreamDelta {
  role?: 'assistant';
  content?: string | null;
  reasoning?: string | null;
  tool_calls?: CerebrasStreamToolCall[];
}

/** Incremental tool call data in a streaming chunk */
export interface CerebrasStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Cerebras-specific HTTP headers for API requests.
 */
export interface CerebrasHeaders {
  [key: string]: string | undefined;
}
