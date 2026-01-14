/**
 * @fileoverview Anthropic API type definitions.
 *
 * Contains TypeScript interfaces for Anthropic's Messages API request/response
 * structures, streaming events, and provider-specific parameters.
 */

// ============================================
// Beta Headers
// ============================================

/**
 * Known Anthropic beta header values.
 *
 * Beta features are enabled by passing these values in the `betas` config option
 * or via the `anthropic-beta` HTTP header. Multiple betas can be enabled simultaneously.
 *
 * @example
 * ```typescript
 * import { anthropic, betas } from 'provider-protocol/anthropic';
 *
 * // Using the betas config option (recommended)
 * const provider = anthropic('claude-sonnet-4-20250514', {
 *   betas: [betas.structuredOutputs, betas.interleavedThinking],
 * });
 *
 * // Or use string values directly for new/unlisted betas
 * const provider = anthropic('claude-sonnet-4-20250514', {
 *   betas: ['new-beta-2025-12-01'],
 * });
 * ```
 */
export const betas = {
  // Structured Outputs
  /** Guaranteed JSON schema conformance for responses. Available for Claude Sonnet 4.5+. */
  structuredOutputs: 'structured-outputs-2025-11-13',

  // Extended Thinking / Reasoning
  /** Enables Claude to think between tool calls in Claude 4 models. */
  interleavedThinking: 'interleaved-thinking-2025-05-14',
  /** Developer mode for full thinking output visibility. */
  devFullThinking: 'dev-full-thinking-2025-05-14',
  /** Effort parameter for Claude Opus 4.5 - controls response thoroughness vs efficiency. */
  effort: 'effort-2025-11-24',

  // Computer Use
  /** Legacy computer use tool (Claude 3.x models). */
  computerUseLegacy: 'computer-use-2024-10-22',
  /** Computer use tool for Claude 4 models (mouse, keyboard, screenshots). */
  computerUse: 'computer-use-2025-01-24',
  /** Computer use tool for Claude Opus 4.5 with additional commands. */
  computerUseOpus: 'computer-use-2025-11-24',

  // Extended Output / Context
  /** Enables up to 8,192 output tokens from Claude Sonnet 3.5. */
  maxTokens35Sonnet: 'max-tokens-3-5-sonnet-2024-07-15',
  /** Enables 128K token output length. */
  output128k: 'output-128k-2025-02-19',
  /** Enables 1 million token context window for Claude Sonnet 4. */
  context1m: 'context-1m-2025-08-07',

  // Token Efficiency
  /** Reduces output token consumption by up to 70% for tool calls. */
  tokenEfficientTools: 'token-efficient-tools-2025-02-19',
  /** Streams tool use parameters without buffering/JSON validation. */
  fineGrainedToolStreaming: 'fine-grained-tool-streaming-2025-05-14',

  // Code Execution
  /** Code execution tool for running Python/Bash in secure sandbox. */
  codeExecution: 'code-execution-2025-08-25',

  // Advanced Tool Use
  /** Advanced tool use: Tool Search, Programmatic Tool Calling, Tool Use Examples. */
  advancedToolUse: 'advanced-tool-use-2025-11-20',

  // Files & Documents
  /** Files API for uploading and managing files. */
  filesApi: 'files-api-2025-04-14',
  /** PDF document support. */
  pdfs: 'pdfs-2024-09-25',

  // MCP (Model Context Protocol)
  /** MCP connector to connect to remote MCP servers. */
  mcpClient: 'mcp-client-2025-04-04',
  /** Updated MCP client. */
  mcpClientLatest: 'mcp-client-2025-11-20',

  // Caching
  /** Prompt caching for reduced latency and costs. Now works automatically with cache_control. */
  promptCaching: 'prompt-caching-2024-07-31',
  /** Enables 1-hour cache TTL (vs default 5-minute). */
  extendedCacheTtl: 'extended-cache-ttl-2025-04-11',

  // Context Management
  /** Automatic tool call clearing for context management. */
  contextManagement: 'context-management-2025-06-27',
  /** Handling for when model context window is exceeded. */
  modelContextWindowExceeded: 'model-context-window-exceeded-2025-08-26',

  // Message Batches (generally available but may still need header)
  /** Message Batches API for async processing at 50% cost. */
  messageBatches: 'message-batches-2024-09-24',

  // Token Counting (generally available)
  /** Token counting endpoint. */
  tokenCounting: 'token-counting-2024-11-01',

  // Skills
  /** Agent Skills for specialized tasks (PowerPoint, Excel, Word, PDF). */
  skills: 'skills-2025-10-02',
} as const;

