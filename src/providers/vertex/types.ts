/**
 * @fileoverview Google Vertex AI type definitions.
 *
 * Contains TypeScript interfaces for all Vertex AI endpoints:
 * - Gemini (native): Google's Generative AI models
 * - Claude (partner): Anthropic models via rawPredict
 * - Mistral (partner): Mistral models via rawPredict
 * - MaaS (OpenAI-compatible): DeepSeek, gpt-oss, etc.
 */

// ============================================
// Provider Options
// ============================================

/**
 * Vertex AI API endpoint types.
 *
 * Each endpoint has different request/response formats:
 * - `gemini`: Native Gemini API (generateContent)
 * - `claude`: Anthropic partner models (rawPredict)
 * - `mistral`: Mistral partner models (rawPredict)
 * - `maas`: OpenAI-compatible models (chat/completions)
 */
export type VertexEndpoint = 'gemini' | 'claude' | 'mistral' | 'maas';

/**
 * Configuration options for creating a Vertex AI model reference.
 */
export interface VertexProviderOptions {
  /**
   * Which Vertex AI endpoint to use.
   *
   * - `'gemini'`: Native Gemini models (default)
   * - `'claude'`: Anthropic Claude models via partner API
   * - `'mistral'`: Mistral models via partner API
   * - `'maas'`: DeepSeek, gpt-oss, and other OpenAI-compatible models
   */
  endpoint?: VertexEndpoint;

  /**
   * Google Cloud project ID.
   * Required for all Vertex AI requests.
   * Can also be set via GOOGLE_CLOUD_PROJECT env var.
   */
  projectId?: string;

  /**
   * Google Cloud region/location.
   * Defaults to 'us-central1'.
   * Use 'global' for dynamic routing (Claude only).
   */
  location?: string;
}

// ============================================
// Base Vertex Types
// ============================================

/**
 * Vertex AI authentication configuration.
 *
 * Vertex AI uses OAuth2 Bearer tokens from Google Cloud credentials.
 * The access token can be obtained via:
 * - `gcloud auth print-access-token`
 * - Google Cloud SDK client libraries
 * - Service account credentials
 */
export interface VertexAuthConfig {
  /**
   * OAuth2 access token for Vertex AI.
   * Passed as Bearer token in Authorization header.
   */
  accessToken: string;
}

// ============================================
// Gemini Endpoint Types
// ============================================

/**
 * Provider-specific parameters for Vertex AI Gemini models.
 *
 * These parameters are passed through to the generationConfig field.
 */
export interface VertexGeminiParams {
  /** Maximum number of tokens to generate */
  maxOutputTokens?: number;

  /** Temperature for randomness (0.0 - 2.0) */
  temperature?: number;

  /** Top-p (nucleus) sampling */
  topP?: number;

  /** Top-k sampling */
  topK?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** Number of candidates to generate */
  candidateCount?: number;

  /** Response MIME type */
  responseMimeType?: 'text/plain' | 'application/json';

  /** Response schema for structured output */
  responseSchema?: Record<string, unknown>;

  /** Presence penalty (-2.0 to 2.0) */
  presencePenalty?: number;

  /** Frequency penalty (-2.0 to 2.0) */
  frequencyPenalty?: number;

  /** Seed for deterministic sampling */
  seed?: number;

  /** Whether to return log probabilities */
  responseLogprobs?: boolean;

  /** Number of log probabilities to return */
  logprobs?: number;

  /** Thinking configuration for reasoning models */
  thinkingConfig?: VertexGeminiThinkingConfig;

  /**
   * Tool configuration for controlling function calling behavior.
   *
   * @example
   * ```typescript
   * const params: VertexGeminiParams = {
   *   toolConfig: {
   *     functionCallingConfig: {
   *       mode: 'ANY',
   *       allowedFunctionNames: ['getWeather', 'searchPlaces'],
   *     },
   *   },
   * };
   * ```
   */
  toolConfig?: VertexGeminiToolConfig;
}

/**
 * Thinking configuration for Gemini 2.5+ and 3.x models.
 */
