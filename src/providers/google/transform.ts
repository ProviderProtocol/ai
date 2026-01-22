/**
 * @fileoverview Transformation functions between UPP format and Google Gemini API format.
 *
 * This module handles the bidirectional conversion of requests, responses, and
 * streaming chunks between the Unified Provider Protocol (UPP) format and
 * Google's Generative Language API format.
 *
 * Key transformations:
 * - UPP messages with content blocks to Google's parts-based content structure
 * - UPP tools to Google's functionDeclarations format
 * - Google responses back to UPP LLMResponse with proper message types
 * - Streaming chunks to UPP StreamEvents
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type {
  ContentBlock,
  AssistantContent,
  ImageBlock,
  DocumentBlock,
  AudioBlock,
  VideoBlock,
} from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import type {
  GoogleLLMParams,
  GoogleRequest,
  GoogleContent,
  GooglePart,
  GoogleTextPart,
  GoogleTool,
  GoogleResponse,
  GoogleStreamChunk,
  GoogleFunctionCallPart,
} from './types.ts';

function normalizeSystem(system: string | unknown[] | undefined): string | GooglePart[] | undefined {
  if (system === undefined || system === null) return undefined;
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) {
    throw new UPPError(
      'System prompt must be a string or an array of text parts',
      ErrorCode.InvalidRequest,
      'google',
      ModalityType.LLM
    );
  }

  const parts: GooglePart[] = [];
  for (const part of system) {
    if (!part || typeof part !== 'object' || !('text' in part)) {
      throw new UPPError(
        'Google system prompt array must contain text parts',
        ErrorCode.InvalidRequest,
        'google',
        ModalityType.LLM
      );
    }
    const textValue = (part as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'Google system prompt text must be a string',
        ErrorCode.InvalidRequest,
        'google',
        ModalityType.LLM
      );
    }
    parts.push(part as GooglePart);
  }

  return parts.length > 0 ? parts : undefined;
}

const GOOGLE_TOOLCALL_PREFIX = 'google_toolcall';

function createGoogleToolCallId(name: string, index: number): string {
  return `${GOOGLE_TOOLCALL_PREFIX}:${index}:${name}`;
}

function extractGoogleToolName(toolCallId: string): string {
  const prefix = `${GOOGLE_TOOLCALL_PREFIX}:`;
  if (!toolCallId.startsWith(prefix)) {
    return toolCallId;
  }
  const rest = toolCallId.slice(prefix.length);
  const separatorIndex = rest.indexOf(':');
  if (separatorIndex === -1) {
    return toolCallId;
  }
  return rest.slice(separatorIndex + 1);
}

/**
 * Filters content blocks to only those with a valid type property.
 *
 * @typeParam T - Content block type with optional type property
 * @param content - Array of content blocks to filter
 * @returns Filtered array containing only blocks with string type property
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Converts a Uint8Array to a base64 string.
 *
 * @param bytes - The byte array to encode
 * @returns Base64-encoded string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Transforms a UPP content block to a Google part.
 *
 * Supports text, image, document, audio, and video content types.
 * Binary data (images, audio, video, PDFs) is sent as base64-encoded inlineData.
 * URL sources are not supported by Google's API directly.
 *
 * @param block - The UPP content block to transform
 * @returns Google-formatted part object
 * @throws Error if the content type is unsupported or uses URL source
 */