/** Type representing any valid beta key from the betas object. */
export type BetaKey = keyof typeof betas;

/** Type representing a beta value (either a known constant or arbitrary string). */
export type BetaValue = (typeof betas)[BetaKey] | string;

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

  /**
   * Built-in tools for server-side execution.
   *
   * Use the tool helper constructors from the `tools` namespace:
   * - `tools.webSearch()` - Web search capability
   * - `tools.computer()` - Computer use (mouse, keyboard, screenshots)
   * - `tools.textEditor()` - File viewing and editing
   * - `tools.bash()` - Shell command execution
   * - `tools.codeExecution()` - Sandboxed Python/Bash execution
   * - `tools.toolSearch()` - Dynamic tool catalog search
   *
   * @example
   * ```typescript
   * import { anthropic, tools } from 'provider-protocol/anthropic';
   *
   * const model = llm({
   *   model: anthropic('claude-sonnet-4-20250514'),
   *   params: {
   *     tools: [
   *       tools.webSearch({ max_uses: 5 }),
   *       tools.codeExecution(),
   *     ],
   *   },
   * });
   * ```
   */
  tools?: AnthropicBuiltInTool[];

  /**
   * Container ID for code execution tool reuse.
   * Pass the container ID from a previous response to reuse the same environment.
   */
  container?: string;
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
/**
 * Native structured output format configuration.
 *
 * When provided, Claude's response will be constrained to match the
 * specified JSON schema. Requires the beta header `structured-outputs-2025-11-13`.
 *
 * @example
 * ```typescript
 * const outputFormat: AnthropicOutputFormat = {
 *   type: 'json_schema',
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       name: { type: 'string' },
 *       age: { type: 'integer' },
 *     },
 *     required: ['name', 'age'],
 *     additionalProperties: false,
 *   },
 * };
 * ```
 */
export interface AnthropicOutputFormat {
  /** Output format type - currently only 'json_schema' is supported. */
  type: 'json_schema';
  /** JSON Schema defining the expected response structure. */
  schema: {
    /** Schema type (always 'object' for structured outputs). */
    type: 'object';
    /** Property definitions for each field. */
    properties: Record<string, unknown>;
    /** List of required property names. */
    required?: string[];
    /** Must be false for structured outputs. */
    additionalProperties?: false;
  };
}

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
  /** Available tools for function calling and built-in tools. */
  tools?: (AnthropicTool | AnthropicBuiltInTool)[];
  /** Tool selection strategy. */
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  /** Request metadata for tracking. */
  metadata?: { user_id?: string };
  /** Extended thinking configuration. */
  thinking?: { type: 'enabled'; budget_tokens: number };
  /** Capacity tier selection. */
  service_tier?: 'auto' | 'standard_only';
  /**
   * Native structured output format.
   *
   * Constrains Claude's response to match the specified JSON schema.
   * Requires the beta header `structured-outputs-2025-11-13`.
   *
   * @see {@link AnthropicOutputFormat}
   */
  output_format?: AnthropicOutputFormat;
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
  | AnthropicDocumentContent
  | AnthropicToolUseContent
  | AnthropicToolResultContent
  | AnthropicThinkingContent;

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
 * Document content block for PDF and text document support.
 *
 * Documents can be provided as base64-encoded PDFs, PDF URLs, or plain text.
 *
 * @example
 * ```typescript
 * // Base64 PDF
 * const pdfContent: AnthropicDocumentContent = {
 *   type: 'document',
 *   source: {
 *     type: 'base64',
 *     media_type: 'application/pdf',
 *     data: 'JVBERi0xLjQK...',
 *   },
 * };
 *
 * // URL PDF
 * const urlContent: AnthropicDocumentContent = {
 *   type: 'document',
 *   source: {
 *     type: 'url',
 *     url: 'https://example.com/document.pdf',
 *   },
 * };
 *
 * // Plain text document
 * const textContent: AnthropicDocumentContent = {
 *   type: 'document',
 *   source: {
 *     type: 'text',
 *     media_type: 'text/plain',
 *     data: 'Document content here...',
 *   },
 * };
 * ```
 */
