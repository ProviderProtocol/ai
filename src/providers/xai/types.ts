/**
 * xAI Chat Completions API parameters (OpenAI-compatible).
 *
 * These parameters are passed through to the xAI `/v1/chat/completions` endpoint.
 * The API is fully compatible with OpenAI's Chat Completions API, allowing seamless
 * migration between providers.
 *
 * @example
 * ```typescript
 * const params: XAICompletionsParams = {
 *   max_tokens: 1000,
 *   temperature: 0.7,
 *   reasoning_effort: 'high', // Grok 3 Mini only
 * };
 * ```
 *
 * @see {@link XAIResponsesParams} for Responses API parameters
 * @see {@link XAIMessagesParams} for Messages API parameters
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
 * xAI Responses API parameters (OpenAI Responses-compatible).
 *
 * These parameters are passed through to the xAI `/v1/responses` endpoint.
 * The Responses API provides stateful conversation support with features like
 * `previous_response_id` for continuing conversations across requests.
 *
 * @example
 * ```typescript
 * const params: XAIResponsesParams = {
 *   max_output_tokens: 1000,
 *   temperature: 0.7,
 *   store: true, // Enable stateful storage
 *   previous_response_id: 'resp_123...', // Continue previous conversation
 * };
 * ```
 *
 * @see {@link XAICompletionsParams} for Chat Completions API parameters
 * @see {@link XAIMessagesParams} for Messages API parameters
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

  /**
   * Built-in agentic tools for server-side execution.
   *
   * Use the tool helper constructors from the `tools` namespace:
   * - `tools.webSearch()` - Web search capability
   * - `tools.xSearch()` - X (Twitter) search capability
   * - `tools.codeExecution()` - Python code execution
   * - `tools.fileSearch()` - Document/collections search
   * - `tools.mcp()` - Remote MCP server connection
   *
   * Note: Only available via the Responses API (`api: 'responses'`).
   *
   * @example
   * ```typescript
   * import { xai, tools } from 'provider-protocol/xai';
   *
   * const model = llm({
   *   model: xai('grok-4-1-fast', { api: 'responses' }),
   *   params: {
   *     tools: [
   *       tools.webSearch(),
   *       tools.xSearch({ from_date: '2025-01-01' }),
   *       tools.codeExecution(),
   *     ],
   *   },
   * });
   * ```
   */
  tools?: XAIBuiltInTool[];

  /**
   * Maximum agent reasoning turns.
   * Limits the number of assistant turns, not individual tool calls.
   */
  max_turns?: number;
}

/**
 * xAI Messages API parameters (Anthropic-compatible).
 *
 * These parameters are passed through to the xAI `/v1/messages` endpoint.
 * The API is compatible with Anthropic's Messages API, allowing developers
 * migrating from Anthropic to use familiar patterns.
 *
 * @example
 * ```typescript
 * const params: XAIMessagesParams = {
 *   max_tokens: 1000,
 *   temperature: 0.7,
 *   thinking: { type: 'enabled', budget_tokens: 500 }, // Extended thinking
 * };
 * ```
 *
 * @see {@link XAICompletionsParams} for Chat Completions API parameters
 * @see {@link XAIResponsesParams} for Responses API parameters
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
 * API mode selector for the xAI provider.
 *
 * xAI supports three distinct API modes, each with different capabilities:
 * - `completions`: OpenAI Chat Completions compatible (recommended, default)
 * - `responses`: OpenAI Responses compatible with stateful conversations
 * - `messages`: Anthropic Messages compatible for easy migration
 */
export type XAIAPIMode = 'completions' | 'responses' | 'messages';

/**
 * Options for configuring an xAI model reference.
 */
export interface XAIModelOptions {
  /** The API mode to use for this model */
  api?: XAIAPIMode;
}

/**
 * A reference to an xAI model with optional configuration.
 */
export interface XAIModelReference {
  /** The xAI model identifier (e.g., 'grok-4', 'grok-3-mini') */
  modelId: string;
  /** Optional model-specific options */
  options?: XAIModelOptions;
}

/**
 * Configuration options for the xAI provider.
 */
