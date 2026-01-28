/**
 * @fileoverview Moonshot API Message Transformers
 *
 * This module provides transformation functions for converting between the
 * Universal Provider Protocol (UPP) message format and Moonshot's Chat Completions
 * API format (OpenAI-compatible). It handles both request transformation (UPP -> Moonshot)
 * and response transformation (Moonshot -> UPP), including streaming event transformation.
 *
 * @module providers/moonshot/transform
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock, ImageBlock, VideoBlock, ReasoningBlock } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  MoonshotLLMParams,
  MoonshotRequest,
  MoonshotMessage,
  MoonshotUserContent,
  MoonshotTool,
  MoonshotResponse,
  MoonshotStreamChunk,
  MoonshotToolCall,
} from './types.ts';

/**
 * Normalizes system prompt to string.
 */
function normalizeSystem(system: string | unknown[] | undefined): string | undefined {
  if (system === undefined || system === null) return undefined;
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) {
    throw new UPPError(
      'System prompt must be a string or an array of text blocks',
      ErrorCode.InvalidRequest,
      'moonshot',
      ModalityType.LLM
    );
  }

  const texts: string[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object' || !('text' in block)) {
      throw new UPPError(
        'System prompt array must contain objects with a text field',
        ErrorCode.InvalidRequest,
        'moonshot',
        ModalityType.LLM
      );
    }
    const textValue = (block as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'System prompt text must be a string',
        ErrorCode.InvalidRequest,
        'moonshot',
        ModalityType.LLM
      );
    }
    if (textValue.length > 0) {
      texts.push(textValue);
    }
  }

  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

/**
 * Filters content blocks to only include those with a valid type property.
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transforms a UPP content block to Moonshot user content format.
 */
function transformContentBlock(block: ContentBlock): MoonshotUserContent {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      let url: string;

      if (imageBlock.source.type === 'base64') {
        url = `data:${imageBlock.mimeType};base64,${imageBlock.source.data}`;
      } else if (imageBlock.source.type === 'url') {
        url = imageBlock.source.url;
      } else if (imageBlock.source.type === 'bytes') {
        const base64 = Buffer.from(imageBlock.source.data).toString('base64');
        url = `data:${imageBlock.mimeType};base64,${base64}`;
      } else {
        throw new UPPError(
          'Unknown image source type',
          ErrorCode.InvalidRequest,
          'moonshot',
          ModalityType.LLM
        );
      }

      return {
        type: 'image_url',
        image_url: { url },
      };
    }

    case 'video': {
      const videoBlock = block as VideoBlock;
      const base64 = Buffer.from(videoBlock.data).toString('base64');
      const url = `data:${videoBlock.mimeType};base64,${base64}`;

      return {
        type: 'video_url',
        video_url: { url },
      };
    }

    case 'document':
      throw new UPPError(
        'Moonshot does not support inline document blocks. Use the /v1/files API to upload documents first.',
        ErrorCode.InvalidRequest,
        'moonshot',
        ModalityType.LLM
      );

    case 'audio':
      throw new UPPError(
        'Moonshot does not support audio input',
        ErrorCode.InvalidRequest,
        'moonshot',
        ModalityType.LLM
      );

    default:
      throw new UPPError(
        `Unsupported content type: ${block.type}`,
        ErrorCode.InvalidRequest,
        'moonshot',
        ModalityType.LLM
      );
  }
}

/**
 * Transforms a single UPP message to Moonshot format.
 */
function transformMessage(message: Message): MoonshotMessage | null {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    if (validContent.length === 1 && validContent[0]?.type === 'text') {
      return {
        role: 'user',
        content: (validContent[0] as TextBlock).text,
      };
    }
    return {
      role: 'user',
      content: validContent.map(transformContentBlock),
    };
  }

  if (isAssistantMessage(message)) {
    const validContent = filterValidContent(message.content);
    const textContent = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    // Extract reasoning content from metadata or content blocks
    const moonshotMeta = message.metadata?.moonshot as { reasoning_content?: string } | undefined;
    let reasoningContent = moonshotMeta?.reasoning_content;

    // Also check for ReasoningBlock in content if not in metadata
    if (!reasoningContent) {
      const reasoningBlocks = validContent.filter(
        (c): c is ReasoningBlock => c.type === 'reasoning'
      );
      if (reasoningBlocks.length > 0) {
        reasoningContent = reasoningBlocks.map((b) => b.text).join('\n');
      }
    }

    const assistantMessage: MoonshotMessage = {
      role: 'assistant',
      content: textContent || null,
    };

    // Include reasoning_content if present (required for tool call messages)
    if (reasoningContent) {
      (assistantMessage as { reasoning_content?: string }).reasoning_content = reasoningContent;
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      (assistantMessage as { tool_calls?: MoonshotToolCall[] }).tool_calls =
        message.toolCalls.map((call) => ({
          id: call.toolCallId,
          type: 'function' as const,
          function: {
            name: call.toolName,
            arguments: JSON.stringify(call.arguments),
          },
        }));
    }

    return assistantMessage;
  }

  if (isToolResultMessage(message)) {
    const results = message.results.map((result) => ({
      role: 'tool' as const,
      tool_call_id: result.toolCallId,
      content:
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
    }));

    return results[0] ?? null;
  }

  return null;
}

