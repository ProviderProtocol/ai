/**
 * @fileoverview Groq Provider Type Definitions
 *
 * This module contains all TypeScript type definitions for the Groq provider,
 * including types for the Chat Completions API (OpenAI-compatible).
 *
 * @module providers/groq/types
 */

/**
 * Parameters for the Groq Chat Completions API.
 *
 * These parameters are passed directly to the `/openai/v1/chat/completions` endpoint.
 * Groq's API is largely OpenAI-compatible with some differences noted below.
 *
 * @example
 * ```typescript
 * const params: GroqLLMParams = {
 *   temperature: 0.7,
 *   max_tokens: 1000,
 *   top_p: 0.9
 * };
 * ```
 */
export interface GroqLLMParams {
  /** Maximum number of tokens to generate */
  max_tokens?: number;

  /** Maximum completion tokens (alias for max_tokens) */
  max_completion_tokens?: number;

  /** Temperature for randomness (0.0 to 2.0). Note: Groq's API converts 0 to 1e-8 internally. */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  top_p?: number;

  /** Custom stop sequences */
  stop?: string | string[];

  /** Frequency penalty (-2.0 - 2.0) */
  frequency_penalty?: number;

  /** Presence penalty (-2.0 - 2.0) */
  presence_penalty?: number;

  /** Whether to enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Seed for deterministic sampling */
  seed?: number;

  /** User identifier for rate limit tracking */
  user?: string;

  /** Response format for structured output */
  response_format?: GroqResponseFormat;

  /** Service tier selection */
  service_tier?: 'on_demand' | 'flex';

  /** Enable log probabilities output */
  logprobs?: boolean;

  /** Number of top log probabilities to return (0-20) */
  top_logprobs?: number;

  /** Reasoning effort for reasoning-capable models */
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';

  /** Reasoning format for reasoning-capable models */
  reasoning_format?: 'parsed' | 'raw' | 'hidden';

  /** Web search settings for search-enabled models */
  search_settings?: GroqSearchSettings;

  /** Documents for RAG (retrieval-augmented generation) */
  documents?: GroqDocument[];

  /** Citation options for document-based responses */
  citation_options?: GroqCitationOptions;
}

/**
 * Web search configuration for Groq's search-enabled models.
 */
export interface GroqSearchSettings {
  /** Search mode: 'auto' lets the model decide, 'on' forces search, 'off' disables */
  mode?: 'auto' | 'on' | 'off';
}

/**
 * Document for RAG (retrieval-augmented generation).
 */
export interface GroqDocument {
  /** Document content */
  content: string;
  /** Optional document ID for citation */
  id?: string;
  /** Optional document title */
  title?: string;
}

/**
 * Citation options for document-based responses.
 */
export interface GroqCitationOptions {
  /** Enable inline citations in the response */
  enabled?: boolean;
}

/**
 * Response format options for structured output.
 */
export type GroqResponseFormat =
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
 * Request body for the Groq Chat Completions API.
 */
export interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  stop?: string | string[];
  max_tokens?: number;
  max_completion_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
  seed?: number;
  tools?: GroqTool[];
  tool_choice?: GroqToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: GroqResponseFormat;
  service_tier?: string;
  logprobs?: boolean;
  top_logprobs?: number;
  reasoning_effort?: string;
  reasoning_format?: string;
  search_settings?: GroqSearchSettings;
  documents?: GroqDocument[];
  citation_options?: GroqCitationOptions;
}

/**
 * Union type for all message types in the Groq API.
 */
export type GroqMessage =
  | GroqSystemMessage
  | GroqUserMessage
  | GroqAssistantMessage
  | GroqToolMessage;

/** System message for setting context and instructions */
export interface GroqSystemMessage {
  role: 'system';
  content: string;
}

/** User message with text or multimodal content */
export interface GroqUserMessage {
  role: 'user';
  content: string | GroqUserContent[];
}

/** Assistant message containing the model's response */
export interface GroqAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: GroqToolCall[];
}

/** Tool result message providing output from a function call */
export interface GroqToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * Union type for user content parts (text or image).
 */
export type GroqUserContent = GroqTextContent | GroqImageContent;

/** Text content part */
export interface GroqTextContent {
  type: 'text';
  text: string;
}

/** Image content part with URL reference (for vision models only) */
export interface GroqImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Tool call structure in assistant messages.
 */
export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool definition for the Groq API.
 */
export interface GroqTool {
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
export type GroqToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Response structure from the Groq Chat Completions API.
 */
export interface GroqResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: GroqChoice[];
  usage: GroqUsage;
  system_fingerprint?: string;
  x_groq?: {
    id?: string;
  };
}

/** A single choice from a completion response */
export interface GroqChoice {
  index: number;
  message: GroqAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: GroqLogprobs | null;
}

/** Log probability information for tokens */
export interface GroqLogprobs {
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
export interface GroqUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  queue_time?: number;
  prompt_time?: number;
  completion_time?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

/**
 * Streaming chunk structure from the Groq API.
 */
export interface GroqStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: GroqStreamChoice[];
  usage?: GroqUsage | null;
  system_fingerprint?: string;
  x_groq?: {
    id?: string;
    usage?: GroqUsage;
  };
}

/** A streaming choice containing incremental content */
export interface GroqStreamChoice {
  index: number;
  delta: GroqStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: GroqLogprobs | null;
}

/** Incremental content delta in a streaming chunk */
export interface GroqStreamDelta {
  role?: 'assistant';
  content?: string | null;
  tool_calls?: GroqStreamToolCall[];
}

/** Incremental tool call data in a streaming chunk */
export interface GroqStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Groq-specific HTTP headers for API requests.
 *
 * @example
 * ```typescript
 * const headers: GroqHeaders = {
 *   'X-Request-Id': 'my-request-id',
 * };
 * ```
 */
export interface GroqHeaders {
  /** Client-generated request ID for tracing */
  'X-Request-Id'?: string;
  [key: string]: string | undefined;
}
