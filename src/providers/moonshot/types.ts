/**
 * @fileoverview Moonshot AI Provider Type Definitions
 *
 * This module contains all TypeScript type definitions for the Moonshot provider,
 * including types for the Chat Completions API (OpenAI-compatible).
 *
 * @module providers/moonshot/types
 */

/**
 * Thinking mode configuration for Moonshot models.
 *
 * By default, kimi-k2.5 has thinking mode enabled and returns reasoning traces.
 * Use `{ type: 'disabled' }` to switch to instant mode for faster responses.
 */
export interface MoonshotThinkingConfig {
  /** Thinking mode type: 'enabled' (default) or 'disabled' for instant mode */
  type: 'enabled' | 'disabled';
}

/**
 * Parameters for the Moonshot Chat Completions API.
 *
 * These parameters are passed directly to the `/v1/chat/completions` endpoint.
 * Moonshot's API is OpenAI-compatible with additional thinking mode support.
 *
 * @example
 * ```typescript
 * const params: MoonshotLLMParams = {
 *   temperature: 1.0,
 *   max_tokens: 1000,
 *   thinking: { type: 'enabled' }  // Default for kimi-k2.5
 * };
 * ```
 */
export interface MoonshotLLMParams {
  /** Maximum number of tokens to generate */
  max_tokens?: number;

  /** Maximum completion tokens (alias for max_tokens) */
  max_completion_tokens?: number;

  /** Temperature for randomness (0.0 to 2.0). Default: 1.0 (thinking) or 0.6 (instant) */
  temperature?: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0), default 0.95 */
  top_p?: number;

  /** Custom stop sequences */
  stop?: string | string[];

  /** Frequency penalty (-2.0 - 2.0) */
  frequency_penalty?: number;

  /** Presence penalty (-2.0 - 2.0) */
  presence_penalty?: number;

  /** Seed for deterministic sampling */
  seed?: number;

  /** User identifier for rate limit tracking */
  user?: string;

  /** Response format for structured output */
  response_format?: MoonshotResponseFormat;

  /** Thinking mode configuration (kimi-k2.5 specific) */
  thinking?: MoonshotThinkingConfig;

  /**
   * Builtin tools to enable for this request.
   * Use the `tools` helper object to create these.
   *
   * @example
   * ```typescript
   * import { moonshot, tools } from '@providerprotocol/ai/moonshot';
   *
   * const model = llm({
   *   model: moonshot('kimi-k2.5'),
   *   params: {
   *     tools: [tools.webSearch(), tools.codeRunner()],
   *   },
   * });
   * ```
   */
  tools?: MoonshotTool[];
}

/**
 * Response format options for structured output.
 */
export type MoonshotResponseFormat =
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
 * Request body for the Moonshot Chat Completions API.
 */
export interface MoonshotRequest {
  model: string;
  messages: MoonshotMessage[];
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
  tools?: MoonshotTool[];
  tool_choice?: MoonshotToolChoice;
  response_format?: MoonshotResponseFormat;
  thinking?: MoonshotThinkingConfig;
}

/**
 * Union type for all message types in the Moonshot API.
 */
export type MoonshotMessage =
  | MoonshotSystemMessage
  | MoonshotUserMessage
  | MoonshotAssistantMessage
  | MoonshotToolMessage;

/** System message for setting context and instructions */
export interface MoonshotSystemMessage {
  role: 'system';
  content: string;
}

/** User message with text or multimodal content */
export interface MoonshotUserMessage {
  role: 'user';
  content: string | MoonshotUserContent[];
}

/** Assistant message containing the model's response */
export interface MoonshotAssistantMessage {
  role: 'assistant';
  content?: string | null;
  /** Reasoning traces from thinking mode */
  reasoning_content?: string | null;
  tool_calls?: MoonshotToolCall[];
}

/** Tool result message providing output from a function call */
export interface MoonshotToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * Union type for user content parts (text, image, or video).
 */
export type MoonshotUserContent = MoonshotTextContent | MoonshotImageContent | MoonshotVideoContent;

/** Text content part */
export interface MoonshotTextContent {
  type: 'text';
  text: string;
}

/** Image content part with URL reference (for vision models) */
export interface MoonshotImageContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

