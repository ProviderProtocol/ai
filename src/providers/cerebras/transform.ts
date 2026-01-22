/**
 * @fileoverview Cerebras API Message Transformers
 *
 * This module provides transformation functions for converting between the
 * Universal Provider Protocol (UPP) message format and Cerebras's Chat Completions
 * API format (OpenAI-compatible). It handles both request transformation (UPP -> Cerebras)
 * and response transformation (Cerebras -> UPP), including streaming event transformation.
 *
 * @module providers/cerebras/transform
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  CerebrasLLMParams,
  CerebrasRequest,
  CerebrasMessage,
  CerebrasUserContent,
  CerebrasTool,
  CerebrasResponse,
  CerebrasStreamChunk,
  CerebrasToolCall,
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
      'cerebras',
      ModalityType.LLM
    );
  }

  const texts: string[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object' || !('text' in block)) {
      throw new UPPError(
        'System prompt array must contain objects with a text field',
        ErrorCode.InvalidRequest,
        'cerebras',
        ModalityType.LLM
      );
    }
    const textValue = (block as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'System prompt text must be a string',
        ErrorCode.InvalidRequest,
        'cerebras',
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
 * Transforms a UPP content block to Cerebras user content format.
 */
function transformContentBlock(block: ContentBlock): CerebrasUserContent {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };

    case 'image':
      throw new UPPError(
        'Cerebras does not support image input',
        ErrorCode.InvalidRequest,
        'cerebras',
        ModalityType.LLM
      );

    case 'document':
      throw new UPPError(
        'Cerebras does not support document input',
        ErrorCode.InvalidRequest,
        'cerebras',
        ModalityType.LLM
      );

    default:
      throw new UPPError(
        `Unsupported content type: ${block.type}`,
        ErrorCode.InvalidRequest,
        'cerebras',
        ModalityType.LLM
      );
  }
}

/**
 * Transforms a single UPP message to Cerebras format.
 */
function transformMessage(message: Message): CerebrasMessage | null {
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

    const assistantMessage: CerebrasMessage = {
      role: 'assistant',
      content: textContent || null,
    };

    if (message.toolCalls && message.toolCalls.length > 0) {
      (assistantMessage as { tool_calls?: CerebrasToolCall[] }).tool_calls =
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
 * Transforms tool result messages into multiple Cerebras tool messages.
 */
export function transformToolResults(message: Message): CerebrasMessage[] {
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
 * Transforms UPP messages to Cerebras message format.
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt
 * @returns Array of Cerebras-formatted messages
 */
function transformMessages(
  messages: Message[],
  system?: string | unknown[]
): CerebrasMessage[] {
  const result: CerebrasMessage[] = [];
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
 * Extracts Cerebras-specific options from tool metadata.
 */
function extractToolOptions(tool: Tool): { strict?: boolean } {
  const cerebrasMeta = tool.metadata?.cerebras as { strict?: boolean } | undefined;
  return { strict: cerebrasMeta?.strict };
}

/**
 * Transforms a UPP tool definition to Cerebras function tool format.
 */
function transformTool(tool: Tool): CerebrasTool {
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
 * Transforms a UPP LLM request into Cerebras Chat Completions API format.
 *
 * @param request - The UPP LLM request containing messages, tools, and configuration
 * @param modelId - The Cerebras model identifier (e.g., 'llama-3.3-70b')
 * @returns A Cerebras Chat Completions API request body
 */
export function transformRequest(
  request: LLMRequest<CerebrasLLMParams>,
  modelId: string
): CerebrasRequest {
  const params = request.params ?? ({} as CerebrasLLMParams);

  const cerebrasRequest: CerebrasRequest = {
    ...params,
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  if (request.tools && request.tools.length > 0) {
    cerebrasRequest.tools = request.tools.map(transformTool);
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

    cerebrasRequest.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return cerebrasRequest;
}

/**
 * Transforms a Cerebras response to UPP LLMResponse format.
 */
export function transformResponse(data: CerebrasResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new UPPError(
      'No choices in Cerebras response',
      ErrorCode.InvalidResponse,
      'cerebras',
      ModalityType.LLM
    );
  }

  const textContent: TextBlock[] = [];
  let structuredData: unknown;
  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
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
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: data.id || generateId(),
      metadata: {
        cerebras: {
          model: data.model,
          finish_reason: choice.finish_reason,
          system_fingerprint: data.system_fingerprint,
          reasoning: choice.message.reasoning,
          time_info: data.time_info,
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
export interface CerebrasStreamState {
  /** Response ID from the first chunk */
  id: string;
  /** Model identifier */
  model: string;
  /** Accumulated text content */
  text: string;
  /** Accumulated reasoning content */
  reasoning: string;
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
  /** Time info from the response */
  timeInfo?: {
    queue_time?: number;
    prompt_time?: number;
    completion_time?: number;
    total_time?: number;
  };
}

/**
 * Creates a fresh stream state object for a new streaming session.
 */
export function createStreamState(): CerebrasStreamState {
  return {
    id: '',
    model: '',
    text: '',
    reasoning: '',
    toolCalls: new Map(),
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };
}

/**
 * Transforms a Cerebras streaming chunk into UPP stream events.
 */
export function transformStreamEvent(
  chunk: CerebrasStreamChunk,
  state: CerebrasStreamState
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
    if (choice.delta.content) {
      state.text += choice.delta.content;
      events.push({
        type: StreamEventType.TextDelta,
        index: 0,
        delta: { text: choice.delta.content },
      });
    }

    if (choice.delta.reasoning) {
      state.reasoning += choice.delta.reasoning;
      events.push({
        type: StreamEventType.ReasoningDelta,
        index: 0,
        delta: { text: choice.delta.reasoning },
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

  if (chunk.time_info) {
    state.timeInfo = chunk.time_info;
  }

  return events;
}

/**
 * Builds a complete LLMResponse from accumulated streaming state.
 */
export function buildResponseFromState(state: CerebrasStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  let structuredData: unknown;
  if (state.text) {
    textContent.push({ type: 'text', text: state.text });
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
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: messageId,
      metadata: {
        cerebras: {
          model: state.model,
          finish_reason: state.finishReason,
          reasoning: state.reasoning || undefined,
          time_info: state.timeInfo,
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
