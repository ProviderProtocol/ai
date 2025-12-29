/**
 * OpenAI Responses API types
 * https://platform.openai.com/docs/api-reference/responses
 */

/**
 * OpenAI Responses API request body
 */
export interface OpenAIResponsesRequest {
  /** Model ID */
  model: string;

  /** Input - string or array of input items */
  input: string | OpenAIResponsesInputItem[];

  /** System/developer instructions (replaces system message) */
  instructions?: string;

  /** Maximum number of output tokens */
  max_output_tokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling */
  top_p?: number;

  /** Stop sequences */
  stop?: string | string[];

  /** Seed for deterministic outputs */
  seed?: number;

  /** Tools available to the model */
  tools?: OpenAIResponsesTool[];

  /** Tool choice configuration */
  tool_choice?: 'auto' | 'required' | 'none' | { type: 'function'; name: string };

  /** Enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Previous response ID for conversation state */
  previous_response_id?: string;

  /** Enable streaming */
  stream?: boolean;

  /** Store the response server-side */
  store?: boolean;

  /** Custom metadata */
  metadata?: Record<string, string>;

  /** User identifier for abuse monitoring */
  user?: string;

  /** Items to include in response */
  include?: string[];
}

/**
 * Input item types for Responses API
 */
export type OpenAIResponsesInputItem =
  | OpenAIResponsesInputMessage
  | OpenAIResponsesFunctionCallOutput;

/**
 * Message input item
 */
export interface OpenAIResponsesInputMessage {
  type?: 'message';
  role: 'user' | 'assistant' | 'system';
  content: string | OpenAIResponsesInputContent[];
}

/**
 * Function call output item (tool result)
 */
export interface OpenAIResponsesFunctionCallOutput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/**
 * Input content types
 */
export type OpenAIResponsesInputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; file_id?: string; filename?: string; file_data?: string };

/**
 * Tool definition for Responses API (flattened structure)
 */
export interface OpenAIResponsesTool {
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
 * Responses API response format
 */
export interface OpenAIResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  model: string;
  status: 'completed' | 'failed' | 'in_progress' | 'incomplete';
  error?: {
    code: string;
    message: string;
  };
  output: OpenAIResponsesOutputItem[];
  output_text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    output_tokens_details?: {
      reasoning_tokens: number;
    };
  };
  incomplete_details?: {
    reason: string;
  };
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  previous_response_id?: string;
  metadata?: Record<string, string>;
}

/**
 * Output item types
 */
export type OpenAIResponsesOutputItem =
  | OpenAIResponsesOutputMessage
  | OpenAIResponsesFunctionCall;

/**
 * Message output item
 */
export interface OpenAIResponsesOutputMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  status: 'completed' | 'in_progress';
  content: OpenAIResponsesOutputContent[];
}

/**
 * Output content types
 */
export type OpenAIResponsesOutputContent =
  | { type: 'output_text'; text: string; annotations?: unknown[] }
  | { type: 'refusal'; refusal: string };

/**
 * Function call output item
 */
export interface OpenAIResponsesFunctionCall {
  id: string;
  type: 'function_call';
  name: string;
  call_id: string;
  arguments: string;
  status: 'completed' | 'in_progress';
}

/**
 * Streaming event types for Responses API
 */
export type OpenAIResponsesStreamEvent =
  | OpenAIResponsesCreatedEvent
  | OpenAIResponsesOutputItemAddedEvent
  | OpenAIResponsesOutputItemDoneEvent
  | OpenAIResponsesOutputTextDeltaEvent
  | OpenAIResponsesOutputTextDoneEvent
  | OpenAIResponsesFunctionCallArgumentsDeltaEvent
  | OpenAIResponsesFunctionCallArgumentsDoneEvent
  | OpenAIResponsesCompletedEvent
  | OpenAIResponsesErrorEvent;

export interface OpenAIResponsesCreatedEvent {
  type: 'response.created';
  response: Partial<OpenAIResponsesResponse>;
}

export interface OpenAIResponsesOutputItemAddedEvent {
  type: 'response.output_item.added';
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponsesOutputItemDoneEvent {
  type: 'response.output_item.done';
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponsesOutputTextDeltaEvent {
  type: 'response.output_text.delta';
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenAIResponsesOutputTextDoneEvent {
  type: 'response.output_text.done';
  output_index: number;
  content_index: number;
  text: string;
}

export interface OpenAIResponsesFunctionCallArgumentsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  output_index: number;
  call_id: string;
  delta: string;
}

export interface OpenAIResponsesFunctionCallArgumentsDoneEvent {
  type: 'response.function_call_arguments.done';
  output_index: number;
  call_id: string;
  arguments: string;
}

export interface OpenAIResponsesCompletedEvent {
  type: 'response.completed';
  response: OpenAIResponsesResponse;
}

export interface OpenAIResponsesErrorEvent {
  type: 'error';
  error: {
    code: string;
    message: string;
  };
}
