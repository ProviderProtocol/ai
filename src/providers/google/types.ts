/**
 * Provider-specific parameters for Google Gemini API requests.
 *
 * These parameters are passed through to the Google `generationConfig` field
 * and control model behavior such as output length, randomness, and sampling
 * strategies. All fields are optional and will use Google's defaults if omitted.
 *
 * @example
 * ```typescript
 * const params: GoogleLLMParams = {
 *   maxOutputTokens: 2048,
 *   temperature: 0.7,
 *   topP: 0.9,
 *   stopSequences: ['\n\n'],
 * };
 *
 * const response = await model.complete({
 *   messages: [...],
 *   config: { apiKey: '...' },
 *   params,
 * });
 * ```
 *
 * @see {@link https://ai.google.dev/api/rest/v1beta/GenerationConfig Google GenerationConfig docs}
 */
export interface GoogleLLMParams {
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

  /**
   * Presence penalty for new topics
   * Positive values encourage discussing new topics
   */
  presencePenalty?: number;

  /**
   * Frequency penalty for repeated tokens
   * Positive values discourage repetition
   */
  frequencyPenalty?: number;

  /**
   * Seed for deterministic sampling
   * Same seed with same parameters should produce same results
   */
  seed?: number;

  /**
   * Whether to return log probabilities in response
   */
  responseLogprobs?: boolean;

  /**
   * Number of log probabilities to return (requires responseLogprobs: true)
   */
  logprobs?: number;

  /**
   * Whether to include audio timestamps in response
   */
  audioTimestamp?: boolean;

  /**
   * Thinking/reasoning configuration for Gemini 3+ models
   */
  thinkingConfig?: GoogleThinkingConfig;

  /**
   * Cached content name to use for this request.
   * Format: "cachedContents/{id}" as returned from cache creation.
   * When set, the cached content is prepended to the request.
   */
  cachedContent?: string;

  /**
   * Built-in tools for server-side execution.
   *
   * Use the tool helper constructors from the `tools` namespace:
   * - `tools.googleSearch()` - Google Search grounding
   * - `tools.codeExecution()` - Python code execution
   * - `tools.urlContext()` - URL fetching and analysis
   * - `tools.googleMaps()` - Google Maps grounding
   * - `tools.fileSearch()` - Document RAG search
   *
   * Note: File Search cannot be combined with other built-in tools.
   *
   * @example
   * ```typescript
   * import { google, tools } from 'provider-protocol/google';
   *
   * const model = llm({
   *   model: google('gemini-2.5-flash'),
   *   params: {
   *     builtInTools: [
   *       tools.googleSearch(),
   *       tools.codeExecution(),
   *     ],
   *   },
   * });
   * ```
   */
  builtInTools?: GoogleBuiltInTool[];

  /**
   * Tool configuration for retrieval (e.g., user location for Maps).
   *
   * @example
   * ```typescript
   * const params: GoogleLLMParams = {
   *   builtInTools: [tools.googleMaps()],
   *   toolConfig: {
   *     retrievalConfig: {
   *       latLng: { latitude: 40.758896, longitude: -73.985130 },
   *     },
   *   },
   * };
   * ```
   */
  toolConfig?: GoogleToolConfig;
}

/**
 * Configuration for extended thinking/reasoning in Gemini 3+ models.
 *
 * Enables models to spend additional compute on reasoning before
 * generating a response, improving quality for complex tasks.
 */
export interface GoogleThinkingConfig {
  /** Token budget allocated for model thinking/reasoning before response generation. */
  thinkingBudget?: number;
}

/**
 * Request body structure for Google Generative Language API.
 *
 * This interface represents the complete request payload sent to Google's
 * generateContent or streamGenerateContent endpoints.
 */
