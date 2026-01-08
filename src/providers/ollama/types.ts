/**
 * @fileoverview Type definitions for the Ollama provider.
 *
 * This module defines all TypeScript interfaces for interacting with
 * Ollama's native API. These types map directly to Ollama's API structure
 * as documented at https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * @module providers/ollama/types
 */

/**
 * Ollama-specific LLM parameters for model inference.
 *
 * These parameters control model behavior during text generation. Most map
 * directly to Ollama's `options` field in the API, while some (`keep_alive`,
 * `think`, `logprobs`, `top_logprobs`) are top-level request parameters.
 *
 * All parameters are optional and will use Ollama's defaults if not specified.
 *
 * @example
 * ```typescript
 * const params: OllamaLLMParams = {
 *   temperature: 0.7,
 *   top_p: 0.9,
 *   num_predict: 500,
 *   stop: ['\n\n', 'END']
 * };
 * ```
 *
 * @see {@link https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values} Ollama Parameters
 */
export interface OllamaLLMParams {
  /** Maximum number of tokens to predict (default: -1 = infinite) */
  num_predict?: number;

  /** Temperature for randomness (default: 0.8) */
  temperature?: number;

  /** Top-p (nucleus) sampling (default: 0.9) */
  top_p?: number;

  /** Top-k sampling (default: 40) */
  top_k?: number;

  /** Minimum probability for a token to be considered (default: 0.0) */
  min_p?: number;

  /** Typical p sampling (default: 1.0 = disabled) */
  typical_p?: number;

  /** Repeat penalty (default: 1.1) */
  repeat_penalty?: number;

  /** Number of tokens to look back for repeat penalty (default: 64) */
  repeat_last_n?: number;

  /** Presence penalty (default: 0.0) */
  presence_penalty?: number;

  /** Frequency penalty (default: 0.0) */
  frequency_penalty?: number;

  /** Mirostat sampling mode (0 = disabled, 1 = Mirostat, 2 = Mirostat 2.0) */
  mirostat?: 0 | 1 | 2;

  /** Mirostat learning rate (default: 0.1) */
  mirostat_eta?: number;

  /** Mirostat target entropy (default: 5.0) */
  mirostat_tau?: number;

  /** Penalize newlines (default: true) */
  penalize_newline?: boolean;

  /** Stop sequences */
  stop?: string[];

  /** Seed for deterministic sampling (default: random) */
  seed?: number;

  /** Number of tokens to keep from initial prompt (default: 4) */
  num_keep?: number;

  /** Context window size (default: model-dependent) */
  num_ctx?: number;

  /** Number of batches (default: 512) */
  num_batch?: number;

  /** Number of threads (default: auto) */
  num_thread?: number;

  /** Number of layers to offload to GPU (default: auto) */
  num_gpu?: number;

  /** Main GPU to use (default: 0) */
  main_gpu?: number;

  /** Enable low VRAM mode */
  low_vram?: boolean;

  /** Enable f16 KV cache */
  f16_kv?: boolean;

  /** Use mmap for model loading */
  use_mmap?: boolean;

  /** Use mlock for memory locking */
  use_mlock?: boolean;

  /** Vocabulary only mode */
  vocab_only?: boolean;

  /** NUMA support */
  numa?: boolean;

  /** TFS-Z sampling (default: 1.0 = disabled) */
  tfs_z?: number;

  /** Enable thinking mode (for models that support it) */
  think?: boolean | 'high' | 'medium' | 'low';

  /** Keep model loaded in memory (string duration like "5m" or number of seconds) */
  keep_alive?: string | number;

  /** Return log probabilities */
  logprobs?: boolean;

  /** Number of top log probabilities to return */
  top_logprobs?: number;
}

/**
 * Ollama chat message format for the `/api/chat` endpoint.
 *
 * Represents a single message in a conversation. The `role` determines
 * the message type and which fields are valid:
 *
 * - `system`: System prompt message (content only)
 * - `user`: User input (content, optionally images)
 * - `assistant`: Model response (content, optionally tool_calls)
 * - `tool`: Tool result message (content, tool_name)
 */
export interface OllamaMessage {
  /** The role of the message sender. */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** The text content of the message. */
  content: string;
  /** Base64-encoded images for vision models (user messages only). */
  images?: string[];
  /** Tool calls requested by the model (assistant messages only). */
  tool_calls?: OllamaToolCall[];
  /** The name of the tool that produced this result (tool messages only). */
  tool_name?: string;
}

/**
 * Ollama tool call format.
 *
 * Represents a function call requested by the model. Uses the OpenAI-style
 * nested structure with function name and arguments.
 */
