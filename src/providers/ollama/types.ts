/**
 * Ollama-specific LLM parameters
 * These map to Ollama's runtime options
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
 * Ollama chat message format
 */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Base64 encoded images for vision models */
  images?: string[];
  /** Tool calls made by the assistant */
  tool_calls?: OllamaToolCall[];
  /** Tool name when role is 'tool' */
  tool_name?: string;
}

/**
 * Ollama tool call format
 */
export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Ollama tool definition format
 */
export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Ollama API request body for chat endpoint
 */
export interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json' | Record<string, unknown>;
  options?: OllamaOptions;
  tools?: OllamaTool[];
  keep_alive?: string | number;
  think?: boolean | 'high' | 'medium' | 'low';
  logprobs?: boolean;
  top_logprobs?: number;
}

/**
 * Ollama runtime options (passed in options field)
 */
export interface OllamaOptions {
  num_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  typical_p?: number;
  repeat_penalty?: number;
  repeat_last_n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: 0 | 1 | 2;
  mirostat_eta?: number;
  mirostat_tau?: number;
  penalize_newline?: boolean;
  stop?: string[];
  seed?: number;
  num_keep?: number;
  num_ctx?: number;
  num_batch?: number;
  num_thread?: number;
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  f16_kv?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  vocab_only?: boolean;
  numa?: boolean;
  tfs_z?: number;
}

/**
 * Ollama API response format
 */
export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaResponseMessage;
  done: boolean;
  done_reason?: 'stop' | 'length' | 'load' | 'unload';
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  logprobs?: OllamaLogprob[];
}

/**
 * Ollama response message format
 */
export interface OllamaResponseMessage {
  role: 'assistant';
  content: string;
  /** Thinking content (if think mode enabled) */
  thinking?: string;
  /** Tool calls requested by the model */
  tool_calls?: OllamaToolCall[];
  /** Images (for multimodal responses) */
  images?: string[];
}

/**
 * Ollama log probability format
 */
export interface OllamaLogprob {
  token: string;
  logprob: number;
  bytes?: number[];
  top_logprobs?: Array<{
    token: string;
    logprob: number;
    bytes?: number[];
  }>;
}

/**
 * Ollama streaming response chunk
 * Same structure as regular response but partial
 */
export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: OllamaResponseMessage;
  done: boolean;
  done_reason?: 'stop' | 'length' | 'load' | 'unload';
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  logprobs?: OllamaLogprob[];
}