/**
 * Transforms tool result messages into multiple Moonshot tool messages.
 */
export function transformToolResults(message: Message): MoonshotMessage[] {
  if (!isToolResultMessage(message)) {
    const single = transformMessage(message);
    return single ? [single] : [];
  }

  return message.results.map((result) => ({
    role: 'tool' as const,
    tool_call_id: result.toolCallId,
    content:
      typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result),
  }));
}

/**
 * Transforms UPP messages to Moonshot message format.
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt
 * @returns Array of Moonshot-formatted messages
 */
function transformMessages(
  messages: Message[],
  system?: string | unknown[]
): MoonshotMessage[] {
  const result: MoonshotMessage[] = [];
  const normalizedSystem = normalizeSystem(system);

  if (normalizedSystem) {
    result.push({
      role: 'system',
      content: normalizedSystem,
    });
  }

  for (const message of messages) {
    if (isToolResultMessage(message)) {
      const toolMessages = transformToolResults(message);
      result.push(...toolMessages);
    } else {
      const transformed = transformMessage(message);
      if (transformed) {
        result.push(transformed);
      }
    }
  }

  return result;
}

/**
 * Extracts Moonshot-specific options from tool metadata.
 */
function extractToolOptions(tool: Tool): { strict?: boolean } {
  const moonshotMeta = tool.metadata?.moonshot as { strict?: boolean } | undefined;
  return { strict: moonshotMeta?.strict };
}

/**
 * Transforms a UPP tool definition to Moonshot function tool format.
 */
function transformTool(tool: Tool): MoonshotTool {
  const { strict } = extractToolOptions(tool);

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
        ...(tool.parameters.additionalProperties !== undefined
          ? { additionalProperties: tool.parameters.additionalProperties }
          : {}),
      },
      ...(strict !== undefined ? { strict } : {}),
    },
  };
}

/**
 * Transforms a UPP LLM request into Moonshot Chat Completions API format.
 *
 * @param request - The UPP LLM request containing messages, tools, and configuration
 * @param modelId - The Moonshot model identifier (e.g., 'kimi-k2.5')
 * @returns A Moonshot Chat Completions API request body
 */