export interface GoogleRequest {
  /** Array of content turns representing the conversation history. */
  contents: GoogleContent[];
  /** Optional system instruction provided separately from conversation content. */
  systemInstruction?: {
    parts: GooglePart[];
  };
  /** Generation parameters controlling model output behavior. */
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
    audioTimestamp?: boolean;
    thinkingConfig?: GoogleThinkingConfig;
  };
  /** Function/tool declarations and built-in tools available for the model to call. */
  tools?: (GoogleTool | GoogleBuiltInTool)[];
  /** Safety filter settings to control content moderation. */
  safetySettings?: GoogleSafetySetting[];
  /**
   * Cached content name to use for this request.
   * Format: "cachedContents/{id}" as returned from cache creation.
   */
  cachedContent?: string;
  /** Tool configuration for retrieval (e.g., user location for Maps). */
  toolConfig?: GoogleToolConfig;
}

/**
 * A single content turn in the Google conversation format.
 *
 * Represents either a user message or model response, containing
 * one or more parts that can be text, images, or function calls/responses.
 */
export interface GoogleContent {
  /** Role indicating message source: 'user' for user input, 'model' for assistant responses. */
  role: 'user' | 'model';
  /** Array of content parts within this message turn. */
  parts: GooglePart[];
}

/**
 * Union type for all possible content part types in Google messages.
 *
 * Parts can contain text, inline images, function calls (from model),
 * function responses (from user providing tool results), or code execution
 * results (from built-in code execution tool).
 */
export type GooglePart =
  | GoogleTextPart
  | GoogleImagePart
  | GoogleFunctionCallPart
  | GoogleFunctionResponsePart
  | GoogleExecutableCodePart
  | GoogleCodeExecutionResultPart;

/**
 * Text content part.
 */
export interface GoogleTextPart {
  /** The text content. */
  text: string;
}

/**
 * Inline image content part with base64-encoded data.
 */
export interface GoogleImagePart {
  /** Inline image data container. */
  inlineData: {
    /** MIME type of the image (e.g., 'image/png', 'image/jpeg'). */
    mimeType: string;
    /** Base64-encoded image data. */
    data: string;
  };
}

/**
 * Function call part generated by the model.
 *
 * Represents the model's request to invoke a declared function with
 * specific arguments.
 */
export interface GoogleFunctionCallPart {
  /** Function call details. */
  functionCall: {
    /** Name of the function to call. */
    name: string;
    /** Arguments to pass to the function. */
    args: Record<string, unknown>;
  };
  /** Thought signature for Gemini 3+ models to maintain context across multi-turn tool calls. */
  thoughtSignature?: string;
}

/**
 * Function response part provided by the user.
 *
 * Contains the result of executing a function call, sent back to
 * the model to continue the conversation.
 */
export interface GoogleFunctionResponsePart {
  /** Function response details. */
  functionResponse: {
    /** Name of the function that was called. */
    name: string;
    /** Response data from the function execution. */
    response: Record<string, unknown>;
  };
}

/**
 * Executable code part generated by the model.
 *
 * Contains code that was written by the model for execution
 * via the built-in code execution tool.
 */
export interface GoogleExecutableCodePart {
  /** Executable code details. */
  executableCode: {
    /** Programming language of the code. */
    language: 'PYTHON' | 'LANGUAGE_UNSPECIFIED';
    /** The code to execute. */
    code: string;
  };
}

/**
 * Code execution result part from built-in code execution.
 *
 * Contains the output from executing code via the code execution tool.
 * Always follows an ExecutableCode part.
 */
export interface GoogleCodeExecutionResultPart {
  /** Code execution result details. */
  codeExecutionResult: {
    /** Execution outcome. */
    outcome: 'OUTCOME_UNSPECIFIED' | 'OUTCOME_OK' | 'OUTCOME_FAILED' | 'OUTCOME_DEADLINE_EXCEEDED';
    /** Execution output (stdout on success, stderr on failure). */
    output: string;
  };
}

/**
 * Tool definition containing function declarations.
 *
 * Google groups function declarations within a tools array, where each
 * tool object contains an array of function declarations.
 */