export interface XAIConfig {
  /** The API mode to use (defaults to 'completions') */
  api?: XAIAPIMode;
}

/**
 * Live Search parameters for real-time web search integration.
 *
 * @deprecated Live Search API will be removed on December 15, 2025.
 * Use the Agent Tools API with `web_search` tool instead.
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

// ============================================
// Built-in Agentic Tools (Responses API)
// ============================================

/**
 * Web search tool for real-time web information retrieval.
 *
 * Enables Grok to search the web for up-to-date information.
 * Pricing: $5 per 1,000 successful tool invocations.
 *
 * @example
 * ```typescript
 * const tool: XAIWebSearchTool = {
 *   type: 'web_search',
 *   allowed_domains: ['wikipedia.org', 'github.com'],
 * };
 * ```
 */
export interface XAIWebSearchTool {
  /** Tool type identifier */
  type: 'web_search';
  /** Restrict to specific domains (max 5, mutually exclusive with excluded_domains) */
  allowed_domains?: string[];
  /** Exclude specific domains (max 5, mutually exclusive with allowed_domains) */
  excluded_domains?: string[];
  /** Enable image analysis from search results */
  enable_image_understanding?: boolean;
}

/**
 * X (Twitter) search tool for social media content.
 *
 * Enables Grok to search X posts and profiles in real-time.
 * Pricing: $5 per 1,000 successful tool invocations.
 *
 * @example
 * ```typescript
 * const tool: XAIXSearchTool = {
 *   type: 'x_search',
 *   allowed_x_handles: ['elonmusk', 'xai'],
 *   from_date: '2025-01-01',
 * };
 * ```
 */
export interface XAIXSearchTool {
  /** Tool type identifier */
  type: 'x_search';
  /** Limit to specific X handles (max 10, mutually exclusive with excluded_x_handles) */
  allowed_x_handles?: string[];
  /** Exclude specific X handles (max 10, "grok" excluded by default) */
  excluded_x_handles?: string[];
  /** Start date filter (YYYY-MM-DD) */
  from_date?: string;
  /** End date filter (YYYY-MM-DD) */
  to_date?: string;
  /** Enable image analysis in posts */
  enable_image_understanding?: boolean;
  /** Enable video analysis in posts */
  enable_video_understanding?: boolean;
}

/**
 * Code execution tool for Python in a sandbox.
 *
 * Enables Grok to write and execute Python code in a secure environment.
 * Pricing: $5 per 1,000 successful tool invocations.
 *
 * @example
 * ```typescript
 * const tool: XAICodeExecutionTool = {
 *   type: 'code_interpreter',
 *   container: {
 *     pip_packages: ['numpy', 'pandas'],
 *   },
 * };
 * ```
 */
export interface XAICodeExecutionTool {
  /** Tool type identifier */
  type: 'code_interpreter';
  /** Container configuration */
  container?: {
    /** Additional pip packages to install */
    pip_packages?: string[];
  };
}

/**
 * File/collections search tool for document retrieval.
 *
 * Enables Grok to search through uploaded document collections.
 * Pricing: $2.50 per 1,000 successful tool invocations.
 *
 * @example
 * ```typescript
 * const tool: XAIFileSearchTool = {
 *   type: 'file_search',
 *   vector_store_ids: ['vs_abc123'],
 *   max_num_results: 10,
 * };
 * ```
 */
export interface XAIFileSearchTool {
  /** Tool type identifier */
  type: 'file_search';
  /** Collection/vector store IDs to search */
  vector_store_ids: string[];
  /** Maximum results to return */
  max_num_results?: number;
  /** Retrieval mode configuration */
  retrieval_mode?: {
    type: 'keyword' | 'semantic' | 'hybrid';
  };
}

/**
 * Remote MCP server tool configuration.
 *
 * Enables Grok to connect to external Model Context Protocol servers.
 * Pricing: Token-based only (no per-invocation charge).
 *
 * @example
 * ```typescript
 * const tool: XAIMcpTool = {
 *   type: 'mcp',
 *   server_url: 'https://my-mcp-server.com/sse',
 *   server_label: 'my_tools',
 * };
 * ```
 */
