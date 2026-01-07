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
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock, ImageBlock } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import type {
  GoogleLLMParams,
  GoogleRequest,
  GoogleContent,
  GooglePart,
  GoogleTool,
  GoogleResponse,
  GoogleStreamChunk,
  GoogleFunctionCallPart,
} from './types.ts';

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

  const googleRequest: GoogleRequest = {
    contents: transformMessages(request.messages),
  };

  if (request.system) {
    googleRequest.systemInstruction = {
      parts: [{ text: request.system }],
    };
  }

  const generationConfig: NonNullable<GoogleRequest['generationConfig']> = {
    ...params,
  };

  if (request.structure) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = request.structure as unknown as Record<string, unknown>;
  }

  if (Object.keys(generationConfig).length > 0) {
    googleRequest.generationConfig = generationConfig;
  }

  if (request.tools && request.tools.length > 0) {
    googleRequest.tools = [
      {
        functionDeclarations: request.tools.map(transformTool),
      },
    ];
  }

  return googleRequest;
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
      const parts: GooglePart[] = validContent.map(transformContentBlock);

      const googleMeta = msg.metadata?.google as {
        functionCallParts?: Array<{
          name: string;
          args: Record<string, unknown>;
          thoughtSignature?: string;
        }>;
      } | undefined;

      if (googleMeta?.functionCallParts && googleMeta.functionCallParts.length > 0) {
        for (const fc of googleMeta.functionCallParts) {
          const part: GoogleFunctionCallPart = {
            functionCall: {
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
            name: result.toolCallId,
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
 * Transforms a UPP content block to a Google part.
 *
 * Supports text and image content types. Images must be base64 or bytes
 * encoded; URL sources are not supported by Google's API directly.
 *
 * @param block - The UPP content block to transform
 * @returns Google-formatted part object
 * @throws Error if the content type is unsupported or if an image uses URL source
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
        data = btoa(
          Array.from(imageBlock.source.data)
            .map((b) => String.fromCharCode(b))
            .join('')
        );
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

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
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

  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;
  const functionCallParts: Array<{
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  for (const part of candidate.content.parts) {
    if ('text' in part) {
      textContent.push({ type: 'text', text: part.text });
      if (structuredData === undefined) {
        try {
          structuredData = JSON.parse(part.text);
        } catch {
          // Not JSON - may not be structured output
        }
      }
    } else if ('functionCall' in part) {
      const fc = part as GoogleFunctionCallPart;
      toolCalls.push({
        toolCallId: fc.functionCall.name,
        toolName: fc.functionCall.name,
        arguments: fc.functionCall.args,
      });
      functionCallParts.push({
        name: fc.functionCall.name,
        args: fc.functionCall.args,
        thoughtSignature: fc.thoughtSignature,
      });
    }
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        google: {
          finishReason: candidate.finishReason,
          safetyRatings: candidate.safetyRatings,
          functionCallParts: functionCallParts.length > 0 ? functionCallParts : undefined,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
  };

  return {
    message,
    usage,
    stopReason: candidate.finishReason ?? 'STOP',
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
  /** Accumulated tool calls with their arguments and optional thought signatures. */
  toolCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>;
  /** The finish reason from the final chunk, if received. */
  finishReason: string | null;
  /** Total input tokens reported by the API. */
  inputTokens: number;
  /** Total output tokens reported by the API. */
  outputTokens: number;
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
    toolCalls: [],
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    isFirstChunk: true,
  };
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
    events.push({ type: 'message_start', index: 0, delta: {} });
    state.isFirstChunk = false;
  }

  if (chunk.usageMetadata) {
    state.inputTokens = chunk.usageMetadata.promptTokenCount;
    state.outputTokens = chunk.usageMetadata.candidatesTokenCount;
  }

  const candidate = chunk.candidates?.[0];
  if (!candidate) {
    return events;
  }

  for (const part of candidate.content?.parts ?? []) {
    if ('text' in part) {
      state.content += part.text;
      events.push({
        type: 'text_delta',
        index: 0,
        delta: { text: part.text },
      });
    } else if ('functionCall' in part) {
      const fc = part as GoogleFunctionCallPart;
      state.toolCalls.push({
        name: fc.functionCall.name,
        args: fc.functionCall.args,
        thoughtSignature: fc.thoughtSignature,
      });
      events.push({
        type: 'tool_call_delta',
        index: state.toolCalls.length - 1,
        delta: {
          toolCallId: fc.functionCall.name,
          toolName: fc.functionCall.name,
          argumentsJson: JSON.stringify(fc.functionCall.args),
        },
      });
    }
  }

  if (candidate.finishReason) {
    state.finishReason = candidate.finishReason;
    events.push({ type: 'message_stop', index: 0, delta: {} });
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
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;
  const functionCallParts: Array<{
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  if (state.content) {
    textContent.push({ type: 'text', text: state.content });
    try {
      structuredData = JSON.parse(state.content);
    } catch {
      // Not JSON - may not be structured output
    }
  }

  for (const tc of state.toolCalls) {
    toolCalls.push({
      toolCallId: tc.name,
      toolName: tc.name,
      arguments: tc.args,
    });
    functionCallParts.push({
      name: tc.name,
      args: tc.args,
      thoughtSignature: tc.thoughtSignature,
    });
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        google: {
          finishReason: state.finishReason,
          functionCallParts: functionCallParts.length > 0 ? functionCallParts : undefined,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens: state.inputTokens + state.outputTokens,
  };

  return {
    message,
    usage,
    stopReason: state.finishReason ?? 'STOP',
    data: structuredData,
  };
}