export interface VertexGeminiThinkingConfig {
  /** Token budget for reasoning (up to 8192) */
  thinkingBudget?: number;
  /** Reasoning depth level */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

/**
 * Tool configuration for controlling function calling behavior.
 *
 * Controls how the model uses declared functions/tools during generation.
 */
export interface VertexGeminiToolConfig {
  /**
   * Configuration for function calling behavior.
   */
  functionCallingConfig?: {
    /**
     * Function calling mode:
     * - `'AUTO'`: Model decides when to call functions (default)
     * - `'ANY'`: Model must call at least one function
     * - `'NONE'`: Model cannot call any functions
     */
    mode?: 'AUTO' | 'ANY' | 'NONE';
    /**
     * Restrict which functions can be called.
     * Only applicable when mode is 'ANY'.
     */
    allowedFunctionNames?: string[];
  };
}

/**
 * Vertex AI Gemini request body.
 */
export interface VertexGeminiRequest {
  /** Conversation contents */
  contents: VertexGeminiContent[];
  /** System instruction */
  systemInstruction?: { parts: VertexGeminiPart[] };
  /** Generation configuration */
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    candidateCount?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    presencePenalty?: number;
    frequencyPenalty?: number;
    seed?: number;
    responseLogprobs?: boolean;
    logprobs?: number;
    thinkingConfig?: VertexGeminiThinkingConfig;
  };
  /** Tools for function calling */
  tools?: VertexGeminiTool[];
  /** Safety settings */
  safetySettings?: VertexGeminiSafetySetting[];
  /** Cached content reference */
  cachedContent?: string;
  /** Tool configuration for function calling behavior */
  toolConfig?: VertexGeminiToolConfig;
}

/**
 * Content turn in Gemini format.
 */
export interface VertexGeminiContent {
  role: 'user' | 'model';
  parts: VertexGeminiPart[];
}

/**
 * Content part types.
 */
export type VertexGeminiPart =
  | VertexGeminiTextPart
  | VertexGeminiImagePart
  | VertexGeminiFunctionCallPart
  | VertexGeminiFunctionResponsePart;

export interface VertexGeminiTextPart {
  text: string;
}

export interface VertexGeminiImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface VertexGeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
  /** Thought signature for Gemini 3+ models to maintain context across multi-turn tool calls. */
  thoughtSignature?: string;
}

export interface VertexGeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface VertexGeminiTool {
  functionDeclarations: VertexGeminiFunctionDeclaration[];
}

export interface VertexGeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface VertexGeminiSafetySetting {
  category: string;
  threshold: string;
}

/**
 * Vertex AI Gemini response.
 */
export interface VertexGeminiResponse {
  candidates: VertexGeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
  };
}

export interface VertexGeminiCandidate {
  content: {
    role: 'model';
    parts: VertexGeminiResponsePart[];
  };
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | 'TOOL_USE' | null;
  index: number;
  safetyRatings?: VertexGeminiSafetyRating[];
}

export type VertexGeminiResponsePart =
  | VertexGeminiTextPart
  | VertexGeminiFunctionCallPart;

export interface VertexGeminiSafetyRating {
  category: string;
  probability: string;
}

/**
 * Streaming chunk from Gemini.
 */
export interface VertexGeminiStreamChunk {
  candidates?: VertexGeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
  };
}

// ============================================
// Claude Endpoint Types
// ============================================

/**
 * Provider-specific parameters for Vertex AI Claude models.
 *
 * Note: The `model` field is NOT included - it's in the URL path.
 * The `anthropic_version` is set automatically to "vertex-2023-10-16".
 */
export interface VertexClaudeParams {
  /** Maximum number of tokens to generate (required) */
  max_tokens: number;

  /** Temperature (0.0 - 1.0) */
  temperature?: number;

  /** Top-p sampling */
  top_p?: number;

  /** Top-k sampling */
  top_k?: number;

  /** Stop sequences */
  stop_sequences?: string[];

  /** Extended thinking configuration */
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };

  /** Service tier selection */
  service_tier?: 'auto' | 'standard_only';

  /** Request metadata */
  metadata?: {
    user_id?: string;
  };
}