export interface XAIMcpTool {
  /** Tool type identifier */
  type: 'mcp';
  /** MCP server URL (HTTP Streaming/SSE only) */
  server_url: string;
  /** Server label for tool call prefixing */
  server_label?: string;
  /** Description of server capabilities */
  server_description?: string;
  /** Specific tools to enable (empty = all available) */
  allowed_tool_names?: string[];
  /** Authentication token */
  authorization?: string;
  /** Custom request headers */
  extra_headers?: Record<string, string>;
}

/**
 * Union type for all xAI built-in tools.
 *
 * These tools are only available via the Responses API (`api: 'responses'`).
 * They run server-side and provide agentic capabilities.
 */
export type XAIBuiltInTool =
  | XAIWebSearchTool
  | XAIXSearchTool
  | XAICodeExecutionTool
  | XAIFileSearchTool
  | XAIMcpTool;

/**
 * Server-side tool usage tracking returned in responses.
 */
export interface XAIServerSideToolUsage {
  /** Number of successful web searches */
  web_search?: number;
  /** Number of successful X searches */
  x_search?: number;
  /** Number of successful code executions */
  code_execution?: number;
  /** Number of successful file searches */
  file_search?: number;
}

// ============================================
// Tool Helper Constructors
// ============================================

/**
 * Creates a web search tool configuration.
 *
 * Enables Grok to search the web for up-to-date information.
 * Pricing: $5 per 1,000 successful tool invocations.
 *
 * @param options - Optional configuration for search behavior
 * @returns A web search tool configuration object
 *
 * @example
 * ```typescript
 * // Basic web search
 * const search = webSearchTool();
 *
 * // With domain restrictions
 * const searchWithDomains = webSearchTool({
 *   allowed_domains: ['wikipedia.org', 'github.com'],
 * });
 * ```
 */
export function webSearchTool(options?: {
  allowed_domains?: string[];
  excluded_domains?: string[];
  enable_image_understanding?: boolean;
}): XAIWebSearchTool {
  return {
    type: 'web_search',
    ...options,
  };
}

/**
 * Creates an X (Twitter) search tool configuration.
 *
 * Enables Grok to search X posts and profiles in real-time.
 * Pricing: $5 per 1,000 successful tool invocations.
 *
 * @param options - Optional configuration for search behavior
 * @returns An X search tool configuration object
 *
 * @example
 * ```typescript
 * // Basic X search
 * const xSearch = xSearchTool();
 *
 * // With handle and date filters
 * const filteredSearch = xSearchTool({
 *   allowed_x_handles: ['elonmusk', 'xai'],
 *   from_date: '2025-01-01',
 *   to_date: '2025-12-31',
 * });
 * ```
 */
export function xSearchTool(options?: {
  allowed_x_handles?: string[];
  excluded_x_handles?: string[];
  from_date?: string;
  to_date?: string;
  enable_image_understanding?: boolean;
  enable_video_understanding?: boolean;
}): XAIXSearchTool {
  return {
    type: 'x_search',
    ...options,
  };
}

/**
 * Creates a code execution tool configuration.
 *
 * Enables Grok to write and execute Python code in a sandbox.
 * Pricing: $5 per 1,000 successful tool invocations.
 *
 * @param options - Optional configuration for the execution environment
 * @returns A code execution tool configuration object
 *
 * @example
 * ```typescript
 * // Basic code execution
 * const codeExec = codeExecutionTool();
 *
 * // With additional packages
 * const codeExecWithPackages = codeExecutionTool({
 *   pip_packages: ['numpy', 'pandas', 'scipy'],
 * });
 * ```
 */
export function codeExecutionTool(options?: {
  pip_packages?: string[];
}): XAICodeExecutionTool {
  return {
    type: 'code_interpreter',
    ...(options?.pip_packages && { container: { pip_packages: options.pip_packages } }),
  };
}