export interface AnthropicDocumentContent {
  /** Content type discriminator. */
  type: 'document';
  /** Document source configuration. */
  source:
    | {
        /** Base64-encoded document (PDF). */
        type: 'base64';
        /** MIME type ('application/pdf'). */
        media_type: string;
        /** Base64-encoded document data. */
        data: string;
      }
    | {
        /** URL to PDF document. */
        type: 'url';
        /** URL of the PDF. */
        url: string;
      }
    | {
        /** Plain text document. */
        type: 'text';
        /** MIME type ('text/plain'). */
        media_type: string;
        /** Plain text content. */
        data: string;
      };
  /** Cache control for prompt caching. */
  cache_control?: AnthropicCacheControl;
  /** Enable citations from document content. */
  citations?: { enabled: boolean };
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
 * Includes text, tool use, thinking blocks, and code execution results.
 */
export type AnthropicResponseContent =
  | AnthropicTextContent
  | AnthropicToolUseContent
  | AnthropicThinkingContent
  | AnthropicServerToolUseContent
  | AnthropicBashCodeExecutionToolResultContent
  | AnthropicTextEditorCodeExecutionToolResultContent;

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
 * Server tool use content block for built-in tools like code execution.
 *
 * Appears when Claude invokes a server-side tool.
 */
export interface AnthropicServerToolUseContent {
  /** Content type discriminator. */
  type: 'server_tool_use';
  /** Unique identifier for this tool invocation. */
  id: string;
  /** Name of the server tool being called (e.g., 'bash_code_execution', 'text_editor_code_execution'). */
  name: string;
  /** Arguments passed to the tool. */
  input: Record<string, unknown>;
}

/**
 * Result from bash code execution tool.
 *
 * Contains stdout, stderr, and return code from command execution.
 */
export interface AnthropicBashCodeExecutionToolResultContent {
  /** Content type discriminator. */
  type: 'bash_code_execution_tool_result';
  /** ID of the server_tool_use block this result corresponds to. */
  tool_use_id: string;
  /** The execution result. */
  content: {
    /** Result type discriminator. */
    type: 'bash_code_execution_result';
    /** Standard output from the command. */
    stdout: string;
    /** Standard error from the command. */
    stderr: string;
    /** Exit code (0 for success). */
    return_code: number;
    /** File IDs for any files created during execution. */
    content?: Array<{ file_id: string }>;
  } | {
    /** Error result type. */
    type: 'bash_code_execution_tool_result_error';
    /** Error code. */
    error_code: string;
  };
}

/**
 * Result from text editor code execution tool.
 *
 * Contains file operation results.
 */
export interface AnthropicTextEditorCodeExecutionToolResultContent {
  /** Content type discriminator. */
  type: 'text_editor_code_execution_tool_result';
  /** ID of the server_tool_use block this result corresponds to. */
  tool_use_id: string;
  /** The operation result. */
  content: {
    /** Result type discriminator. */
    type: 'text_editor_code_execution_result';
    /** File type (for view operations). */
    file_type?: string;
    /** File content (for view operations). */
    content?: string;
    /** Number of lines returned (for view operations). */
    numLines?: number;
    /** Starting line number (for view operations). */
    startLine?: number;
    /** Total lines in file (for view operations). */
    totalLines?: number;
    /** Whether this was a file update (for create operations). */
    is_file_update?: boolean;
    /** Old start line (for edit operations). */
    oldStart?: number;
    /** Old line count (for edit operations). */
    oldLines?: number;
    /** New start line (for edit operations). */
    newStart?: number;
    /** New line count (for edit operations). */
    newLines?: number;
    /** Diff lines (for edit operations). */
    lines?: string[];
  } | {
    /** Error result type. */
    type: 'text_editor_code_execution_tool_result_error';
    /** Error code. */
    error_code: string;
  };
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
   * - `computer-use-2025-01-24` - Computer use tool (Claude 4 models)
   * - `computer-use-2025-11-24` - Computer use tool (Claude Opus 4.5)
   * - `code-execution-2025-08-25` - Code execution tool
   * - `advanced-tool-use-2025-11-20` - Tool search tool
   */
  'anthropic-beta'?: string;
  [key: string]: string | undefined;
}

// ============================================
// Built-in Tools
// ============================================

/**
 * User location for web search context.
 *
 * Used to localize web search results based on the user's approximate location.
 */
export interface AnthropicUserLocation {
  /** Location type - must be 'approximate' */
  type: 'approximate';
  /** City name */
  city?: string;
  /** Region/state name */
  region?: string;
  /** ISO 3166-1 alpha-2 country code (e.g., "US") */
  country?: string;
  /** IANA timezone (e.g., "America/New_York") */
  timezone?: string;
}

/**
 * Web search tool for real-time web information retrieval.
 *
 * Enables Claude to search the web for up-to-date information.
 * No beta header required - this is a GA feature.
 *
 * @example
 * ```typescript
 * const tool: AnthropicWebSearchTool = {
 *   type: 'web_search_20250305',
 *   name: 'web_search',
 *   max_uses: 5,
 *   allowed_domains: ['wikipedia.org', 'github.com'],
 * };
 * ```
 */
export interface AnthropicWebSearchTool {
  /** Tool type identifier */
  type: 'web_search_20250305';
  /** Tool name - must be 'web_search' */
  name: 'web_search';
  /** Maximum searches per request (default: unlimited) */
  max_uses?: number;
  /** Whitelist domains (mutually exclusive with blocked_domains) */
  allowed_domains?: string[];
  /** Blacklist domains (mutually exclusive with allowed_domains) */
  blocked_domains?: string[];
  /** User location for localized results */
  user_location?: AnthropicUserLocation;
}

/**
 * Computer use tool for desktop automation.
 *
 * Enables Claude to interact with computer interfaces through
 * mouse clicks, keyboard input, and screenshots.
 *
 * Requires beta header:
 * - `computer-use-2025-11-24` for Claude Opus 4.5
 * - `computer-use-2025-01-24` for other Claude 4 models
 *
 * @example
 * ```typescript
 * const tool: AnthropicComputerTool = {
 *   type: 'computer_20250124',
 *   name: 'computer',
 *   display_width_px: 1920,
 *   display_height_px: 1080,
 * };
 * ```
 */
export interface AnthropicComputerTool {
  /** Tool type identifier (version-specific) */
  type: 'computer_20251124' | 'computer_20250124';
  /** Tool name - must be 'computer' */
  name: 'computer';
  /** Display width in pixels */
  display_width_px: number;
  /** Display height in pixels */
  display_height_px: number;
  /** X11 display number (optional) */
  display_number?: number;
  /** Enable zoom action (Opus 4.5 only with 20251124 version) */
  enable_zoom?: boolean;
}

/**
 * Text editor tool for file viewing and editing.
 *
 * Enables Claude to view, create, and edit files with
 * commands like view, str_replace, create, and insert.
 *
 * No beta header required.
 *
 * @example
 * ```typescript
 * const tool: AnthropicTextEditorTool = {
 *   type: 'text_editor_20250728',
 *   name: 'str_replace_based_edit_tool',
 *   max_characters: 10000,
 * };
 * ```
 */
export interface AnthropicTextEditorTool {
  /** Tool type identifier (version-specific) */
  type: 'text_editor_20250728' | 'text_editor_20250124';
  /** Tool name (version-specific) */
  name: 'str_replace_based_edit_tool' | 'str_replace_editor';
  /** Max characters for view truncation (20250728+ only) */
  max_characters?: number;
}

/**
 * Bash tool for shell command execution.
 *
 * Enables Claude to execute bash commands in a shell session.
 * The session persists within the conversation.
 *
 * No beta header required.
 *
 * @example
 * ```typescript
 * const tool: AnthropicBashTool = {
 *   type: 'bash_20250124',
 *   name: 'bash',
 * };
 * ```
 */
export interface AnthropicBashTool {
  /** Tool type identifier */
  type: 'bash_20250124';
  /** Tool name - must be 'bash' */
  name: 'bash';
}

/**
 * Code execution tool for sandboxed Python/Bash execution.
 *
 * Enables Claude to write and execute code in a secure container
 * with pre-installed data science libraries.
 *
 * Requires beta header: `code-execution-2025-08-25`
 *
 * @example
 * ```typescript
 * const tool: AnthropicCodeExecutionTool = {
 *   type: 'code_execution_20250825',
 *   name: 'code_execution',
 * };
 * ```
 */
export interface AnthropicCodeExecutionTool {
  /** Tool type identifier */
  type: 'code_execution_20250825';
  /** Tool name - must be 'code_execution' */
  name: 'code_execution';
}

/**
 * Tool search tool for dynamic tool discovery.
 *
 * Enables Claude to search through large tool catalogs
 * using regex or natural language (BM25) queries.
 *
 * Requires beta header: `advanced-tool-use-2025-11-20`
 *
 * @example
 * ```typescript
 * const tool: AnthropicToolSearchTool = {
 *   type: 'tool_search_tool_regex_20251119',
 *   name: 'tool_search_tool_regex',
 * };
 * ```
 */
export interface AnthropicToolSearchTool {
  /** Tool type identifier (regex or BM25 variant) */
  type: 'tool_search_tool_regex_20251119' | 'tool_search_tool_bm25_20251119';
  /** Tool name (must match type variant) */
  name: 'tool_search_tool_regex' | 'tool_search_tool_bm25';
}

/**
 * Union type for all Anthropic built-in tools.
 *
 * Built-in tools run server-side and have special handling
 * different from user-defined function tools.
 */
export type AnthropicBuiltInTool =
  | AnthropicWebSearchTool
  | AnthropicComputerTool
  | AnthropicTextEditorTool
  | AnthropicBashTool
  | AnthropicCodeExecutionTool
  | AnthropicToolSearchTool;

/**
 * Combined tool type for API requests (user-defined or built-in).
 */
export type AnthropicToolUnion = AnthropicTool | AnthropicBuiltInTool;

// ============================================
// Tool Helper Constructors
// ============================================

/**
 * Creates a web search tool configuration.
 *
 * The web search tool enables Claude to search the web for up-to-date information.
 * Pricing: $10 per 1,000 searches plus standard token costs.
 *
 * @param options - Optional configuration for search behavior
 * @returns A web search tool configuration object
 *
 * @example
 * ```typescript
 * // Basic web search
 * const search = webSearchTool();
 *
 * // With configuration
 * const searchWithOptions = webSearchTool({
 *   max_uses: 5,
 *   allowed_domains: ['wikipedia.org', 'github.com'],
 *   user_location: {
 *     type: 'approximate',
 *     city: 'San Francisco',
 *     country: 'US',
 *   },
 * });
 * ```
 */
export function webSearchTool(options?: {
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: AnthropicUserLocation;
}): AnthropicWebSearchTool {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    ...options,
  };
}