function transformContentBlock(block: ContentBlock): GooglePart {
  switch (block.type) {
    case 'text':
      return { text: block.text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      let data: string;

      if (imageBlock.source.type === 'base64') {
        data = imageBlock.source.data;
      } else if (imageBlock.source.type === 'bytes') {
        data = uint8ArrayToBase64(imageBlock.source.data);
      } else {
        throw new Error('Google API does not support URL image sources directly');
      }

      return {
        inlineData: {
          mimeType: imageBlock.mimeType,
          data,
        },
      };
    }

    case 'document': {
      const documentBlock = block as DocumentBlock;

      if (documentBlock.source.type === 'base64') {
        return {
          inlineData: {
            mimeType: documentBlock.mimeType,
            data: documentBlock.source.data,
          },
        };
      }

      if (documentBlock.source.type === 'text') {
        return { text: documentBlock.source.data };
      }

      throw new Error('Google API does not support URL document sources directly');
    }

    case 'audio': {
      const audioBlock = block as AudioBlock;
      return {
        inlineData: {
          mimeType: audioBlock.mimeType,
          data: uint8ArrayToBase64(audioBlock.data),
        },
      };
    }

    case 'video': {
      const videoBlock = block as VideoBlock;
      return {
        inlineData: {
          mimeType: videoBlock.mimeType,
          data: uint8ArrayToBase64(videoBlock.data),
        },
      };
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transforms UPP message array to Google's content format.
 *
 * Handles the conversion of user messages, assistant messages (including
 * tool calls), and tool result messages to Google's role-based content
 * structure with parts arrays.
 *
 * @param messages - Array of UPP-formatted messages
 * @returns Array of Google content objects with role and parts
 */
function transformMessages(messages: Message[]): GoogleContent[] {
  const contents: GoogleContent[] = [];

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      const validContent = filterValidContent(msg.content);
      const parts = validContent.map(transformContentBlock);
      if (parts.length === 0) {
        parts.push({ text: '' });
      }
      contents.push({
        role: 'user',
        parts,
      });
    } else if (isAssistantMessage(msg)) {
      const validContent = filterValidContent(msg.content);
      // Filter out reasoning blocks - they're preserved via thoughtSignature in metadata
      const nonReasoningContent = validContent.filter(c => c.type !== 'reasoning');
      const parts: GooglePart[] = nonReasoningContent.map(transformContentBlock);

      const googleMeta = msg.metadata?.google as {
        functionCallParts?: Array<{
          id?: string;
          name: string;
          args: Record<string, unknown>;
          thoughtSignature?: string;
        }>;
        // Thought signature from text response (Gemini 3+ multi-turn context)
        thoughtSignature?: string;
      } | undefined;

      // Add thoughtSignature to the last text part for multi-turn context preservation
      if (googleMeta?.thoughtSignature) {
        // Find the last text part and add the signature
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          if (part && 'text' in part) {
            (part as GoogleTextPart).thoughtSignature = googleMeta.thoughtSignature;
            break;
          }
        }
      }

      if (googleMeta?.functionCallParts && googleMeta.functionCallParts.length > 0) {
        for (const fc of googleMeta.functionCallParts) {
          const part: GoogleFunctionCallPart = {
            functionCall: {
              id: fc.id,
              name: fc.name,
              args: fc.args,
            },
          };
          if (fc.thoughtSignature) {
            part.thoughtSignature = fc.thoughtSignature;
          }
          parts.push(part);
        }
      } else if (msg.toolCalls) {
        for (const call of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: call.toolName,
              args: call.arguments,
            },
          });
        }
      }

      if (parts.length === 0) {
        parts.push({ text: '' });
      }

      contents.push({
        role: 'model',
        parts,
      });
    } else if (isToolResultMessage(msg)) {
      contents.push({
        role: 'user',
        parts: msg.results.map((result) => ({
          functionResponse: {
            name: extractGoogleToolName(result.toolCallId),
            response:
              typeof result.result === 'object'
                ? (result.result as Record<string, unknown>)
                : { result: result.result },
          },
        })),
      });
    }
  }

  return contents;
}

/**
 * Transforms a UPP tool definition to Google's function declaration format.
 *
 * @param tool - The UPP tool definition with name, description, and parameters
 * @returns Google function declaration object
 */
function transformTool(tool: Tool): GoogleTool['functionDeclarations'][0] {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  };
}

/**
 * Transforms a UPP LLM request into Google Gemini API format.
 *
 * Converts the UPP message structure, system prompt, tools, and generation
 * parameters into Google's expected request body format. Provider-specific
 * parameters are passed through to `generationConfig` to support new API
 * features without library updates.
 *
 * @typeParam TParams - Type extending GoogleLLMParams for provider-specific options
 * @param request - The UPP-formatted LLM request
 * @param modelId - The target Gemini model identifier
 * @returns Google API request body ready for submission
 *
 * @example
 * ```typescript
 * const googleRequest = transformRequest({
 *   messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
 *   system: 'You are a helpful assistant',
 *   params: { temperature: 0.7 },
 *   config: { apiKey: '...' },
 * }, 'gemini-1.5-pro');
 * ```
 */