/** Video content part with URL reference (experimental) */
export interface MoonshotVideoContent {
  type: 'video_url';
  video_url: {
    url: string;
  };
}

/**
 * Tool call structure in assistant messages.
 */
export interface MoonshotToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool definition for the Moonshot API.
 * Used for both custom function tools and server-side builtin tools.
 */
export interface MoonshotTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type?: 'object';
      description?: string;
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
    strict?: boolean;
  };
}

/**
 * Tool choice options for controlling function calling behavior.
 * Moonshot models support full tool_choice including 'required'.
 */
export type MoonshotToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

// ============================================
// Server-Side Tool Factory Functions
// ============================================
// These tools are executed by Moonshot's servers, not by the client.
// The model decides when to call them and the API handles execution.
//
// TODO: Implement `excel` plugin - uses `_plugin` format with multiple
// sub-functions (read_file, list_sheets, describe, inspect, pipe, groupby,
// orderby, filter, head, value_counts, correlation, sample, select, count,
// sum, distinct, add_column). Requires file IDs from Moonshot's /v1/files API.

/**
 * Options for web search tool.
 */
export interface MoonshotWebSearchOptions {
  /** Search domains to focus on */
  classes?: Array<'all' | 'academic' | 'social' | 'library' | 'finance' | 'code' | 'ecommerce' | 'medical'>;
}

/**
 * Creates a web search tool (server-side execution).
 * Enables real-time internet search capabilities.
 *
 * Note: Web search is charged separately from regular API usage.
 *
 * @example
 * ```typescript
 * import { moonshot, tools } from '@providerprotocol/ai/moonshot';
 *
 * const model = llm({
 *   model: moonshot('kimi-k2.5'),
 *   params: {
 *     tools: [tools.webSearch()],
 *   },
 * });
 * ```
 */
export function webSearch(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            description: 'What to search for',
            type: 'string',
          },
          classes: {
            description: 'Search domains to focus on. Defaults to "all" if not specified.',
            type: 'array',
            items: {
              type: 'string',
              enum: ['all', 'academic', 'social', 'library', 'finance', 'code', 'ecommerce', 'medical'],
            },
          },
        },
        required: ['query'],
      },
    },
  };
}

/**
 * Creates a Python code runner tool (server-side execution).
 * Allows execution of Python code for calculations and data processing.
 * Supports print output, matplotlib plots, pandas, and file reading via ctx.read_object().
 */
export function codeRunner(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'code_runner',
      description: 'Safely executes Python code and returns the result, with print output, last-line evaluation, error handling, and timeout protection.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            description: 'The Python code to execute. Supports print(), matplotlib, pandas, and ctx.read_object() for file reading.',
            type: 'string',
          },
        },
        required: ['code'],
      },
    },
  };
}

/**
 * Creates a QuickJS JavaScript execution tool (server-side execution).
 * Enables secure JavaScript code execution via the QuickJS engine.
 */
export function quickjs(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'quickjs',
      description: 'Safely executes JavaScript code using QuickJS engine',
      parameters: {
        type: 'object',
        properties: {
          code: {
            description: 'The JavaScript code to execute. Supports console.log(), ES6+ features, and ctx.log() for logging.',
            type: 'string',
          },
        },
        required: ['code'],
      },
    },
  };
}

/**
 * Creates a URL fetch tool (server-side execution).
 * Extracts content from URLs and formats it as Markdown.
 */
export function fetch(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'fetch',
      description: 'Fetches a URL from the internet and optionally extracts its contents as markdown.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            description: 'URL to fetch',
            type: 'string',
            format: 'uri',
          },
          max_length: {
            description: 'Maximum number of characters to return (default: 5000)',
            type: 'integer',
            default: 5000,
          },
          start_index: {
            description: 'Start at this character index, useful for pagination',
            type: 'integer',
            default: 0,
          },
          raw: {
            description: 'Get raw HTML without simplification',
            type: 'boolean',
            default: false,
          },
        },
        required: ['url'],
      },
    },
  };
}

/**
 * Creates a unit conversion tool (server-side execution).
 * Supports length, mass, volume, temperature, area, time, energy,
 * pressure, speed, and currency conversions.
 */