/**
 * Vertex AI Claude request body.
 */
export interface VertexClaudeRequest {
  /** Must be "vertex-2023-10-16" */
  anthropic_version: 'vertex-2023-10-16';
  /** Conversation messages */
  messages: VertexClaudeMessage[];
  /** Maximum tokens to generate */
  max_tokens: number;
  /** Enable streaming */
  stream?: boolean;
  /** System prompt */
  system?: string | VertexClaudeSystemContent[];
  /** Temperature */
  temperature?: number;
  /** Top-p */
  top_p?: number;
  /** Top-k */
  top_k?: number;
  /** Stop sequences */
  stop_sequences?: string[];
  /** Tools for function calling */
  tools?: VertexClaudeTool[];
  /** Tool choice */
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  /** Extended thinking */
  thinking?: { type: 'enabled'; budget_tokens: number };
  /** Metadata */
  metadata?: { user_id?: string };
  /** Service tier */
  service_tier?: 'auto' | 'standard_only';
}

export interface VertexClaudeSystemContent {
  type: 'text';
  text: string;
}

export interface VertexClaudeMessage {
  role: 'user' | 'assistant';
  content: VertexClaudeContent[] | string;
}

export type VertexClaudeContent =
  | VertexClaudeTextContent
  | VertexClaudeImageContent
  | VertexClaudeToolUseContent
  | VertexClaudeToolResultContent;

export interface VertexClaudeTextContent {
  type: 'text';
  text: string;
}

export interface VertexClaudeImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface VertexClaudeToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface VertexClaudeToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | VertexClaudeContent[];
  is_error?: boolean;
}

export interface VertexClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Vertex AI Claude response.
 */
export interface VertexClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: VertexClaudeResponseContent[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type VertexClaudeResponseContent =
  | VertexClaudeTextContent
  | VertexClaudeToolUseContent
  | VertexClaudeThinkingContent;

export interface VertexClaudeThinkingContent {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

/**
 * Claude streaming events.
 */
export type VertexClaudeStreamEvent =
  | VertexClaudeMessageStartEvent
  | VertexClaudeContentBlockStartEvent
  | VertexClaudeContentBlockDeltaEvent
  | VertexClaudeContentBlockStopEvent
  | VertexClaudeMessageDeltaEvent
  | VertexClaudeMessageStopEvent
  | VertexClaudePingEvent
  | VertexClaudeErrorEvent;

export interface VertexClaudeMessageStartEvent {
  type: 'message_start';
  message: VertexClaudeResponse;
}

export interface VertexClaudeContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: VertexClaudeResponseContent;
}

export interface VertexClaudeContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'signature_delta'; signature: string }
    | { type: 'input_json_delta'; partial_json: string };
}

export interface VertexClaudeContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface VertexClaudeMessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: string | null;
    stop_sequence: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

export interface VertexClaudeMessageStopEvent {
  type: 'message_stop';
}

export interface VertexClaudePingEvent {
  type: 'ping';
}

export interface VertexClaudeErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// ============================================
// Mistral Endpoint Types
// ============================================

/**
 * Provider-specific parameters for Vertex AI Mistral models.
 *
 * Uses OpenAI-compatible format via rawPredict.
 */
export interface VertexMistralParams {
  /** Maximum tokens to generate */
  max_tokens?: number;

  /** Temperature (0 - 2) */
  temperature?: number;

  /** Top-p sampling */
  top_p?: number;

  /** Stop sequences */
  stop?: string[];

  /** Random seed for reproducibility */
  random_seed?: number;

  /** Enable streaming */
  stream?: boolean;

  /** Response format for JSON mode */
  response_format?: { type: 'json_object' };

  /** Enable parallel tool calls */
  parallel_tool_calls?: boolean;

  /** Safe prompt additions */
  safe_prompt?: boolean;
}

/**
 * Vertex AI Mistral request body.
 */