export function transformRequest<TParams extends GoogleLLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): GoogleRequest {
  const params = (request.params ?? {}) as GoogleLLMParams;
  const { cachedContent, tools: builtInTools, toolConfig, ...generationParams } = params;

  const googleRequest: GoogleRequest = {
    contents: transformMessages(request.messages),
  };

  const normalizedSystem = normalizeSystem(request.system);
  if (normalizedSystem !== undefined) {
    if (typeof normalizedSystem === 'string') {
      googleRequest.systemInstruction = {
        parts: [{ text: normalizedSystem }],
      };
    } else if (normalizedSystem.length > 0) {
      googleRequest.systemInstruction = {
        parts: normalizedSystem,
      };
    }
  }

  const generationConfig: NonNullable<GoogleRequest['generationConfig']> = {
    ...generationParams,
  };

  if (request.structure) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = request.structure as unknown as Record<string, unknown>;
  }

  if (Object.keys(generationConfig).length > 0) {
    googleRequest.generationConfig = generationConfig;
  }

  // Collect all tools: function declarations + built-in tools
  const requestTools: NonNullable<GoogleRequest['tools']> = [];

  if (request.tools && request.tools.length > 0) {
    requestTools.push({
      functionDeclarations: request.tools.map(transformTool),
    });
  }

  // Add built-in tools (googleSearch, codeExecution, urlContext, etc.)
  // These are added as separate tool objects, not as function declarations
  if (builtInTools && builtInTools.length > 0) {
    requestTools.push(...builtInTools);
  }

  if (requestTools.length > 0) {
    googleRequest.tools = requestTools;
  }

  // Add tool config if provided (e.g., for retrievalConfig with Google Maps)
  if (toolConfig) {
    googleRequest.toolConfig = toolConfig;
  }

  if (cachedContent) {
    googleRequest.cachedContent = cachedContent;
  }

  return googleRequest;
}

function normalizeStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
    case 'TOOL_USE':
      return 'tool_use';
    case 'OTHER':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}

/**
 * Transforms a Google API response to UPP LLMResponse format.
 *
 * Extracts text content, tool calls, structured data, and usage metadata
 * from Google's response format. Preserves Google-specific metadata like
 * finish reason, safety ratings, and thought signatures for multi-turn
 * tool call conversations.
 *
 * @param data - The raw Google API response
 * @returns Normalized UPP LLMResponse with message, usage, and stop reason
 * @throws Error if response contains no candidates
 *
 * @example
 * ```typescript
 * const response = await fetch(googleApiUrl, options);
 * const data = await response.json();
 * const uppResponse = transformResponse(data);
 * console.log(uppResponse.message.content);
 * ```
 */