export interface GoogleTool {
  /** Array of function declarations available for the model to call. */
  functionDeclarations: GoogleFunctionDeclaration[];
}

/**
 * Declaration of a callable function/tool for the model.
 *
 * Describes the function signature including its name, purpose,
 * and expected parameters in JSON Schema format.
 */
export interface GoogleFunctionDeclaration {
  /** Unique name of the function. */
  name: string;
  /** Human-readable description of what the function does. */
  description: string;
  /** JSON Schema describing the function parameters. */
  parameters: {
    /** Schema type, always 'object' for function parameters. */
    type: 'object';
    /** Map of parameter names to their JSON Schema definitions. */
    properties: Record<string, unknown>;
    /** Array of required parameter names. */
    required?: string[];
  };
}

/**
 * Safety filter configuration for content moderation.
 *
 * Allows customization of safety thresholds for different harm categories.
 */
export interface GoogleSafetySetting {
  /** Harm category to configure (e.g., 'HARM_CATEGORY_HARASSMENT'). */
  category: string;
  /** Blocking threshold (e.g., 'BLOCK_NONE', 'BLOCK_LOW_AND_ABOVE'). */
  threshold: string;
}

/**
 * Response structure from Google's generateContent endpoint.
 *
 * Contains one or more candidate responses along with usage metadata.
 */
export interface GoogleResponse {
  /** Array of candidate responses (typically one unless candidateCount > 1). */
  candidates: GoogleCandidate[];
  /** Token usage statistics for billing and monitoring. */
  usageMetadata?: {
    /** Number of tokens in the input prompt. */
    promptTokenCount: number;
    /** Number of tokens in the generated candidates. */
    candidatesTokenCount: number;
    /** Total tokens (prompt + candidates). */
    totalTokenCount: number;
    /** Number of tokens read from cached content. */
    cachedContentTokenCount?: number;
  };
}

/**
 * A single candidate response from the model.
 */
export interface GoogleCandidate {
  /** The generated content including role and parts. */
  content: {
    /** Always 'model' for generated responses. */
    role: 'model';
    /** Array of response parts (text and/or function calls). */
    parts: GoogleResponsePart[];
  };
  /** Reason the model stopped generating. */
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | 'TOOL_USE' | null;
  /** Index of this candidate in the candidates array. */
  index: number;
  /** Safety ratings for the generated content. */
  safetyRatings?: GoogleSafetyRating[];
}

/**
 * Part types that can appear in model responses.
 *
 * Responses may contain text, function calls, or code execution results.
 * Images and function responses are input-only.
 */
export type GoogleResponsePart =
  | GoogleTextPart
  | GoogleFunctionCallPart
  | GoogleExecutableCodePart
  | GoogleCodeExecutionResultPart;

/**
 * Safety rating for a specific harm category.
 */
export interface GoogleSafetyRating {
  /** The harm category being rated. */
  category: string;
  /** Probability level of the harm (e.g., 'NEGLIGIBLE', 'LOW', 'MEDIUM', 'HIGH'). */
  probability: string;
}

/**
 * Streaming response chunk from Google's streamGenerateContent endpoint.
 *
 * Has the same structure as GoogleResponse but fields may be partial
 * or omitted depending on what data is available in the current chunk.
 */
export interface GoogleStreamChunk {
  /** Partial candidate data for this chunk. */
  candidates?: GoogleCandidate[];
  /** Cumulative token usage (updated with each chunk). */
  usageMetadata?: {
    /** Number of tokens in the input prompt. */
    promptTokenCount: number;
    /** Number of tokens generated so far. */
    candidatesTokenCount: number;
    /** Total tokens consumed so far. */
    totalTokenCount: number;
    /** Number of tokens read from cached content. */
    cachedContentTokenCount?: number;
  };
  /** Error response from the API (when streaming fails). */
  error?: {
    /** Error message from the API. */
    message: string;
    /** Error code. */
    code?: number;
    /** Error status string. */
    status?: string;
  };
}