/**
 * Creates a file/collections search tool configuration.
 *
 * Enables Grok to search through uploaded document collections.
 * Pricing: $2.50 per 1,000 successful tool invocations.
 *
 * @param options - File search configuration
 * @returns A file search tool configuration object
 *
 * @example
 * ```typescript
 * const fileSearch = fileSearchTool({
 *   vector_store_ids: ['vs_abc123'],
 *   max_num_results: 10,
 *   retrieval_mode: 'hybrid',
 * });
 * ```
 */
export function fileSearchTool(options: {
  vector_store_ids: string[];
  max_num_results?: number;
  retrieval_mode?: 'keyword' | 'semantic' | 'hybrid';
}): XAIFileSearchTool {
  return {
    type: 'file_search',
    vector_store_ids: options.vector_store_ids,
    ...(options.max_num_results !== undefined && { max_num_results: options.max_num_results }),
    ...(options.retrieval_mode && { retrieval_mode: { type: options.retrieval_mode } }),
  };
}

/**
 * Creates a remote MCP server tool configuration.
 *
 * Enables Grok to connect to external Model Context Protocol servers.
 * Pricing: Token-based only (no per-invocation charge).
 *
 * @param options - MCP server configuration
 * @returns An MCP tool configuration object
 *
 * @example
 * ```typescript
 * const mcp = mcpTool({
 *   server_url: 'https://my-mcp-server.com/sse',
 *   server_label: 'my_tools',
 *   allowed_tool_names: ['get_weather', 'search_db'],
 * });
 * ```
 */
export function mcpTool(options: {
  server_url: string;
  server_label?: string;
  server_description?: string;
  allowed_tool_names?: string[];
  authorization?: string;
  extra_headers?: Record<string, string>;
}): XAIMcpTool {
  return {
    type: 'mcp',
    ...options,
  };
}

/**
 * Namespace object containing all xAI tool helper constructors.
 *
 * Provides a convenient way to create built-in tool configurations.
 * Note: These tools are only available via the Responses API (`api: 'responses'`).
 *
 * @example
 * ```typescript
 * import { xai, tools } from 'provider-protocol/xai';
 *
 * const model = llm({
 *   model: xai('grok-4-1-fast', { api: 'responses' }),
 *   params: {
 *     tools: [
 *       tools.webSearch(),
 *       tools.xSearch({ from_date: '2025-01-01' }),
 *       tools.codeExecution(),
 *     ],
 *     include: ['inline_citations', 'code_execution_call_output'],
 *   },
 * });
 * ```
 */
export const tools = {
  /** Creates a web search tool configuration */
  webSearch: webSearchTool,
  /** Creates an X (Twitter) search tool configuration */
  xSearch: xSearchTool,
  /** Creates a code execution tool configuration */
  codeExecution: codeExecutionTool,
  /** Creates a file/collections search tool configuration */
  fileSearch: fileSearchTool,
  /** Creates a remote MCP server tool configuration */
  mcp: mcpTool,
};

/**
 * @deprecated Use the specific tool interfaces and the `tools` namespace instead.
 * This basic type is maintained for backwards compatibility.
 */
export interface XAIAgentTool {
  /** The type of server-side tool to enable */
  type: 'web_search' | 'x_search' | 'code_execution';
}

// ============================================
// Chat Completions API Types (OpenAI-compatible)
// ============================================

/**
 * Request body for the xAI Chat Completions API.
 *
 * This interface represents the full request structure sent to `/v1/chat/completions`.
 * It follows the OpenAI Chat Completions API specification.
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
 * Union type for all message roles in the Chat Completions API.
 */
export type XAICompletionsMessage =
  | XAISystemMessage
  | XAIUserMessage
  | XAIAssistantMessage
  | XAIToolMessage;

/** System message for setting context and instructions. */
export interface XAISystemMessage {
  role: 'system';
  content: string;
  name?: string;
}

/** User message containing the user's input. */
export interface XAIUserMessage {
  role: 'user';
  content: string | XAIUserContent[];
  name?: string;
}

/** Assistant message containing the model's response. */
export interface XAIAssistantMessage {
  role: 'assistant';
  content?: string | null;
  name?: string;
  tool_calls?: XAIToolCall[];
  refusal?: string | null;
}

/** Tool result message containing the output of a tool call. */
export interface XAIToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * Union type for content within user messages.
 */