export interface OllamaToolCall {
  /** The function to call. */
  function: {
    /** The name of the function to invoke. */
    name: string;
    /** The arguments to pass to the function as key-value pairs. */
    arguments: Record<string, unknown>;
  };
}

/**
 * Ollama tool definition format for function calling.
 *
 * Follows the OpenAI function calling schema with a `type: 'function'`
 * wrapper. The function definition includes name, description, and
 * JSON Schema parameters.
 *
 * @example
 * ```typescript
 * const tool: OllamaTool = {
 *   type: 'function',
 *   function: {
 *     name: 'get_weather',
 *     description: 'Get the current weather for a location',
 *     parameters: {
 *       type: 'object',
 *       properties: {
 *         location: { type: 'string', description: 'City name' }
 *       },
 *       required: ['location']
 *     }
 *   }
 * };
 * ```
 */
export interface OllamaTool {
  /** Always 'function' for function-type tools. */
  type: 'function';
  /** The function definition. */
  function: {
    /** The unique name of the function. */
    name: string;
    /** A description of what the function does. */
    description: string;
    /** JSON Schema defining the function parameters. */
    parameters: {
      /** Always 'object' for parameter schemas. */
      type: 'object';
      /** Property definitions for each parameter. */
      properties: Record<string, unknown>;
      /** List of required parameter names. */
      required?: string[];
    };
  };
}

/**
 * Ollama API request body for the `/api/chat` endpoint.
 *
 * This is the complete request structure sent to Ollama's chat API.
 * The `model` and `messages` fields are required; all others are optional.
 */
export interface OllamaRequest {
  /** The model name to use (e.g., 'llama3.2', 'mistral', 'codellama'). */
  model: string;
  /** The conversation messages. */
  messages: OllamaMessage[];
  /** Whether to stream the response. Defaults to true. */
  stream?: boolean;
  /** Output format: 'json' for JSON mode, or a JSON Schema for structured output. */
  format?: 'json' | Record<string, unknown>;
  /** Model runtime options (temperature, top_p, etc.). */
  options?: OllamaOptions;
  /** Available tools for function calling. */
  tools?: OllamaTool[];
  /** How long to keep model loaded. String duration ('5m') or seconds. */
  keep_alive?: string | number;
  /** Enable thinking mode for supported models. */
  think?: boolean | 'high' | 'medium' | 'low';
  /** Return log probabilities of output tokens. */
  logprobs?: boolean;
  /** Number of top log probabilities to return per token. */
  top_logprobs?: number;
}

/**
 * Ollama runtime options passed in the `options` field of requests.
 *
 * These control model behavior during inference. They are separated from
 * top-level request fields and nested under `options` in the API call.
 *
 * @see {@link OllamaLLMParams} for the user-facing parameter interface
 */
export interface OllamaOptions {
  /** Maximum tokens to generate (-1 for unlimited). */
  num_predict?: number;
  /** Sampling temperature (higher = more random). */
  temperature?: number;
  /** Nucleus sampling threshold. */
  top_p?: number;
  /** Top-k sampling limit. */
  top_k?: number;
  /** Minimum probability threshold for tokens. */
  min_p?: number;
  /** Typical p sampling threshold. */
  typical_p?: number;
  /** Penalty for repeated tokens. */
  repeat_penalty?: number;
  /** Context window for repeat penalty. */
  repeat_last_n?: number;
  /** Penalty for tokens already present. */
  presence_penalty?: number;
  /** Penalty based on token frequency. */
  frequency_penalty?: number;
  /** Mirostat sampling mode (0=off, 1=v1, 2=v2). */
  mirostat?: 0 | 1 | 2;
  /** Mirostat learning rate. */
  mirostat_eta?: number;
  /** Mirostat target entropy. */
  mirostat_tau?: number;
  /** Whether to penalize newline tokens. */
  penalize_newline?: boolean;
  /** Sequences that stop generation. */
  stop?: string[];
  /** Random seed for reproducibility. */
  seed?: number;
  /** Tokens to keep from initial prompt. */
  num_keep?: number;
  /** Context window size. */
  num_ctx?: number;
  /** Batch size for prompt processing. */
  num_batch?: number;
  /** Number of CPU threads. */
  num_thread?: number;
  /** Number of GPU layers to offload. */
  num_gpu?: number;
  /** Primary GPU index for multi-GPU. */
  main_gpu?: number;
  /** Enable low VRAM mode. */
  low_vram?: boolean;
  /** Use FP16 for KV cache. */
  f16_kv?: boolean;
  /** Use memory-mapped model loading. */
  use_mmap?: boolean;
  /** Lock model in memory. */
  use_mlock?: boolean;
  /** Load vocabulary only. */
  vocab_only?: boolean;
  /** Enable NUMA optimization. */
  numa?: boolean;
  /** Tail-free sampling parameter. */
  tfs_z?: number;
}