// ============================================
// Caching API Types
// ============================================

/**
 * Request body for creating a cached content entry.
 *
 * @see {@link https://ai.google.dev/api/caching Google Caching API docs}
 */
export interface GoogleCacheCreateRequest {
  /** Model to use with this cache (format: models/{model}) */
  model: string;
  /** Optional display name for the cache (max 128 chars) */
  displayName?: string;
  /** Content to cache (immutable after creation) */
  contents?: GoogleContent[];
  /** System instruction to cache (text-only, immutable after creation) */
  systemInstruction?: {
    role?: 'user';
    parts: Array<{ text: string }>;
  };
  /** Tool declarations to cache (immutable after creation) */
  tools?: GoogleTool[];
  /** Tool configuration to cache (immutable after creation) */
  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'AUTO' | 'ANY' | 'NONE' | 'VALIDATED';
      allowedFunctionNames?: string[];
    };
  };
  /** Absolute expiration time (RFC 3339 format, mutually exclusive with ttl) */
  expireTime?: string;
  /** Time-to-live duration (e.g., "300s", "3600s", mutually exclusive with expireTime) */
  ttl?: string;
}

/**
 * Response from creating or retrieving a cached content entry.
 */
export interface GoogleCacheResponse {
  /** Cache identifier in format "cachedContents/{id}" - use this in requests */
  name: string;
  /** Model this cache is associated with */
  model: string;
  /** Display name for the cache */
  displayName?: string;
  /** When the cache was created (RFC 3339 format) */
  createTime: string;
  /** When the cache was last updated (RFC 3339 format) */
  updateTime: string;
  /** When the cache expires (RFC 3339 format) */
  expireTime: string;
  /** Token usage metadata */
  usageMetadata?: {
    /** Total tokens in the cached content */
    totalTokenCount: number;
  };
}

/**
 * Request body for updating a cached content entry.
 * Only expiration can be updated; all other fields are immutable.
 */
export interface GoogleCacheUpdateRequest {
  /** New absolute expiration time (RFC 3339 format, mutually exclusive with ttl) */
  expireTime?: string;
  /** New time-to-live duration (e.g., "3600s", mutually exclusive with expireTime) */
  ttl?: string;
}

/**
 * Response from listing cached content entries.
 */
export interface GoogleCacheListResponse {
  /** Array of cached content entries */
  cachedContents?: GoogleCacheResponse[];
  /** Token for fetching the next page of results */
  nextPageToken?: string;
}

/**
 * Google Gemini-specific HTTP headers for API requests.
 *
 * @example
 * ```typescript
 * const headers: GoogleHeaders = {
 *   'x-goog-api-client': 'myapp/1.0.0',
 * };
 * ```
 */
export interface GoogleHeaders {
  /** Client identification header for partners and libraries. */
  'x-goog-api-client'?: string;
  /** Quota project ID for Vertex AI billing. */
  'x-goog-user-project'?: string;
  [key: string]: string | undefined;
}

// ============================================
// Built-in Tools
// ============================================

/**
 * Google Search grounding tool for real-time web information.
 *
 * Enables Gemini to search the web using Google Search for up-to-date information.
 * Results are returned with grounding metadata including sources and citations.
 *
 * Pricing:
 * - Gemini 2.x and earlier: $35 per 1,000 grounded prompts
 * - Gemini 3.x: $14 per 1,000 search queries
 *
 * @example
 * ```typescript
 * const tool: GoogleSearchTool = {
 *   googleSearch: {},
 * };
 * ```
 */
export interface GoogleSearchTool {
  /** Empty object to enable Google Search grounding */
  googleSearch: Record<string, never>;
}