export type XAIUserContent = XAITextContent | XAIImageContent;

/** Text content block. */
export interface XAITextContent {
  type: 'text';
  text: string;
}

/** Image content block with URL reference. */
export interface XAIImageContent {
  type: 'image_url';
  image_url: {
    /** Image URL (supports data: URLs for base64) */
    url: string;
    /** Image processing detail level */
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * A tool call made by the assistant.
 */
export interface XAIToolCall {
  /** Unique identifier for this tool call */
  id: string;
  type: 'function';
  function: {
    /** Name of the function to call */
    name: string;
    /** JSON-encoded function arguments */
    arguments: string;
  };
}

/**
 * Tool definition for the Chat Completions API.
 */
export interface XAICompletionsTool {
  type: 'function';
  function: {
    /** Unique name for the tool */
    name: string;
    /** Description of what the tool does */
    description: string;
    /** JSON Schema defining the tool's parameters */
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    /** Enable strict mode for parameter validation */
    strict?: boolean;
  };
}

/**
 * Controls how the model selects which tools to use.
 *
 * - `'none'`: Never use tools
 * - `'auto'`: Let the model decide when to use tools
 * - `'required'`: Force the model to use at least one tool
 * - `{ type: 'function', function: { name: string } }`: Force a specific tool
 */
export type XAIToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * Specifies the output format for structured responses.
 *
 * - `{ type: 'text' }`: Plain text output (default)
 * - `{ type: 'json_object' }`: JSON output with flexible schema
 * - `{ type: 'json_schema', ... }`: JSON output with strict schema validation
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
 * Response from the Chat Completions API.
 */
export interface XAICompletionsResponse {
  /** Unique response identifier */
  id: string;
  object: 'chat.completion';
  /** Unix timestamp of creation */
  created: number;
  /** Model used for generation */
  model: string;
  /** Generated completion choices */
  choices: XAICompletionsChoice[];
  /** Token usage statistics */
  usage: XAIUsage;
  /** Server-side fingerprint for reproducibility */
  system_fingerprint?: string;
  /** Citation URLs from Live Search */
  citations?: string[];
  /** Inline citations with text and URL */
  inline_citations?: Array<{ text: string; url: string }>;
}

/** A single completion choice from the API response. */
export interface XAICompletionsChoice {
  /** Index of this choice in the choices array */
  index: number;
  /** The generated assistant message */
  message: XAIAssistantMessage;
  /** Reason the model stopped generating */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  /** Log probabilities for tokens (if requested) */
  logprobs?: XAILogprobs | null;
}

/** Token log probabilities for debugging and analysis. */
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

/** Token usage statistics for billing and monitoring. */
export interface XAIUsage {
  /** Tokens in the prompt */
  prompt_tokens: number;
  /** Tokens in the completion */
  completion_tokens: number;
  /** Total tokens used */
  total_tokens: number;
  /** Breakdown of prompt token types */
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  /** Breakdown of completion token types */
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
}

/**
 * A streaming chunk from the Chat Completions API.
 */
export interface XAICompletionsStreamChunk {
  /** Response identifier (same across all chunks) */
  id: string;
  object: 'chat.completion.chunk';
  /** Unix timestamp of creation */
  created: number;
  /** Model used for generation */
  model: string;
  /** Streaming choices with deltas */
  choices: XAICompletionsStreamChoice[];
  /** Token usage (only present in final chunk with stream_options.include_usage) */
  usage?: XAIUsage | null;
  /** Server-side fingerprint */
  system_fingerprint?: string;
}

/** A streaming choice containing delta updates. */
export interface XAICompletionsStreamChoice {
  index: number;
  /** Incremental content update */
  delta: XAICompletionsStreamDelta;
  /** Non-null when generation is complete */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: XAILogprobs | null;
}

/** Delta update containing new content. */
export interface XAICompletionsStreamDelta {
  role?: 'assistant';
  /** New text content */
  content?: string | null;
  /** Tool call updates */
  tool_calls?: XAIStreamToolCall[];
  /** Refusal message */
  refusal?: string | null;
}

/** Streaming tool call with incremental argument updates. */
export interface XAIStreamToolCall {
  /** Index within the tool_calls array */
  index: number;
  /** Tool call ID (present in first chunk for this call) */
  id?: string;
  type?: 'function';
  function?: {
    /** Function name (present in first chunk) */
    name?: string;
    /** Incremental JSON argument fragment */
    arguments?: string;
  };
}

// ============================================
// Responses API Types (OpenAI Responses-compatible)
// ============================================

/**
 * Request body for the xAI Responses API.
 *
 * This interface represents the full request structure sent to `/v1/responses`.
 * The Responses API supports stateful conversations via `previous_response_id`.
 */
export interface XAIResponsesRequest {
  model: string;
  input: string | XAIResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Array<XAIResponsesTool | XAIBuiltInTool>;
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
 * Union type for input items in the Responses API.
 */
export type XAIResponsesInputItem =
  | XAIResponsesSystemItem
  | XAIResponsesUserItem
  | XAIResponsesAssistantItem
  | XAIResponsesFunctionCallInputItem
  | XAIResponsesToolResultItem;

/** System or developer message for the Responses API. */
export interface XAIResponsesSystemItem {
  type: 'message';
  role: 'system' | 'developer';
  content: string | XAIResponsesContentPart[];
}

/** User message for the Responses API. */
export interface XAIResponsesUserItem {
  type: 'message';
  role: 'user';
  content: string | XAIResponsesContentPart[];
}

/** Assistant message for the Responses API. */
export interface XAIResponsesAssistantItem {
  type: 'message';
  role: 'assistant';
  content: string | XAIResponsesContentPart[];
}

/** Function call input item for multi-turn tool conversations. */
export interface XAIResponsesFunctionCallInputItem {
  type: 'function_call';
  /** Unique item identifier */
  id: string;
  /** Call identifier for matching with output */
  call_id: string;
  /** Function name */
  name: string;
  /** JSON-encoded arguments */
  arguments: string;
}

/** Tool result item containing function output. */
export interface XAIResponsesToolResultItem {
  type: 'function_call_output';
  /** Call identifier matching the function_call */
  call_id: string;
  /** String output from the function */
  output: string;
}

/**
 * Union type for content parts within Responses API messages.
 */
export type XAIResponsesContentPart =
  | XAIResponsesTextPart
  | XAIResponsesImagePart
  | XAIResponsesFunctionCallPart;

/** Text content part for input or output. */
export interface XAIResponsesTextPart {
  type: 'input_text' | 'output_text';
  text: string;
}

/** Image content part for input. */
export interface XAIResponsesImagePart {
  type: 'input_image';
  /** Image URL (including data: URLs) */
  image_url?: string;
  /** Base64-encoded image data */
  image?: string;
  /** Image processing detail level */
  detail?: 'auto' | 'low' | 'high';
}

/** Function call content part. */
export interface XAIResponsesFunctionCallPart {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * Tool definition for the Responses API.
 */
export interface XAIResponsesTool {
  type: 'function';
  /** Unique name for the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON Schema defining the tool's parameters */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /** Enable strict mode for parameter validation */
  strict?: boolean;
}

/**
 * Controls how the model selects which tools to use in the Responses API.
 */
export type XAIResponsesToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; name: string };

/**
 * Text output configuration for structured responses in the Responses API.
 */
export interface XAIResponsesTextConfig {
  /** Output format specification */
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
 * Response from the Responses API.
 */
export interface XAIResponsesResponse {
  /** Unique response identifier (used as previous_response_id for continuation) */
  id: string;
  object: 'response';
  /** Unix timestamp of creation */
  created_at: number;
  /** Model used for generation */
  model: string;
  /** Generated output items */
  output: XAIResponsesOutputItem[];
  /** Token usage statistics */
  usage: XAIResponsesUsage;
  /** Current response status */
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress';
  /** Error details if status is 'failed' */
  error?: {
    code: string;
    message: string;
  };
  /** Details about why response is incomplete */
  incomplete_details?: {
    reason: string;
  };
  /** Citation URLs from Live Search */
  citations?: string[];
  /** Inline citations with text and URL */
  inline_citations?: Array<{ text: string; url: string }>;
}

/** Union type for output items in Responses API responses. */
export type XAIResponsesOutputItem =
  | XAIResponsesMessageOutput
  | XAIResponsesFunctionCallOutput;

/** Message output item containing text or refusal content. */
export interface XAIResponsesMessageOutput {
  type: 'message';
  /** Unique output item identifier */
  id: string;
  role: 'assistant';
  /** Content blocks within this message */
  content: XAIResponsesOutputContent[];
  /** Generation status for this item */
  status: 'completed' | 'in_progress';
}

/** Function call output item representing a tool invocation. */
export interface XAIResponsesFunctionCallOutput {
  type: 'function_call';
  /** Unique item identifier */
  id: string;
  /** Call identifier for matching with function_call_output */
  call_id: string;
  /** Function name */
  name: string;
  /** JSON-encoded arguments */
  arguments: string;
  /** Generation status for this item */
  status: 'completed' | 'in_progress';
}

/** Union type for output content within message items. */
export type XAIResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

/** Token usage statistics for the Responses API. */
export interface XAIResponsesUsage {
  /** Tokens in the input */
  input_tokens: number;
  /** Tokens in the output */
  output_tokens: number;
  /** Total tokens used */
  total_tokens: number;
  /** Breakdown of input token types */
  input_tokens_details?: {
    cached_tokens?: number;
    text_tokens?: number;
    image_tokens?: number;
    audio_tokens?: number;
  };
  /** Breakdown of output token types */
  output_tokens_details?: {
    text_tokens?: number;
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
}

/**
 * Union type for all streaming events in the Responses API.
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

/** Emitted when a response is first created. */
export interface XAIResponseCreatedEvent {
  type: 'response.created';
  response: XAIResponsesResponse;
}

/** Emitted when response generation is in progress. */
export interface XAIResponseInProgressEvent {
  type: 'response.in_progress';
  response: XAIResponsesResponse;
}

/** Emitted when response generation completes successfully. */
export interface XAIResponseCompletedEvent {
  type: 'response.completed';
  response: XAIResponsesResponse;
}

/** Emitted when response generation fails. */
export interface XAIResponseFailedEvent {
  type: 'response.failed';
  response: XAIResponsesResponse;
}

/** Emitted when a new output item is added to the response. */
export interface XAIResponseOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: XAIResponsesOutputItem;
}

/** Emitted when an output item generation is complete. */
export interface XAIResponseOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: XAIResponsesOutputItem;
}

/** Emitted when a content part is added to an output item. */
export interface XAIResponseContentPartAddedEvent {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  part: XAIResponsesOutputContent;
}

/** Emitted when a content part generation is complete. */
export interface XAIResponseContentPartDoneEvent {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  part: XAIResponsesOutputContent;
}

/** Emitted for incremental text content updates. */
export interface XAIResponseTextDeltaEvent {
  type: 'response.output_text.delta';
  output_index: number;
  content_index: number;
  /** The new text fragment */
  delta: string;
}

/** Emitted when text content generation is complete. */
export interface XAIResponseTextDoneEvent {
  type: 'response.output_text.done';
  output_index: number;
  content_index: number;
  /** The complete text content */
  text: string;
}

/** Emitted for incremental refusal message updates. */
export interface XAIResponseRefusalDeltaEvent {
  type: 'response.refusal.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

/** Emitted when refusal message generation is complete. */
export interface XAIResponseRefusalDoneEvent {
  type: 'response.refusal.done';
  output_index: number;
  content_index: number;
  refusal: string;
}

/** Emitted for incremental function call argument updates. */
export interface XAIResponseFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  item_id: string;
  /** The new JSON argument fragment */
  delta: string;
  call_id?: string;
}

/** Emitted when function call arguments generation is complete. */
export interface XAIResponseFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  item_id: string;
  name: string;
  /** The complete JSON arguments */
  arguments: string;
  call_id?: string;
}

/** Emitted when an error occurs during streaming. */
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
 * Request body for the xAI Messages API.
 *
 * This interface represents the full request structure sent to `/v1/messages`.
 * It follows the Anthropic Messages API specification for compatibility.
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
 * Message format for the Messages API.
 */
export interface XAIMessagesMessage {
  /** Message role (user or assistant) */
  role: 'user' | 'assistant';
  /** Message content (string or array of content blocks) */
  content: XAIMessagesContent[] | string;
}

/**
 * Union type for content blocks in the Messages API.
 */
export type XAIMessagesContent =
  | XAIMessagesTextContent
  | XAIMessagesImageContent
  | XAIMessagesToolUseContent
  | XAIMessagesToolResultContent;

/** Text content block. */
export interface XAIMessagesTextContent {
  type: 'text';
  text: string;
}

/** Image content block with source information. */
export interface XAIMessagesImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    /** MIME type (e.g., 'image/png') */
    media_type?: string;
    /** Base64-encoded image data (for type: 'base64') */
    data?: string;
    /** Image URL (for type: 'url') */
    url?: string;
  };
}