export function convert(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'convert',
      description: 'Convert between supported units of length, mass, volume, temperature, area, time, energy, pressure, speed, and currency.',
      parameters: {
        type: 'object',
        properties: {
          value: {
            description: 'Value to convert',
            type: 'number',
          },
          from_unit: {
            description: 'Source unit (e.g., m, km, ft, kg, lb, °C, °F, USD, EUR)',
            type: 'string',
          },
          to_unit: {
            description: 'Target unit',
            type: 'string',
          },
        },
        required: ['value', 'from_unit', 'to_unit'],
      },
    },
  };
}

/**
 * Creates a date/time processing tool (server-side execution).
 * Handles date and time calculations, timezone conversion, and formatting.
 */
export function date(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'date',
      description: 'Date and time processing tool, supports displaying current time, timezone conversion, date calculation, and more.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            description: 'Operation type',
            type: 'string',
            enum: ['time', 'convert', 'between', 'add', 'subtract'],
          },
          date: {
            description: 'Date string (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)',
            type: 'string',
          },
          date1: {
            description: 'First date (for difference calculation)',
            type: 'string',
          },
          date2: {
            description: 'Second date (for difference calculation)',
            type: 'string',
          },
          days: {
            description: 'Number of days (for add/subtract)',
            type: 'integer',
          },
          zone: {
            description: 'Timezone name (e.g., Asia/Shanghai, America/New_York, UTC)',
            type: 'string',
          },
          from_zone: {
            description: 'Source timezone (for conversion)',
            type: 'string',
          },
          to_zone: {
            description: 'Target timezone (for conversion)',
            type: 'string',
          },
          format: {
            description: 'Output format (Python strftime)',
            type: 'string',
            default: '%Y-%m-%d %H:%M:%S',
          },
        },
        required: ['operation'],
      },
    },
  };
}

/**
 * Creates a Base64 encoding tool (server-side execution).
 */
export function base64Encode(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'base64_encode',
      description: 'Encode text to base64 format',
      parameters: {
        type: 'object',
        properties: {
          data: {
            description: 'Text data to encode to base64',
            type: 'string',
          },
          encoding: {
            description: 'Character encoding to use (default: utf-8)',
            type: 'string',
            default: 'utf-8',
          },
        },
        required: ['data'],
      },
    },
  };
}

/**
 * Creates a Base64 decoding tool (server-side execution).
 */
export function base64Decode(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'base64_decode',
      description: 'Decode base64 text to original format',
      parameters: {
        type: 'object',
        properties: {
          data: {
            description: 'Base64 encoded data to decode',
            type: 'string',
          },
          encoding: {
            description: 'Character encoding to use (default: utf-8)',
            type: 'string',
            default: 'utf-8',
          },
        },
        required: ['data'],
      },
    },
  };
}

/**
 * Creates a memory storage tool (server-side execution).
 * Supports persistent storage of conversation history and user preferences.
 */
export function memory(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'memory',
      description: 'Memory storage and retrieval system, supporting persistence of conversation history, user preferences, and other data.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            description: 'Operation type',
            type: 'string',
            enum: ['store', 'retrieve', 'delete', 'list'],
          },
          key: {
            description: 'Storage key name',
            type: 'string',
          },
          data: {
            description: 'Data content to store',
            type: 'object',
          },
          prefix: {
            description: 'Key prefix for list operation',
            type: 'string',
          },
          ttl: {
            description: 'Data expiration time in seconds (default: 86400 = 24 hours)',
            type: 'integer',
            default: 86400,
          },
        },
        required: ['action'],
      },
    },
  };
}

/**
 * Creates an intelligent reasoning tool (server-side execution).
 * Allows the model to organize thoughts and plan before responding.
 */
export function rethink(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'rethink',
      description: 'Tool for organizing thoughts, making plans, and thinking step by step. Does not return information, just for reflection.',
      parameters: {
        type: 'object',
        properties: {
          thought: {
            description: 'The thought to consider for better solving the current task',
            type: 'string',
          },
        },
        required: ['thought'],
      },
    },
  };
}

/**
 * Creates a random choice tool (server-side execution).
 * Enables random selection from options with optional weights.
 */