export interface VertexMistralRequest {
  /** Model identifier */
  model: string;
  /** Conversation messages */
  messages: VertexMistralMessage[];
  /** Maximum tokens */
  max_tokens?: number;
  /** Temperature */
  temperature?: number;
  /** Top-p */
  top_p?: number;
  /** Enable streaming */
  stream?: boolean;
  /** Stop sequences */
  stop?: string[];
  /** Random seed */
  random_seed?: number;
  /** Response format */
  response_format?: { type: 'json_object' };
  /** Tools for function calling */
  tools?: VertexMistralTool[];
  /** Tool choice */
  tool_choice?: 'auto' | 'any' | 'none' | { type: 'function'; function: { name: string } };
  /** Parallel tool calls */
  parallel_tool_calls?: boolean;
  /** Safe prompt */
  safe_prompt?: boolean;
}

export interface VertexMistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | VertexMistralContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: VertexMistralToolCall[];
}

export type VertexMistralContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string };

export interface VertexMistralTool {
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

export interface VertexMistralToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Vertex AI Mistral response.
 */
export interface VertexMistralResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: VertexMistralChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface VertexMistralChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: VertexMistralToolCall[];
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

/**
 * Mistral streaming chunk.
 */
export interface VertexMistralStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  model: string;
  choices: VertexMistralStreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface VertexMistralStreamChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

// ============================================
// MaaS Endpoint Types (DeepSeek, gpt-oss, etc.)
// ============================================

/**
 * Provider-specific parameters for Vertex AI MaaS models.
 *
 * OpenAI-compatible format for DeepSeek, gpt-oss-120b, etc.
 */
export interface VertexMaaSParams {
  /** Maximum tokens to generate */
  max_tokens?: number;

  /** Temperature (0 - 2) */
  temperature?: number;

  /** Top-p sampling */
  top_p?: number;

  /** Frequency penalty (-2 to 2) */
  frequency_penalty?: number;

  /** Presence penalty (-2 to 2) */
  presence_penalty?: number;

  /** Stop sequences (up to 16) */
  stop?: string[];

  /** Enable streaming */
  stream?: boolean;

  /** Response format for JSON mode */
  response_format?: { type: 'json_object' };

  /** Enable thinking mode (DeepSeek R1) */
  thinking?: { type: 'enabled' };
}

/**
 * Vertex AI MaaS request body.
 */
export interface VertexMaaSRequest {
  /** Model identifier (e.g., "deepseek-ai/deepseek-r1-0528-maas") */
  model: string;
  /** Conversation messages */
  messages: VertexMaaSMessage[];
  /** Maximum tokens */
  max_tokens?: number;
  /** Temperature */
  temperature?: number;
  /** Top-p */
  top_p?: number;
  /** Frequency penalty */
  frequency_penalty?: number;
  /** Presence penalty */
  presence_penalty?: number;
  /** Enable streaming */
  stream?: boolean;
  /** Stop sequences */
  stop?: string[];
  /** Response format */
  response_format?: { type: 'json_object' };
  /** Tools for function calling */
  tools?: VertexMaaSTool[];
  /** Tool choice */
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  /** Thinking mode (DeepSeek) */
  thinking?: { type: 'enabled' };
  /** Stream options */
  stream_options?: { include_usage?: boolean };
}

export interface VertexMaaSMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: VertexMaaSToolCall[];
}

export interface VertexMaaSTool {
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

export interface VertexMaaSToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Vertex AI MaaS response.
 */
export interface VertexMaaSResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: VertexMaaSChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface VertexMaaSChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: VertexMaaSToolCall[];
    reasoning_content?: string;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

/**
 * MaaS streaming chunk.
 */
export interface VertexMaaSStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  model: string;
  choices: VertexMaaSStreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface VertexMaaSStreamChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
    reasoning_content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

// ============================================
// Vertex Headers
// ============================================

/**
 * Vertex AI-specific HTTP headers.
 */
export interface VertexHeaders {
  /** Custom API client identifier */
  'x-goog-api-client'?: string;
  /** Quota project ID */
  'x-goog-user-project'?: string;
  [key: string]: string | undefined;
}