/**
 * Creates a computer use tool configuration.
 *
 * The computer tool enables Claude to interact with computer interfaces
 * through mouse clicks, keyboard input, and screenshots.
 *
 * Requires beta header (automatically injected when using this tool):
 * - `computer-use-2025-11-24` for Claude Opus 4.5
 * - `computer-use-2025-01-24` for other models
 *
 * @param options - Display configuration and optional settings
 * @returns A computer tool configuration object
 *
 * @example
 * ```typescript
 * const computer = computerTool({
 *   display_width_px: 1920,
 *   display_height_px: 1080,
 * });
 *
 * // For Opus 4.5 with zoom support
 * const computerOpus = computerTool({
 *   display_width_px: 1920,
 *   display_height_px: 1080,
 *   version: '20251124',
 *   enable_zoom: true,
 * });
 * ```
 */
export function computerTool(options: {
  display_width_px: number;
  display_height_px: number;
  display_number?: number;
  enable_zoom?: boolean;
  /** Use '20251124' for Claude Opus 4.5, '20250124' for other models */
  version?: '20251124' | '20250124';
}): AnthropicComputerTool {
  const { version = '20250124', ...rest } = options;
  return {
    type: version === '20251124' ? 'computer_20251124' : 'computer_20250124',
    name: 'computer',
    ...rest,
  };
}