/**
 * Code execution tool for running Python in a sandbox.
 *
 * Enables Gemini to write and execute Python code in a secure environment.
 * Supports data analysis, calculations, and visualization.
 *
 * No additional cost - standard token pricing applies.
 *
 * @example
 * ```typescript
 * const tool: GoogleCodeExecutionTool = {
 *   codeExecution: {},
 * };
 * ```
 */
export interface GoogleCodeExecutionTool {
  /** Empty object to enable code execution */
  codeExecution: Record<string, never>;
}

/**
 * URL context tool for fetching and processing URLs.
 *
 * Enables Gemini to fetch and analyze content from URLs.
 * Supports text, images, and PDF documents.
 *
 * Limits:
 * - Maximum 20 URLs per request
 * - Maximum 34MB content per URL
 *
 * @example
 * ```typescript
 * const tool: GoogleUrlContextTool = {
 *   urlContext: {},
 * };
 * ```
 */
export interface GoogleUrlContextTool {
  /** Empty object to enable URL context */
  urlContext: Record<string, never>;
}

/**
 * Google Maps grounding tool for location-based queries.
 *
 * Enables Gemini to search for places, businesses, and locations
 * using Google Maps data.
 *
 * Pricing: $25 per 1,000 grounded prompts.
 *
 * Note: Not supported in Gemini 3 models.
 *
 * @example
 * ```typescript
 * const tool: GoogleMapsTool = {
 *   googleMaps: {
 *     enableWidget: true,
 *   },
 * };
 * ```
 */
export interface GoogleMapsTool {
  /** Google Maps configuration */
  googleMaps: {
    /** Return widget context token for Places widget */
    enableWidget?: boolean;
  };
}

/**
 * File search (RAG) tool for document retrieval.
 *
 * Enables Gemini to search through uploaded documents
 * using semantic search on FileSearchStore.
 *
 * Pricing:
 * - Embeddings at indexing: $0.15 per 1M tokens
 * - Storage and query embeddings: Free
 *
 * Note: Cannot be combined with other built-in tools.
 *
 * @example
 * ```typescript
 * const tool: GoogleFileSearchTool = {
 *   fileSearch: {
 *     fileSearchStoreNames: ['fileSearchStores/abc123'],
 *   },
 * };
 * ```
 */
export interface GoogleFileSearchTool {
  /** File search configuration */
  fileSearch: {
    /** FileSearchStore names to query */
    fileSearchStoreNames: string[];
    /** AIP-160 filter syntax for metadata filtering */
    metadataFilter?: string;
  };
}

/**
 * Union type for all Google built-in tools.
 *
 * Note: Google's built-in tools use a different structure than function tools.
 * They are passed directly in the tools array alongside functionDeclarations.
 */
export type GoogleBuiltInTool =
  | GoogleSearchTool
  | GoogleCodeExecutionTool
  | GoogleUrlContextTool
  | GoogleMapsTool
  | GoogleFileSearchTool;

/**
 * Tool configuration for retrieval (e.g., user location for Maps).
 */
export interface GoogleToolConfig {
  /** Retrieval configuration */
  retrievalConfig?: {
    /** User location for "near me" queries */
    latLng?: {
      /** User latitude */
      latitude: number;
      /** User longitude */
      longitude: number;
    };
  };
}

/**
 * Grounding metadata returned with search/maps results.
 */
export interface GoogleGroundingMetadata {
  /** Web search queries executed */
  webSearchQueries?: string[];
  /** Search entry point with rendered HTML */
  searchEntryPoint?: {
    renderedContent: string;
  };
  /** Grounding chunks (sources) */
  groundingChunks?: Array<{
    web?: {
      uri: string;
      title: string;
    };
    maps?: {
      uri: string;
      placeId: string;
      title: string;
    };
  }>;
  /** Grounding supports (citations) */
  groundingSupports?: Array<{
    segment: {
      startIndex: number;
      endIndex: number;
      text: string;
    };
    groundingChunkIndices: number[];
    confidenceScores: number[];
  }>;
  /** Google Maps widget context token */
  googleMapsWidgetContextToken?: string;
}

