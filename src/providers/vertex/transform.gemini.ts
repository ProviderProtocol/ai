/**
 * @fileoverview UPP to Vertex AI Gemini message transformation utilities.
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
  VertexGeminiParams,
  VertexGeminiRequest,
  VertexGeminiContent,
  VertexGeminiPart,
  VertexGeminiTool,
  VertexGeminiResponse,
  VertexGeminiStreamChunk,
  VertexGeminiFunctionCallPart,
} from './types.ts';

/**
 * Transforms a UPP LLM request to Vertex AI Gemini format.
 */
export function transformGeminiRequest<TParams extends VertexGeminiParams>(
  request: LLMRequest<TParams>,
  _modelId: string
): VertexGeminiRequest {
  const params = (request.params ?? {}) as VertexGeminiParams;
  const { toolConfig, ...generationParams } = params;

  const geminiRequest: VertexGeminiRequest = {
    contents: request.messages.map(transformMessage),
  };

  if (request.system) {
    if (typeof request.system === 'string') {
      geminiRequest.systemInstruction = {
        parts: [{ text: request.system }],
      };
    } else if (Array.isArray(request.system)) {
      geminiRequest.systemInstruction = {
        parts: request.system as VertexGeminiPart[],
      };
    }
  }

  const generationConfig: VertexGeminiRequest['generationConfig'] = {
    ...generationParams,
  };

  if (Object.keys(generationConfig).length > 0) {
    geminiRequest.generationConfig = generationConfig;
  }

  if (request.tools && request.tools.length > 0) {
    geminiRequest.tools = [{
      functionDeclarations: request.tools.map(transformTool),
    }];
  }

  if (request.structure) {
    const structuredTool: VertexGeminiTool = {
      functionDeclarations: [{
        name: 'json_response',
        description: 'Return the response in the specified JSON format.',
        parameters: {
          type: 'object',
          properties: request.structure.properties,
          required: request.structure.required,
        },
      }],
    };

    geminiRequest.tools = [...(geminiRequest.tools ?? []), structuredTool];
  }

  if (toolConfig) {
    geminiRequest.toolConfig = toolConfig;
  }

  return geminiRequest;
}