export function transformRequest(
  request: LLMRequest<MoonshotLLMParams>,
  modelId: string
): MoonshotRequest {
  const params = request.params ?? ({} as MoonshotLLMParams);

  // Extract builtin tools from params before spreading
  const { tools: paramsTools, ...restParams } = params;

  const moonshotRequest: MoonshotRequest = {
    ...restParams,
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  // Combine builtin tools from params with transformed UPP tools
  const allTools: MoonshotTool[] = [];

  // Add builtin tools from params (already in Moonshot format)
  if (paramsTools && paramsTools.length > 0) {
    allTools.push(...paramsTools);
  }

  // Transform and add UPP tools from request.tools
  if (request.tools && request.tools.length > 0) {
    allTools.push(...request.tools.map(transformTool));
  }

  if (allTools.length > 0) {
    moonshotRequest.tools = allTools;
  }

  if (request.structure) {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: request.structure.properties,
      required: request.structure.required,
      ...(request.structure.additionalProperties !== undefined
        ? { additionalProperties: request.structure.additionalProperties }
        : { additionalProperties: false }),
    };
    if (request.structure.description) {
      schema.description = request.structure.description;
    }

    moonshotRequest.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return moonshotRequest;
}

/**
 * Transforms a Moonshot response to UPP LLMResponse format.
 */
export function transformResponse(data: MoonshotResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new UPPError(
      'No choices in Moonshot response',
      ErrorCode.InvalidResponse,
      'moonshot',
      ModalityType.LLM
    );
  }

  const contentBlocks: (TextBlock | ReasoningBlock)[] = [];
  let structuredData: unknown;

  if (choice.message.reasoning_content) {
    contentBlocks.push({ type: 'reasoning', text: choice.message.reasoning_content });
  }

  if (choice.message.content) {
    contentBlocks.push({ type: 'text', text: choice.message.content });
    try {
      structuredData = JSON.parse(choice.message.content);
    } catch {
      // Not JSON - expected for non-structured responses
    }
  }

  const toolCalls: ToolCall[] = [];
  if (choice.message.tool_calls) {
    for (const call of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Invalid JSON - use empty object
      }
      toolCalls.push({
        toolCallId: call.id,
        toolName: call.function.name,
        arguments: args,
      });
    }
  }

  const message = new AssistantMessage(
    contentBlocks,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: data.id || generateId(),
      metadata: {
        moonshot: {
          model: data.model,
          finish_reason: choice.finish_reason,
          system_fingerprint: data.system_fingerprint,
          reasoning_content: choice.message.reasoning_content ?? undefined,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
    cacheReadTokens: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };

  let stopReason = 'end_turn';
  switch (choice.finish_reason) {
    case 'stop':
      stopReason = 'end_turn';
      break;
    case 'length':
      stopReason = 'max_tokens';
      break;
    case 'tool_calls':
      stopReason = 'tool_use';
      break;
    case 'content_filter':
      stopReason = 'content_filter';
      break;
  }

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}

/**
 * Mutable state object for accumulating data during streaming responses.
 */
export interface MoonshotStreamState {
  /** Response ID from the first chunk */
  id: string;
  /** Model identifier */
  model: string;
  /** Accumulated text content */
  text: string;
  /** Accumulated reasoning content (thinking traces) */
  reasoningText: string;
  /** Map of tool call index to accumulated tool call data */
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  /** The finish reason when streaming completes */
  finishReason: string | null;
  /** Input token count (from usage chunk) */
  inputTokens: number;
  /** Output token count (from usage chunk) */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
}

/**
 * Creates a fresh stream state object for a new streaming session.
 */
export function createStreamState(): MoonshotStreamState {
  return {
    id: '',
    model: '',
    text: '',
    reasoningText: '',
    toolCalls: new Map(),
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };
}

/**
 * Transforms a Moonshot streaming chunk into UPP stream events.
 */
export function transformStreamEvent(
  chunk: MoonshotStreamChunk,
  state: MoonshotStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (chunk.id && !state.id) {
    state.id = chunk.id;
    events.push({ type: StreamEventType.MessageStart, index: 0, delta: {} });
  }
  if (chunk.model) {
    state.model = chunk.model;
  }

  const choice = chunk.choices[0];
  if (choice) {
    if (choice.delta.reasoning_content) {
      state.reasoningText += choice.delta.reasoning_content;
      events.push({
        type: StreamEventType.ReasoningDelta,
        index: 0,
        delta: { text: choice.delta.reasoning_content },
      });
    }

    if (choice.delta.content) {
      state.text += choice.delta.content;
      events.push({
        type: StreamEventType.TextDelta,
        index: 0,
        delta: { text: choice.delta.content },
      });
    }

    if (choice.delta.tool_calls) {
      for (const toolCallDelta of choice.delta.tool_calls) {
        const index = toolCallDelta.index;
        let toolCall = state.toolCalls.get(index);

        if (!toolCall) {
          toolCall = { id: '', name: '', arguments: '' };
          state.toolCalls.set(index, toolCall);
        }

        if (toolCallDelta.id) {
          toolCall.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          toolCall.name = toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          toolCall.arguments += toolCallDelta.function.arguments;
          events.push({
            type: StreamEventType.ToolCallDelta,
            index: index,
            delta: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              argumentsJson: toolCallDelta.function.arguments,
            },
          });
        }
      }
    }

    if (choice.finish_reason) {
      state.finishReason = choice.finish_reason;
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
    }
  }

  if (chunk.usage) {
    state.inputTokens = chunk.usage.prompt_tokens;
    state.outputTokens = chunk.usage.completion_tokens;
    state.cacheReadTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
  }

  return events;
}

/**
 * Builds a complete LLMResponse from accumulated streaming state.
 */
export function buildResponseFromState(state: MoonshotStreamState): LLMResponse {
  const contentBlocks: (TextBlock | ReasoningBlock)[] = [];
  let structuredData: unknown;

  if (state.reasoningText) {
    contentBlocks.push({ type: 'reasoning', text: state.reasoningText });
  }

  if (state.text) {
    contentBlocks.push({ type: 'text', text: state.text });
    try {
      structuredData = JSON.parse(state.text);
    } catch {
      // Not JSON - expected for non-structured responses
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON - use empty object
      }
    }
    toolCalls.push({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: args,
    });
  }

  const messageId = state.id || generateId();
  const message = new AssistantMessage(
    contentBlocks,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: messageId,
      metadata: {
        moonshot: {
          model: state.model,
          finish_reason: state.finishReason,
          reasoning_content: state.reasoningText || undefined,
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

  let stopReason = 'end_turn';
  switch (state.finishReason) {
    case 'stop':
      stopReason = 'end_turn';
      break;
    case 'length':
      stopReason = 'max_tokens';
      break;
    case 'tool_calls':
      stopReason = 'tool_use';
      break;
    case 'content_filter':
      stopReason = 'content_filter';
      break;
  }

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}