export function transformResponse(data: GoogleResponse): LLMResponse {
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('No candidates in Google response');
  }

  const content: AssistantContent[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;
  let lastThoughtSignature: string | undefined;
  const functionCallParts: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  for (const part of candidate.content.parts) {
    if ('text' in part) {
      const textPart = part as GoogleTextPart;
      // Capture thoughtSignature from the last text part (Gemini 3+ includes on final part)
      if (textPart.thoughtSignature) {
        lastThoughtSignature = textPart.thoughtSignature;
      }
      if (textPart.thought) {
        content.push({ type: 'reasoning', text: textPart.text });
      } else {
        content.push({ type: 'text', text: textPart.text });
        if (structuredData === undefined) {
          try {
            structuredData = JSON.parse(textPart.text);
          } catch {
            // Not JSON - may not be structured output
          }
        }
      }
    } else if ('functionCall' in part) {
      const fc = part as GoogleFunctionCallPart;
      const toolCallId = fc.functionCall.id ?? createGoogleToolCallId(fc.functionCall.name, toolCalls.length);
      toolCalls.push({
        toolCallId,
        toolName: fc.functionCall.name,
        arguments: fc.functionCall.args,
      });
      functionCallParts.push({
        id: fc.functionCall.id,
        name: fc.functionCall.name,
        args: fc.functionCall.args,
        thoughtSignature: fc.thoughtSignature,
      });
    } else if ('inlineData' in part) {
      const imagePart = part as { inlineData: { mimeType?: string; data?: string } };
      const dataString = imagePart.inlineData.data;
      if (dataString) {
        content.push({
          type: 'image',
          mimeType: imagePart.inlineData.mimeType ?? 'image/png',
          source: { type: 'base64', data: dataString },
        } as ImageBlock);
      }
    } else if ('codeExecutionResult' in part) {
      // Append code execution output to text content
      const codeResult = part as { codeExecutionResult: { outcome: string; output: string } };
      if (codeResult.codeExecutionResult.output) {
        content.push({ type: 'text', text: `\n\`\`\`\n${codeResult.codeExecutionResult.output}\`\`\`\n` });
      }
    }
    // executableCode parts are tracked for context but the output is in codeExecutionResult
  }

  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        google: {
          finishReason: candidate.finishReason,
          safetyRatings: candidate.safetyRatings,
          functionCallParts: functionCallParts.length > 0 ? functionCallParts : undefined,
          // Store thoughtSignature for multi-turn context preservation (Gemini 3+)
          thoughtSignature: lastThoughtSignature,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    cacheReadTokens: data.usageMetadata?.cachedContentTokenCount ?? 0,
    cacheWriteTokens: 0,
  };

  return {
    message,
    usage,
    stopReason: normalizeStopReason(candidate.finishReason),
    data: structuredData,
  };
}

/**
 * Accumulator state for streaming responses.
 *
 * Tracks partial content, tool calls, token counts, and stream lifecycle
 * as chunks arrive from the Google streaming API.
 */
export interface StreamState {
  /** Accumulated text content from all chunks. */
  content: string;
  /** Accumulated reasoning/thinking content from thought parts. */
  reasoning: string;
  /** Encrypted thought signature for multi-turn context (Gemini 3+). */
  thoughtSignature?: string;
  /** Accumulated tool calls with their arguments and optional thought signatures. */
  toolCalls: Array<{ id: string; nativeId?: string; name: string; args: Record<string, unknown>; thoughtSignature?: string }>;
  /** Base64 image data from inline image response parts. */
  images: Array<{ data: string; mimeType: string }>;
  /** The finish reason from the final chunk, if received. */
  finishReason: string | null;
  /** Total input tokens reported by the API. */
  inputTokens: number;
  /** Total output tokens reported by the API. */
  outputTokens: number;
  /** Number of tokens read from cached content. */
  cacheReadTokens: number;
  /** Flag indicating whether this is the first chunk (for message_start event). */
  isFirstChunk: boolean;
}

/**
 * Creates a fresh stream state for accumulating streaming responses.
 *
 * @returns Initialized StreamState with empty content and default values
 */
export function createStreamState(): StreamState {
  return {
    content: '',
    reasoning: '',
    thoughtSignature: undefined,
    toolCalls: [],
    images: [],
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    isFirstChunk: true,
  };
}

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Transforms a Google streaming chunk to UPP StreamEvent array.
 *
 * Processes each streaming chunk, updating the accumulator state and
 * generating appropriate stream events for text deltas, tool calls,
 * and message lifecycle (start/stop).
 *
 * @param chunk - The Google streaming response chunk
 * @param state - Mutable accumulator state updated by this function
 * @returns Array of UPP StreamEvents generated from this chunk
 */