/**
 * Code execution result in response.
 */
export interface GoogleCodeExecutionResult {
  /** Execution outcome */
  outcome: 'OUTCOME_OK' | 'OUTCOME_FAILED' | 'OUTCOME_DEADLINE_EXCEEDED';
  /** Execution output (stdout) */
  output: string;
}

// ============================================
// Tool Helper Constructors
// ============================================

/**
 * Creates a Google Search grounding tool configuration.
 *
 * Enables Gemini to search the web using Google Search for up-to-date information.
 *
 * @returns A Google Search tool configuration object
 *
 * @example
 * ```typescript
 * const search = googleSearchTool();
 * ```
 */
export function googleSearchTool(): GoogleSearchTool {
  return { googleSearch: {} };
}

/**
 * Creates a code execution tool configuration.
 *
 * Enables Gemini to write and execute Python code in a sandbox.
 *
 * @returns A code execution tool configuration object
 *
 * @example
 * ```typescript
 * const codeExec = codeExecutionTool();
 * ```
 */
export function codeExecutionTool(): GoogleCodeExecutionTool {
  return { codeExecution: {} };
}

/**
 * Creates a URL context tool configuration.
 *
 * Enables Gemini to fetch and analyze content from URLs.
 *
 * @returns A URL context tool configuration object
 *
 * @example
 * ```typescript
 * const urlCtx = urlContextTool();
 * ```
 */
export function urlContextTool(): GoogleUrlContextTool {
  return { urlContext: {} };
}

/**
 * Creates a Google Maps grounding tool configuration.
 *
 * Enables Gemini to search for places using Google Maps data.
 *
 * Note: Not supported in Gemini 3 models.
 *
 * @param options - Optional configuration
 * @returns A Google Maps tool configuration object
 *
 * @example
 * ```typescript
 * const maps = googleMapsTool();
 *
 * // With widget enabled
 * const mapsWithWidget = googleMapsTool({ enableWidget: true });
 * ```
 */
export function googleMapsTool(options?: {
  enableWidget?: boolean;
}): GoogleMapsTool {
  return {
    googleMaps: {
      ...(options?.enableWidget !== undefined && { enableWidget: options.enableWidget }),
    },
  };
}

/**
 * Creates a file search (RAG) tool configuration.
 *
 * Enables Gemini to search through uploaded documents.
 *
 * Note: Cannot be combined with other built-in tools.
 *
 * @param options - File search configuration
 * @returns A file search tool configuration object
 *
 * @example
 * ```typescript
 * const fileSearch = fileSearchTool({
 *   fileSearchStoreNames: ['fileSearchStores/abc123'],
 * });
 * ```
 */
export function fileSearchTool(options: {
  fileSearchStoreNames: string[];
  metadataFilter?: string;
}): GoogleFileSearchTool {
  return {
    fileSearch: options,
  };
}

/**
 * Namespace object containing all Google tool helper constructors.
 *
 * Provides a convenient way to create built-in tool configurations.
 *
 * @example
 * ```typescript
 * import { google, tools } from 'provider-protocol/google';
 *
 * const model = llm({
 *   model: google('gemini-2.5-flash'),
 *   params: {
 *     builtInTools: [
 *       tools.googleSearch(),
 *       tools.codeExecution(),
 *     ],
 *   },
 * });
 * ```
 */
export const tools = {
  /** Creates a Google Search grounding tool configuration */
  googleSearch: googleSearchTool,
  /** Creates a code execution tool configuration */
  codeExecution: codeExecutionTool,
  /** Creates a URL context tool configuration */
  urlContext: urlContextTool,
  /** Creates a Google Maps grounding tool configuration */
  googleMaps: googleMapsTool,
  /** Creates a file search (RAG) tool configuration */
  fileSearch: fileSearchTool,
};
