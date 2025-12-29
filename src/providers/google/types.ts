/**
 * Google Gemini-specific LLM parameters
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
}

/**
 * Google API request body
 */
export interface GoogleRequest {
  contents: GoogleContent[];
  systemInstruction?: {
    parts: GooglePart[];
  };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    candidateCount?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  };
  tools?: GoogleTool[];
  safetySettings?: GoogleSafetySetting[];
}

/**
 * Google content (message) format
 */
export interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

/**
 * Google content part types
 */
export type GooglePart =
  | GoogleTextPart
  | GoogleImagePart
  | GoogleFunctionCallPart
  | GoogleFunctionResponsePart;

export interface GoogleTextPart {
  text: string;
}

export interface GoogleImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface GoogleFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface GoogleFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

/**
 * Google tool format
 */
export interface GoogleTool {
  functionDeclarations: GoogleFunctionDeclaration[];
}

export interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Google safety setting
 */
export interface GoogleSafetySetting {
  category: string;
  threshold: string;
}

/**
 * Google response format
 */
export interface GoogleResponse {
  candidates: GoogleCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GoogleCandidate {
  content: {
    role: 'model';
    parts: GoogleResponsePart[];
  };
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | 'TOOL_USE' | null;
  index: number;
  safetyRatings?: GoogleSafetyRating[];
}

export type GoogleResponsePart = GoogleTextPart | GoogleFunctionCallPart;

export interface GoogleSafetyRating {
  category: string;
  probability: string;
}

/**
 * Google streaming response chunk
 * Same structure as regular response but may be partial
 */
export interface GoogleStreamChunk {
  candidates?: GoogleCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