/**
 * Creates a text editor tool configuration.
 *
 * The text editor tool enables Claude to view, create, and edit files
 * using commands like view, str_replace, create, and insert.
 *
 * Token overhead: ~700 tokens per tool definition.
 *
 * @param options - Optional configuration
 * @returns A text editor tool configuration object
 *
 * @example
 * ```typescript
 * const editor = textEditorTool();
 *
 * // With max characters for view truncation
 * const editorWithLimit = textEditorTool({
 *   max_characters: 10000,
 * });
 * ```
 */
export function textEditorTool(options?: {
  max_characters?: number;
  /** Use '20250728' for Claude 4, '20250124' for Claude 3.7 */
  version?: '20250728' | '20250124';
}): AnthropicTextEditorTool {
  const version = options?.version ?? '20250728';
  return {
    type: version === '20250728' ? 'text_editor_20250728' : 'text_editor_20250124',
    name: version === '20250728' ? 'str_replace_based_edit_tool' : 'str_replace_editor',
    ...(options?.max_characters !== undefined && { max_characters: options.max_characters }),
  };
}

/**
 * Creates a bash tool configuration.
 *
 * The bash tool enables Claude to execute shell commands.
 * Sessions persist within the conversation.
 *
 * Token overhead: ~245 tokens per tool definition.
 *
 * @returns A bash tool configuration object
 *
 * @example
 * ```typescript
 * const bash = bashTool();
 * ```
 */