/** Tool use content block representing a tool invocation by the assistant. */
export interface XAIMessagesToolUseContent {
  type: 'tool_use';
  /** Unique identifier for this tool use */
  id: string;
  /** Name of the tool being used */
  name: string;
  /** Tool input arguments */
  input: Record<string, unknown>;
}

/** Tool result content block containing the output of a tool execution. */
export interface XAIMessagesToolResultContent {
  type: 'tool_result';
  /** ID of the tool_use this is a result for */
  tool_use_id: string;
  /** Result content */
  content: string | XAIMessagesContent[];
  /** Whether the tool execution resulted in an error */
  is_error?: boolean;
}

/**
 * Tool definition for the Messages API.
 */
export interface XAIMessagesTool {
  /** Unique name for the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Response from the Messages API.
 */
export interface XAIMessagesResponse {
  /** Unique message identifier */
  id: string;
  type: 'message';
  role: 'assistant';
  /** Content blocks in the response */
  content: XAIMessagesResponseContent[];
  /** Model used for generation */
  model: string;
  /** Reason the model stopped generating */
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | null;
  /** The stop sequence that triggered stop (if applicable) */
  stop_sequence: string | null;
  /** Token usage statistics */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Union type for response content blocks in the Messages API. */
export type XAIMessagesResponseContent =
  | XAIMessagesTextContent
  | XAIMessagesToolUseContent
  | XAIMessagesThinkingContent;

/** Thinking content block from extended thinking feature. */
export interface XAIMessagesThinkingContent {
  type: 'thinking';
  /** The model's internal reasoning */
  thinking: string;
  /** Cryptographic signature for verification */
  signature?: string;
}

/**
 * Union type for all streaming events in the Messages API.
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

/** Emitted at the start of a message. */
export interface XAIMessagesMessageStartEvent {
  type: 'message_start';
  message: XAIMessagesResponse;
}

/** Emitted when a new content block starts. */
export interface XAIMessagesContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: XAIMessagesResponseContent;
}

/** Emitted for incremental content block updates. */
export interface XAIMessagesContentBlockDeltaEvent {
  type: 'content_block_delta';
  /** Index may be omitted by xAI (unlike Anthropic) - use tracked currentIndex as fallback */
  index?: number;
  /** Delta content (type varies based on content block type) */
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'signature_delta'; signature: string }
    | { type: 'input_json_delta'; partial_json: string };
}

/** Emitted when a content block is complete. */
export interface XAIMessagesContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

/** Emitted with final message metadata. */
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

/** Emitted when message generation is complete. */
export interface XAIMessagesMessageStopEvent {
  type: 'message_stop';
}

/** Keep-alive ping event. */
export interface XAIMessagesPingEvent {
  type: 'ping';
}

/** Error event during streaming. */
export interface XAIMessagesErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * xAI-specific HTTP headers for API requests.
 *
 * @example
 * ```typescript
 * const headers: XAIHeaders = {
 *   'X-Client-Request-Id': 'trace-123',
 * };
 * ```
 */
export interface XAIHeaders {
  /** Client-generated request ID for tracing. */
  'X-Client-Request-Id'?: string;
  [key: string]: string | undefined;
}