export function transformStreamChunk(
  chunk: GoogleStreamChunk,
  state: StreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (state.isFirstChunk) {
    events.push({ type: StreamEventType.MessageStart, index: 0, delta: {} });
    state.isFirstChunk = false;
  }

  if (chunk.usageMetadata) {
    state.inputTokens = chunk.usageMetadata.promptTokenCount;
    state.outputTokens = chunk.usageMetadata.candidatesTokenCount;
    state.cacheReadTokens = chunk.usageMetadata.cachedContentTokenCount ?? 0;
  }

  const candidate = chunk.candidates?.[0];
  if (!candidate) {
    return events;
  }

  for (const part of candidate.content?.parts ?? []) {
    if ('text' in part) {
      const textPart = part as GoogleTextPart;
      if (textPart.thoughtSignature) {
        state.thoughtSignature = textPart.thoughtSignature;
      }
      if (textPart.thought) {
        state.reasoning += textPart.text;
        events.push({
          type: StreamEventType.ReasoningDelta,
          index: 0,
          delta: { text: textPart.text },
        });
      } else {
        state.content += textPart.text;
        events.push({
          type: StreamEventType.TextDelta,
          index: 0,
          delta: { text: textPart.text },
        });
      }
    } else if ('functionCall' in part) {
      const fc = part as GoogleFunctionCallPart;
      const toolCallId = fc.functionCall.id ?? createGoogleToolCallId(fc.functionCall.name, state.toolCalls.length);
      state.toolCalls.push({
        id: toolCallId,
        nativeId: fc.functionCall.id,
        name: fc.functionCall.name,
        args: fc.functionCall.args,
        thoughtSignature: fc.thoughtSignature,
      });
      events.push({
        type: StreamEventType.ToolCallDelta,
        index: state.toolCalls.length - 1,
        delta: {
          toolCallId,
          toolName: fc.functionCall.name,
          argumentsJson: JSON.stringify(fc.functionCall.args),
        },
      });
    } else if ('inlineData' in part) {
      const imagePart = part as { inlineData: { mimeType?: string; data?: string } };
      const dataString = imagePart.inlineData.data;
      if (dataString) {
        state.images.push({
          data: dataString,
          mimeType: imagePart.inlineData.mimeType ?? 'image/png',
        });
        events.push({
          type: StreamEventType.ImageDelta,
          index: state.images.length - 1,
          delta: { data: decodeBase64(dataString) },
        });
      }
    } else if ('codeExecutionResult' in part) {
      // Append code execution output to content and emit as text delta
      const codeResult = part as { codeExecutionResult: { outcome: string; output: string } };
      if (codeResult.codeExecutionResult.output) {
        const outputText = `\n\`\`\`\n${codeResult.codeExecutionResult.output}\`\`\`\n`;
        state.content += outputText;
        events.push({
          type: StreamEventType.TextDelta,
          index: 0,
          delta: { text: outputText },
        });
      }
    }
    // executableCode parts are tracked for context but the output is in codeExecutionResult
  }

  if (candidate.finishReason) {
    state.finishReason = candidate.finishReason;
    events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
  }

  return events;
}

/**
 * Constructs a complete LLMResponse from accumulated stream state.
 *
 * Called after streaming completes to build the final response object
 * with all accumulated content, tool calls, usage statistics, and metadata.
 *
 * @param state - The final accumulated stream state
 * @returns Complete UPP LLMResponse
 */
export function buildResponseFromState(state: StreamState): LLMResponse {
  const content: AssistantContent[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;
  const functionCallParts: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  if (state.reasoning) {
    content.push({ type: 'reasoning', text: state.reasoning });
  }

  if (state.content) {
    content.push({ type: 'text', text: state.content });
    try {
      structuredData = JSON.parse(state.content);
    } catch {
      // Not JSON - may not be structured output
    }
  }

  for (const imageData of state.images) {
    content.push({
      type: 'image',
      mimeType: imageData.mimeType,
      source: { type: 'base64', data: imageData.data },
    } as ImageBlock);
  }

  for (const tc of state.toolCalls) {
    const toolCallId = tc.id || createGoogleToolCallId(tc.name, toolCalls.length);
    toolCalls.push({
      toolCallId,
      toolName: tc.name,
      arguments: tc.args,
    });
    functionCallParts.push({
      id: tc.nativeId,
      name: tc.name,
      args: tc.args,
      thoughtSignature: tc.thoughtSignature,
    });
  }

  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        google: {
          finishReason: state.finishReason,
          functionCallParts: functionCallParts.length > 0 ? functionCallParts : undefined,
          thoughtSignature: state.thoughtSignature,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens: state.inputTokens + state.outputTokens,
    cacheReadTokens: state.cacheReadTokens,
    cacheWriteTokens: 0,
  };

  return {
    message,
    usage,
    stopReason: normalizeStopReason(state.finishReason),
    data: structuredData,
  };
}
