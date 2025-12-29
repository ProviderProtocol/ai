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
 * Transform UPP request to Google format
 */
export function transformRequest<TParams extends GoogleLLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): GoogleRequest {
  const params = (request.params ?? {}) as GoogleLLMParams;

  const googleRequest: GoogleRequest = {
    contents: transformMessages(request.messages),
  };

  // System instruction (separate from contents in Google)
  if (request.system) {
    googleRequest.systemInstruction = {
      parts: [{ text: request.system }],
    };
  }

  // Generation config
  const generationConfig: NonNullable<GoogleRequest['generationConfig']> = {};

  if (params.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = params.maxOutputTokens;
  }
  if (params.temperature !== undefined) {
    generationConfig.temperature = params.temperature;
  }
  if (params.topP !== undefined) {
    generationConfig.topP = params.topP;
  }
  if (params.topK !== undefined) {
    generationConfig.topK = params.topK;
  }
  if (params.stopSequences !== undefined) {
    generationConfig.stopSequences = params.stopSequences;
  }
  if (params.candidateCount !== undefined) {
    generationConfig.candidateCount = params.candidateCount;
  }
  if (params.responseMimeType !== undefined) {
    generationConfig.responseMimeType = params.responseMimeType;
  }
  if (params.responseSchema !== undefined) {
    generationConfig.responseSchema = params.responseSchema as Record<string, unknown>;
  }
  if (params.presencePenalty !== undefined) {
    generationConfig.presencePenalty = params.presencePenalty;
  }
  if (params.frequencyPenalty !== undefined) {
    generationConfig.frequencyPenalty = params.frequencyPenalty;
  }
  if (params.seed !== undefined) {
    generationConfig.seed = params.seed;
  }
  if (params.responseLogprobs !== undefined) {
    generationConfig.responseLogprobs = params.responseLogprobs;
  }
  if (params.logprobs !== undefined) {
    generationConfig.logprobs = params.logprobs;
  }
  if (params.audioTimestamp !== undefined) {
    generationConfig.audioTimestamp = params.audioTimestamp;
  }
  if (params.thinkingConfig !== undefined) {
    generationConfig.thinkingConfig = params.thinkingConfig;
  }

  // Protocol-level structured output (overrides provider-specific settings)
  if (request.structure) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = request.structure as unknown as Record<string, unknown>;
  }

  if (Object.keys(generationConfig).length > 0) {
    googleRequest.generationConfig = generationConfig;
  }

  // Tools
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
 * Filter to only valid content blocks with a type property
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transform UPP Messages to Google contents
 */
function transformMessages(messages: Message[]): GoogleContent[] {
  const contents: GoogleContent[] = [];

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      const validContent = filterValidContent(msg.content);
      const parts = validContent.map(transformContentBlock);
      // Google requires at least one part - add placeholder if empty
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

      // Add function calls - use stored parts with thought signatures if available
      const googleMeta = msg.metadata?.google as {
        functionCallParts?: Array<{
          name: string;
          args: Record<string, unknown>;
          thoughtSignature?: string;
        }>;
      } | undefined;

      if (googleMeta?.functionCallParts && googleMeta.functionCallParts.length > 0) {
        // Use stored function call parts with thought signatures
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
        // Fallback: reconstruct from tool calls (no thought signatures)
        for (const call of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: call.toolName,
              args: call.arguments,
            },
          });
        }
      }

      // Google requires at least one part - add placeholder if empty
      if (parts.length === 0) {
        parts.push({ text: '' });
      }

      contents.push({
        role: 'model',
        parts,
      });
    } else if (isToolResultMessage(msg)) {
      // Function results are sent as user messages in Google
      contents.push({
        role: 'user',
        parts: msg.results.map((result) => ({
          functionResponse: {
            name: result.toolCallId, // Google uses the function name, but we store it in toolCallId
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
 * Transform a content block to Google format
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
 * Transform a UPP Tool to Google format
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
 * Transform Google response to UPP LLMResponse
 */
export function transformResponse(data: GoogleResponse): LLMResponse {
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('No candidates in Google response');
  }

  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;
  // Store original function call parts with thought signatures for echoing back
  const functionCallParts: Array<{
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  for (const part of candidate.content.parts) {
    if ('text' in part) {
      textContent.push({ type: 'text', text: part.text });
      // Try to parse as JSON for structured output (native JSON mode)
      if (structuredData === undefined) {
        try {
          structuredData = JSON.parse(part.text);
        } catch {
          // Not valid JSON - that's fine, might not be structured output
        }
      }
    } else if ('functionCall' in part) {
      const fc = part as GoogleFunctionCallPart;
      toolCalls.push({
        toolCallId: fc.functionCall.name, // Google doesn't have call IDs, use name
        toolName: fc.functionCall.name,
        arguments: fc.functionCall.args,
      });
      // Store the full part including thought signature
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
          // Store function call parts with thought signatures for multi-turn
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
 * State for accumulating streaming response
 */
export interface StreamState {
  content: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
  isFirstChunk: boolean;
}

/**
 * Create initial stream state
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
 * Transform Google stream chunk to UPP StreamEvents
 */
export function transformStreamChunk(
  chunk: GoogleStreamChunk,
  state: StreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  // First chunk - emit message start
  if (state.isFirstChunk) {
    events.push({ type: 'message_start', index: 0, delta: {} });
    state.isFirstChunk = false;
  }

  // Usage metadata
  if (chunk.usageMetadata) {
    state.inputTokens = chunk.usageMetadata.promptTokenCount;
    state.outputTokens = chunk.usageMetadata.candidatesTokenCount;
  }

  const candidate = chunk.candidates?.[0];
  if (!candidate) {
    return events;
  }

  // Process parts
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
      // Store with thought signature for echoing back
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

  // Finish reason
  if (candidate.finishReason) {
    state.finishReason = candidate.finishReason;
    events.push({ type: 'message_stop', index: 0, delta: {} });
  }

  return events;
}

/**
 * Build LLMResponse from accumulated stream state
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
    // Try to parse as JSON for structured output (native JSON mode)
    try {
      structuredData = JSON.parse(state.content);
    } catch {
      // Not valid JSON - that's fine, might not be structured output
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
          // Store function call parts with thought signatures for multi-turn
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