function transformMessage(message: Message): VertexGeminiContent {
  if (isUserMessage(message)) {
    return {
      role: 'user',
      parts: message.content.map(transformContentBlock).filter((p): p is VertexGeminiPart => p !== null),
    };
  }

  if (isAssistantMessage(message)) {
    const parts: VertexGeminiPart[] = message.content
      .map(transformContentBlock)
      .filter((p): p is VertexGeminiPart => p !== null);

    // Check for functionCallParts with thoughtSignature in metadata (for multi-turn tool calls)
    const vertexMeta = message.metadata?.vertex as {
      functionCallParts?: Array<{
        name: string;
        args: Record<string, unknown>;
        thoughtSignature?: string;
      }>;
    } | undefined;

    if (vertexMeta?.functionCallParts && vertexMeta.functionCallParts.length > 0) {
      for (const fc of vertexMeta.functionCallParts) {
        const part: VertexGeminiFunctionCallPart = {
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
    } else if (message.toolCalls) {
      for (const call of message.toolCalls) {
        parts.push({
          functionCall: {
            name: call.toolName,
            args: call.arguments as Record<string, unknown>,
          },
        });
      }
    }

    return { role: 'model', parts };
  }

  if (isToolResultMessage(message)) {
    return {
      role: 'user',
      parts: message.results.map((result) => ({
        functionResponse: {
          name: extractToolName(result.toolCallId),
          response: { result: result.result },
        },
      })),
    };
  }

  throw new Error(`Unknown message type: ${message.type}`);
}

/**
 * Extracts tool name from toolCallId.
 * For Gemini, we encode the tool name in the toolCallId as "name:id".
 * Falls back to the toolCallId itself if no separator found.
 */
function extractToolName(toolCallId: string): string {
  const parts = toolCallId.split(':');
  return parts.length > 1 ? parts[0]! : toolCallId;
}

function transformContentBlock(block: ContentBlock): VertexGeminiPart | null {
  switch (block.type) {
    case 'text':
      return { text: (block as TextBlock).text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      if (imageBlock.source.type === 'base64') {
        return {
          inlineData: {
            mimeType: imageBlock.mimeType,
            data: imageBlock.source.data,
          },
        };
      }
      if (imageBlock.source.type === 'bytes') {
        const base64 = btoa(
          Array.from(imageBlock.source.data)
            .map((b) => String.fromCharCode(b))
            .join('')
        );
        return {
          inlineData: {
            mimeType: imageBlock.mimeType,
            data: base64,
          },
        };
      }
      return null;
    }

    default:
      return null;
  }
}

function transformTool(tool: Tool): VertexGeminiTool['functionDeclarations'][number] {
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
 * Transforms a Vertex AI Gemini response to UPP format.
 */
export function transformGeminiResponse(data: VertexGeminiResponse): LLMResponse {
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('No candidates in Gemini response');
  }

  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;
  const functionCallParts: Array<{
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    if ('text' in part) {
      textContent.push({ type: 'text', text: part.text });
    } else if ('functionCall' in part) {
      const fc = part as VertexGeminiFunctionCallPart;
      const call = fc.functionCall;
      if (call.name === 'json_response') {
        structuredData = call.args;
      }
      toolCalls.push({
        toolCallId: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        toolName: call.name,
        arguments: call.args,
      });
      functionCallParts.push({
        name: call.name,
        args: call.args,
        thoughtSignature: fc.thoughtSignature,
      });
    }
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        vertex: {
          finishReason: candidate.finishReason,
          index: candidate.index,
          functionCallParts: functionCallParts.length > 0 ? functionCallParts : undefined,
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

  let stopReason = 'end_turn';
  if (candidate.finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
  else if (candidate.finishReason === 'TOOL_USE') stopReason = 'tool_use';
  else if (candidate.finishReason === 'SAFETY') stopReason = 'content_filter';

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}

/**
 * Stream state for accumulating Gemini streaming responses.
 */
export interface GeminiStreamState {
  content: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }>;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isFirstChunk: boolean;
}

export function createGeminiStreamState(): GeminiStreamState {
  return {
    content: '',
    toolCalls: [],
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    isFirstChunk: true,
  };
}

/**
 * Transforms a Gemini stream chunk to UPP stream events.
 */
export function transformGeminiStreamChunk(
  chunk: VertexGeminiStreamChunk,
  state: GeminiStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (state.isFirstChunk) {
    events.push({ type: 'message_start', index: 0, delta: {} });
    state.isFirstChunk = false;
  }

  if (chunk.usageMetadata) {
    state.inputTokens = chunk.usageMetadata.promptTokenCount;
    state.outputTokens = chunk.usageMetadata.candidatesTokenCount;
    state.totalTokens = chunk.usageMetadata.totalTokenCount;
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
      const fc = part as VertexGeminiFunctionCallPart;
      const call = fc.functionCall;
      state.toolCalls.push({
        name: call.name,
        args: call.args,
        thoughtSignature: fc.thoughtSignature,
      });
      events.push({
        type: 'tool_call_delta',
        index: state.toolCalls.length - 1,
        delta: {
          toolCallId: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          toolName: call.name,
          argumentsJson: JSON.stringify(call.args),
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
 * Builds an LLMResponse from accumulated stream state.
 */
export function buildGeminiResponseFromState(state: GeminiStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  if (state.content) {
    textContent.push({ type: 'text', text: state.content });
  }

  const functionCallParts: Array<{
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  }> = [];

  for (const tc of state.toolCalls) {
    if (tc.name === 'json_response') {
      structuredData = tc.args;
    }
    toolCalls.push({
      toolCallId: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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
        vertex: {
          finishReason: state.finishReason,
          functionCallParts: functionCallParts.length > 0 ? functionCallParts : undefined,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens: state.totalTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  let stopReason = 'end_turn';
  if (state.finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
  else if (state.finishReason === 'TOOL_USE') stopReason = 'tool_use';
  else if (state.finishReason === 'SAFETY') stopReason = 'content_filter';

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}