/**
 * Ollama API response format from the `/api/chat` endpoint.
 *
 * Contains the generated message, completion status, token counts,
 * and timing information. For streaming responses, intermediate chunks
 * have `done: false` until the final chunk.
 */
export interface OllamaResponse {
  /** The model that generated the response. */
  model: string;
  /** ISO 8601 timestamp of when the response was created. */
  created_at: string;
  /** The generated assistant message. */
  message: OllamaResponseMessage;
  /** Whether generation is complete. */
  done: boolean;
  /** Why generation stopped: 'stop' (natural), 'length' (max tokens), 'load'/'unload' (model lifecycle). */
  done_reason?: 'stop' | 'length' | 'load' | 'unload';
  /** Total time spent generating in nanoseconds. */
  total_duration?: number;
  /** Time spent loading the model in nanoseconds. */
  load_duration?: number;
  /** Number of tokens in the prompt. */
  prompt_eval_count?: number;
  /** Time spent evaluating the prompt in nanoseconds. */
  prompt_eval_duration?: number;
  /** Number of tokens generated in the response. */
  eval_count?: number;
  /** Time spent generating tokens in nanoseconds. */
  eval_duration?: number;
  /** Log probabilities for generated tokens (if requested). */
  logprobs?: OllamaLogprob[];
}

/**
 * Ollama response message format.
 *
 * The assistant's response message containing generated text,
 * optional reasoning content (for thinking-enabled models),
 * and any tool calls the model wants to make.
 */
export interface OllamaResponseMessage {
  /** Always 'assistant' for response messages. */
  role: 'assistant';
  /** The generated text content. */
  content: string;
  /** Internal reasoning (visible when think mode is enabled). */
  thinking?: string;
  /** Tool calls the model wants to execute. */
  tool_calls?: OllamaToolCall[];
  /** Base64-encoded images (for multimodal responses). */
  images?: string[];
}

/**
 * Ollama log probability information for a single token.
 *
 * Returned when `logprobs: true` is set in the request. Contains
 * the probability of the selected token and optionally the top
 * alternative tokens with their probabilities.
 */
export interface OllamaLogprob {
  /** The token string. */
  token: string;
  /** Log probability of this token (natural log, so always <= 0). */
  logprob: number;
  /** UTF-8 byte representation of the token. */
  bytes?: number[];
  /** Alternative tokens that were considered, with their probabilities. */
  top_logprobs?: Array<{
    /** The alternative token string. */
    token: string;
    /** Log probability of this alternative. */
    logprob: number;
    /** UTF-8 byte representation. */
    bytes?: number[];
  }>;
}

/**
 * Ollama streaming response chunk.
 *
 * Identical structure to {@link OllamaResponse} but represents an
 * incremental update during streaming. The `message.content` field
 * contains only the new tokens generated since the last chunk.
 *
 * The final chunk has `done: true` and includes timing/usage statistics.
 */
export interface OllamaStreamChunk {
  /** The model that generated the response. */
  model: string;
  /** ISO 8601 timestamp for this chunk. */
  created_at: string;
  /** Partial message with new content. */
  message: OllamaResponseMessage;
  /** Whether this is the final chunk. */
  done: boolean;
  /** Why generation stopped (only on final chunk). */
  done_reason?: 'stop' | 'length' | 'load' | 'unload';
  /** Total duration in nanoseconds (only on final chunk). */
  total_duration?: number;
  /** Model load duration in nanoseconds (only on final chunk). */
  load_duration?: number;
  /** Prompt token count (only on final chunk). */
  prompt_eval_count?: number;
  /** Prompt evaluation duration in nanoseconds (only on final chunk). */
  prompt_eval_duration?: number;
  /** Generated token count (only on final chunk). */
  eval_count?: number;
  /** Token generation duration in nanoseconds (only on final chunk). */
  eval_duration?: number;
  /** Log probabilities (if requested, only on final chunk). */
  logprobs?: OllamaLogprob[];
}

/**
 * Ollama-specific HTTP headers for API requests.
 *
 * Supports arbitrary headers for proxy authentication.
 *
 * @example
 * ```typescript
 * const headers: OllamaHeaders = {
 *   'CF-Access-Client-Id': 'client-id.access',
 *   'CF-Access-Client-Secret': 'secret-token',
 * };
 * ```
 */
export interface OllamaHeaders {
  /** Cloudflare Access client ID for protected tunnels. */
  'CF-Access-Client-Id'?: string;
  /** Cloudflare Access client secret for protected tunnels. */
  'CF-Access-Client-Secret'?: string;
  [key: string]: string | undefined;
}