export function bashTool(): AnthropicBashTool {
  return {
    type: 'bash_20250124',
    name: 'bash',
  };
}

/**
 * Creates a code execution tool configuration.
 *
 * The code execution tool enables Claude to write and execute
 * Python/Bash code in a secure sandboxed container.
 *
 * Requires beta header: `code-execution-2025-08-25` (automatically injected).
 *
 * Pricing:
 * - Free tier: 1,550 hours/month per organization
 * - Additional: $0.05 per hour, per container
 *
 * @returns A code execution tool configuration object
 *
 * @example
 * ```typescript
 * const codeExec = codeExecutionTool();
 * ```
 */
export function codeExecutionTool(): AnthropicCodeExecutionTool {
  return {
    type: 'code_execution_20250825',
    name: 'code_execution',
  };
}

/**
 * Creates a tool search tool configuration.
 *
 * The tool search tool enables Claude to search through large
 * tool catalogs (up to 10,000 tools) using regex or natural language.
 *
 * Requires beta header: `advanced-tool-use-2025-11-20` (automatically injected).
 *
 * @param options - Optional mode selection
 * @returns A tool search tool configuration object
 *
 * @example
 * ```typescript
 * // Regex-based search (default)
 * const search = toolSearchTool();
 *
 * // Natural language (BM25) search
 * const nlSearch = toolSearchTool({ mode: 'bm25' });
 * ```
 */
export function toolSearchTool(options?: {
  /** Search mode: 'regex' for pattern matching, 'bm25' for natural language */
  mode?: 'regex' | 'bm25';
}): AnthropicToolSearchTool {
  const mode = options?.mode ?? 'regex';
  return {
    type: mode === 'regex' ? 'tool_search_tool_regex_20251119' : 'tool_search_tool_bm25_20251119',
    name: mode === 'regex' ? 'tool_search_tool_regex' : 'tool_search_tool_bm25',
  };
}

/**
 * Namespace object containing all Anthropic tool helper constructors.
 *
 * Provides a convenient way to create built-in tool configurations.
 *
 * @example
 * ```typescript
 * import { anthropic, tools } from 'provider-protocol/anthropic';
 *
 * const model = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   params: {
 *     tools: [
 *       tools.webSearch({ max_uses: 5 }),
 *       tools.codeExecution(),
 *     ],
 *   },
 * });
 * ```
 */
export const tools = {
  /** Creates a web search tool configuration */
  webSearch: webSearchTool,
  /** Creates a computer use tool configuration */
  computer: computerTool,
  /** Creates a text editor tool configuration */
  textEditor: textEditorTool,
  /** Creates a bash tool configuration */
  bash: bashTool,
  /** Creates a code execution tool configuration */
  codeExecution: codeExecutionTool,
  /** Creates a tool search tool configuration */
  toolSearch: toolSearchTool,
};