export function randomChoice(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'random_choice',
      description: 'Random selection tool that supports choosing items from candidates with optional weights.',
      parameters: {
        type: 'object',
        properties: {
          candidates: {
            description: 'List of candidates to choose from',
            type: 'array',
            items: { type: 'string' },
          },
          count: {
            description: 'Number of items to select (default: 1)',
            type: 'integer',
            default: 1,
          },
          replace: {
            description: 'Allow duplicates (default: false)',
            type: 'boolean',
            default: false,
          },
          weights: {
            description: 'Optional weights for weighted selection',
            type: 'array',
            items: { type: 'number' },
          },
          seed: {
            description: 'Random seed for reproducibility',
            type: 'integer',
          },
          format: {
            description: 'Output format',
            type: 'string',
            enum: ['simple', 'detailed', 'json'],
            default: 'simple',
          },
        },
        required: ['candidates'],
      },
    },
  };
}

/**
 * Creates a cat meowing/blessing tool (server-side execution).
 * Returns random cat meowing sounds and blessings based on mood.
 */
export function mew(): MoonshotTool {
  return {
    type: 'function',
    function: {
      name: 'mew_generator',
      description: "Randomly generates a cat's meow, accompanied by a blessing.",
      parameters: {
        type: 'object',
        properties: {
          mood: {
            description: "The cat's mood",
            type: 'string',
            enum: ['happy', 'sleepy', 'hungry', 'playful', 'grumpy'],
          },
        },
        required: [],
      },
    },
  };
}


/**
 * Moonshot builtin tools factory object.
 * Provides convenient access to all builtin tool creators.
 *
 * Note: The `excel` plugin tool uses a different format and is not included here.
 * It requires file IDs from the Moonshot file upload API.
 *
 * @example
 * ```typescript
 * import { moonshot, tools } from '@providerprotocol/ai/moonshot';
 *
 * const model = llm({
 *   model: moonshot('kimi-k2.5'),
 *   params: {
 *     tools: [
 *       tools.webSearch(),
 *       tools.codeRunner(),
 *       tools.fetch(),
 *     ],
 *   },
 * });
 * ```
 */
export const tools = {
  /** Web search for real-time internet information */
  webSearch,
  /** Python code execution with matplotlib, pandas support */
  codeRunner,
  /** JavaScript execution via QuickJS engine */
  quickjs,
  /** URL content fetching with markdown extraction */
  fetch,
  /** Unit conversion (length, mass, temperature, currency, etc.) */
  convert,
  /** Date/time processing and timezone conversion */
  date,
  /** Base64 encoding */
  base64Encode,
  /** Base64 decoding */
  base64Decode,
  /** Alias for base64Encode */
  base64: base64Encode,
  /** Memory storage and retrieval system */
  memory,
  /** Intelligent reasoning/reflection tool */
  rethink,
  /** Random selection with optional weights */
  randomChoice,
  /** Cat meowing and blessings generator */
  mew,
};

/**
 * Response structure from the Moonshot Chat Completions API.
 */
export interface MoonshotResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: MoonshotChoice[];
  usage: MoonshotUsage;
  system_fingerprint?: string;
}

/** A single choice from a completion response */
export interface MoonshotChoice {
  index: number;
  message: MoonshotAssistantMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/** Token usage statistics from the API response */
export interface MoonshotUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

/**
 * Streaming chunk structure from the Moonshot API.
 */
export interface MoonshotStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: MoonshotStreamChoice[];
  usage?: MoonshotUsage | null;
  system_fingerprint?: string;
}

/** A streaming choice containing incremental content */
export interface MoonshotStreamChoice {
  index: number;
  delta: MoonshotStreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/** Incremental content delta in a streaming chunk */
export interface MoonshotStreamDelta {
  role?: 'assistant';
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: MoonshotStreamToolCall[];
}

/** Incremental tool call data in a streaming chunk */
export interface MoonshotStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Moonshot-specific HTTP headers for API requests.
 *
 * @example
 * ```typescript
 * const headers: MoonshotHeaders = {
 *   'X-Request-Id': 'my-request-id',
 * };
 * ```
 */
export interface MoonshotHeaders {
  /** Client-generated request ID for tracing */
  'X-Request-Id'?: string;
  [key: string]: string | undefined;
}
