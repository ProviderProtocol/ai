/**
 * @fileoverview OpenResponses API Message Transformers
 *
 * This module provides transformation functions for converting between the
 * Universal Provider Protocol (UPP) message format and the OpenResponses API
 * format. The OpenResponses spec uses items as atomic units with defined
 * state machines and streaming updates.
 *
 * Key concepts:
 * - Uses `input` array of items instead of `messages`
 * - Function calls are separate input items
 * - Tool results use `function_call_output` items
 * - Supports multimodal inputs: text, images, files (documents), video
 *
 * @module providers/responses/transform
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type {
  ContentBlock,
  TextBlock,
  ImageBlock,
  DocumentBlock,
  VideoBlock,
  AudioBlock,
  AssistantContent,
} from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  ResponsesParams,
  ResponsesRequest,
  ResponsesInputItem,
  ResponsesContentPart,
  ResponsesFunctionTool,
  ResponsesToolUnion,
  ResponsesResponse,
  ResponsesStreamEvent,
  ResponsesReasoningOutput,
  ResponsesFunctionCallOutput,
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
      'responses',
      ModalityType.LLM
    );
  }

  const texts: string[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object' || !('text' in block)) {
      throw new UPPError(
        'System prompt array must contain objects with a text field',
        ErrorCode.InvalidRequest,
        'responses',
        ModalityType.LLM
      );
    }
    const textValue = (block as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'System prompt text must be a string',
        ErrorCode.InvalidRequest,
        'responses',
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
 * Transforms a UPP content block to OpenResponses content part format.
 * Supports text, image, document, video, and audio content types.
 */
function transformContentPart(block: ContentBlock): ResponsesContentPart {
  switch (block.type) {
    case 'text':
      return { type: 'input_text', text: block.text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      if (imageBlock.source.type === 'base64') {
        return {
          type: 'input_image',
          image_url: `data:${imageBlock.mimeType};base64,${imageBlock.source.data}`,
        };
      }

      if (imageBlock.source.type === 'url') {
        return {
          type: 'input_image',
          image_url: imageBlock.source.url,
        };
      }

      if (imageBlock.source.type === 'bytes') {
        const base64 = Buffer.from(imageBlock.source.data).toString('base64');
        return {
          type: 'input_image',
          image_url: `data:${imageBlock.mimeType};base64,${base64}`,
        };
      }

      throw new UPPError(
        'Unknown image source type',
        ErrorCode.InvalidRequest,
        'responses',
        ModalityType.LLM
      );
    }

    case 'document': {
      const documentBlock = block as DocumentBlock;

      if (documentBlock.source.type === 'base64') {
        return {
          type: 'input_file',
          filename: documentBlock.title ?? 'document',
          file_data: `data:${documentBlock.mimeType};base64,${documentBlock.source.data}`,
        };
      }

      if (documentBlock.source.type === 'url') {
        return {
          type: 'input_file',
          file_url: documentBlock.source.url,
        };
      }

      if (documentBlock.source.type === 'text') {
        const base64 = Buffer.from(documentBlock.source.data).toString('base64');
        return {
          type: 'input_file',
          filename: documentBlock.title ?? 'document.txt',
          file_data: `data:text/plain;base64,${base64}`,
        };
      }

      throw new UPPError(
        'Unknown document source type',
        ErrorCode.InvalidRequest,
        'responses',
        ModalityType.LLM
      );
    }

    case 'video': {
      const videoBlock = block as VideoBlock;
      const base64 = Buffer.from(videoBlock.data).toString('base64');
      return {
        type: 'input_video' as ResponsesContentPart['type'],
        video: `data:${videoBlock.mimeType};base64,${base64}`,
      } as ResponsesContentPart;
    }

    case 'audio': {
      const audioBlock = block as AudioBlock;
      const base64 = Buffer.from(audioBlock.data).toString('base64');
      return {
        type: 'input_file',
        filename: 'audio',
        file_data: `data:${audioBlock.mimeType};base64,${base64}`,
      };
    }

    default:
      throw new UPPError(
        `Unsupported content type: ${block.type}`,
        ErrorCode.InvalidRequest,
        'responses',
        ModalityType.LLM
      );
  }
}

/**
 * Transforms a single UPP message to OpenResponses input items.
 */
function transformMessage(message: Message): ResponsesInputItem[] {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    if (validContent.length === 1 && validContent[0]?.type === 'text') {
      return [
        {
          type: 'message',
          role: 'user',
          content: (validContent[0] as TextBlock).text,
        },
      ];
    }
    return [
      {
        type: 'message',
        role: 'user',
        content: validContent.map(transformContentPart),
      },
    ];
  }

  if (isAssistantMessage(message)) {
    const validContent = filterValidContent(message.content);
    const items: ResponsesInputItem[] = [];

    const contentParts: ResponsesContentPart[] = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c): ResponsesContentPart => ({
        type: 'output_text',
        text: c.text,
      }));

    if (contentParts.length > 0) {
      items.push({
        type: 'message',
        role: 'assistant',
        content: contentParts,
      });
    }

    const responsesMeta = message.metadata?.responses as
      | {
          functionCallItems?: Array<{ id: string; call_id: string; name: string; arguments: string }>;
          reasoningEncryptedContent?: string;
        }
      | undefined;
    const functionCallItems = responsesMeta?.functionCallItems;

    if (responsesMeta?.reasoningEncryptedContent) {
      try {
        const reasoningData = JSON.parse(responsesMeta.reasoningEncryptedContent) as {
          id: string;
          summary: Array<{ type: 'summary_text'; text: string }>;
          encrypted_content?: string;
        };
        items.push({
          type: 'reasoning',
          id: reasoningData.id,
          summary: reasoningData.summary,
          encrypted_content: reasoningData.encrypted_content,
        });
      } catch {
        // Invalid JSON - skip reasoning item
      }
    }

    if (functionCallItems && functionCallItems.length > 0) {
      for (const fc of functionCallItems) {
        items.push({
          type: 'function_call',
          id: fc.id,
          call_id: fc.call_id,
          name: fc.name,
          arguments: fc.arguments,
        });
      }
    } else if (message.toolCalls && message.toolCalls.length > 0) {
      for (const call of message.toolCalls) {
        items.push({
          type: 'function_call',
          id: `fc_${call.toolCallId}`,
          call_id: call.toolCallId,
          name: call.toolName,
          arguments: JSON.stringify(call.arguments),
        });
      }
    }

    return items;
  }

  if (isToolResultMessage(message)) {
    return message.results.map((result) => ({
      type: 'function_call_output' as const,
      call_id: result.toolCallId,
      output:
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
    }));
  }

  return [];
}

/**
 * Transforms UPP messages to OpenResponses input items.
 */
function transformInputItems(
  messages: Message[],
  system?: string | unknown[]
): ResponsesInputItem[] | string {
  const result: ResponsesInputItem[] = [];
  const normalizedSystem = normalizeSystem(system);

  if (normalizedSystem) {
    result.push({
      type: 'message',
      role: 'system',
      content: normalizedSystem,
    });
  }

  for (const message of messages) {
    const items = transformMessage(message);
    result.push(...items);
  }

  if (result.length === 1 && result[0]?.type === 'message') {
    const item = result[0] as { role?: string; content?: string | unknown[] };
    if (item.role === 'user' && typeof item.content === 'string') {
      return item.content;
    }
  }

  return result;
}

/**
 * Extracts provider-specific options from tool metadata.
 */
function extractToolOptions(tool: Tool): { strict?: boolean } {
  const meta = tool.metadata?.responses as { strict?: boolean } | undefined;
  return { strict: meta?.strict };
}

/**
 * Transforms a UPP tool definition to OpenResponses function tool format.
 */
function transformTool(tool: Tool): ResponsesFunctionTool {
  const { strict } = extractToolOptions(tool);

  return {
    type: 'function',
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
  };
}

/**
 * Transforms a UPP LLM request into OpenResponses API format.
 *
 * @param request - The UPP LLM request
 * @param modelId - The model identifier
 * @returns An OpenResponses API request body
 */
export function transformRequest(
  request: LLMRequest<ResponsesParams>,
  modelId: string
): ResponsesRequest {
  const params = request.params ?? ({} as ResponsesParams);
  const { tools: builtInTools, ...restParams } = params;

  const responsesRequest: ResponsesRequest = {
    ...restParams,
    model: modelId,
    input: transformInputItems(request.messages, request.system),
  };

  const functionTools: ResponsesToolUnion[] = request.tools?.map(transformTool) ?? [];
  const allTools: ResponsesToolUnion[] = [
    ...functionTools,
    ...(builtInTools ?? []),
  ];

  if (allTools.length > 0) {
    responsesRequest.tools = allTools;
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

    responsesRequest.text = {
      format: {
        type: 'json_schema',
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return responsesRequest;
}

/**
 * Transforms an OpenResponses API response to UPP LLMResponse format.
 */
export function transformResponse(data: ResponsesResponse): LLMResponse {
  const content: AssistantContent[] = [];
  const toolCalls: ToolCall[] = [];
  const functionCallItems: Array<{
    id: string;
    call_id: string;
    name: string;
    arguments: string;
  }> = [];
  let hadRefusal = false;
  let structuredData: unknown;
  let reasoningEncryptedContent: string | undefined;

  for (const item of data.output) {
    if (item.type === 'message') {
      const messageItem = item;
      for (const part of messageItem.content) {
        if (part.type === 'output_text') {
          content.push({ type: 'text', text: part.text });
          if (structuredData === undefined) {
            try {
              structuredData = JSON.parse(part.text);
            } catch {
              // Not JSON - expected for non-structured responses
            }
          }
        } else if (part.type === 'refusal') {
          content.push({ type: 'text', text: part.refusal });
          hadRefusal = true;
        }
      }
    } else if (item.type === 'function_call') {
      const functionCall = item as ResponsesFunctionCallOutput;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(functionCall.arguments);
      } catch {
        // Invalid JSON - use empty object
      }
      toolCalls.push({
        toolCallId: functionCall.call_id,
        toolName: functionCall.name,
        arguments: args,
      });
      functionCallItems.push({
        id: functionCall.id,
        call_id: functionCall.call_id,
        name: functionCall.name,
        arguments: functionCall.arguments,
      });
    } else if (item.type === 'reasoning') {
      const reasoningItem = item as ResponsesReasoningOutput;
      const reasoningText = reasoningItem.summary
        .filter((s): s is { type: 'summary_text'; text: string } => s.type === 'summary_text')
        .map((s) => s.text)
        .join('');
      if (reasoningText) {
        content.push({ type: 'reasoning', text: reasoningText });
      }
      reasoningEncryptedContent = JSON.stringify({
        id: reasoningItem.id,
        summary: reasoningItem.summary,
        encrypted_content: reasoningItem.encrypted_content,
      });
    }
  }

  const responseId = data.id || generateId();
  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: responseId,
      metadata: {
        responses: {
          model: data.model,
          status: data.status,
          response_id: responseId,
          functionCallItems:
            functionCallItems.length > 0 ? functionCallItems : undefined,
          reasoningEncryptedContent,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: data.usage.total_tokens,
    cacheReadTokens: data.usage.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };

  let stopReason = 'end_turn';
  if (data.status === 'completed') {
    stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
  } else if (data.status === 'incomplete') {
    stopReason = data.incomplete_details?.reason === 'max_output_tokens'
      ? 'max_tokens'
      : 'end_turn';
  } else if (data.status === 'failed') {
    stopReason = 'error';
  }
  if (hadRefusal && stopReason !== 'error') {
    stopReason = 'content_filter';
  }

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}

// ============================================
// Streaming State Management
// ============================================

/**
 * Mutable state for accumulating streaming data.
 */
export interface StreamState {
  id: string;
  model: string;
  textByIndex: Map<number, string>;
  reasoningByIndex: Map<number, string>;
  toolCalls: Map<
    number,
    { itemId?: string; callId?: string; name?: string; arguments: string }
  >;
  status: string;
  incompleteReason?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  hadRefusal: boolean;
  reasoningEncryptedContent?: string;
}

/**
 * Creates a fresh stream state object.
 */
export function createStreamState(): StreamState {
  return {
    id: '',
    model: '',
    textByIndex: new Map(),
    reasoningByIndex: new Map(),
    toolCalls: new Map(),
    status: 'in_progress',
    incompleteReason: undefined,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transforms an OpenResponses streaming event into UPP stream events.
 */
export function transformStreamEvent(
  event: ResponsesStreamEvent,
  state: StreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  const updateFromResponse = (response: ResponsesResponse): void => {
    state.id = response.id || state.id;
    state.model = response.model || state.model;
    state.status = response.status;
    if (response.incomplete_details?.reason) {
      state.incompleteReason = response.incomplete_details.reason;
    } else if (response.status !== 'incomplete') {
      state.incompleteReason = undefined;
    }
    if (response.usage) {
      state.inputTokens = response.usage.input_tokens;
      state.outputTokens = response.usage.output_tokens;
      state.cacheReadTokens = response.usage.input_tokens_details?.cached_tokens ?? 0;
    }
  };

  switch (event.type) {
    case 'response.created':
      updateFromResponse(event.response);
      events.push({ type: StreamEventType.MessageStart, index: 0, delta: {} });
      break;

    case 'response.queued':
    case 'response.in_progress':
      updateFromResponse(event.response);
      break;

    case 'response.completed':
      updateFromResponse(event.response);
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
      break;

    case 'response.failed':
    case 'response.incomplete':
      updateFromResponse(event.response);
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
      break;

    case 'response.output_item.added':
      if (event.item.type === 'function_call') {
        const functionCall = event.item as ResponsesFunctionCallOutput;
        const existing = state.toolCalls.get(event.output_index) ?? {
          arguments: '',
        };
        existing.itemId = functionCall.id;
        existing.callId = functionCall.call_id;
        existing.name = functionCall.name;
        if (functionCall.arguments) {
          existing.arguments = functionCall.arguments;
        }
        state.toolCalls.set(event.output_index, existing);
      }
      events.push({
        type: StreamEventType.ContentBlockStart,
        index: event.output_index,
        delta: {},
      });
      break;

    case 'response.output_item.done':
      if (event.item.type === 'function_call') {
        const functionCall = event.item as ResponsesFunctionCallOutput;
        const existing = state.toolCalls.get(event.output_index) ?? {
          arguments: '',
        };
        existing.itemId = functionCall.id;
        existing.callId = functionCall.call_id;
        existing.name = functionCall.name;
        if (functionCall.arguments) {
          existing.arguments = functionCall.arguments;
        }
        state.toolCalls.set(event.output_index, existing);
      } else if (event.item.type === 'reasoning') {
        const reasoningItem = event.item as ResponsesReasoningOutput;
        state.reasoningEncryptedContent = JSON.stringify({
          id: reasoningItem.id,
          summary: reasoningItem.summary,
          encrypted_content: reasoningItem.encrypted_content,
        });
      }
      events.push({
        type: StreamEventType.ContentBlockStop,
        index: event.output_index,
        delta: {},
      });
      break;

    case 'response.output_text.delta': {
      const currentText = state.textByIndex.get(event.output_index) ?? '';
      state.textByIndex.set(event.output_index, currentText + event.delta);
      events.push({
        type: StreamEventType.TextDelta,
        index: event.output_index,
        delta: { text: event.delta },
      });
      break;
    }

    case 'response.output_text.done':
      state.textByIndex.set(event.output_index, event.text);
      break;

    case 'response.refusal.delta': {
      state.hadRefusal = true;
      const currentRefusal = state.textByIndex.get(event.output_index) ?? '';
      state.textByIndex.set(event.output_index, currentRefusal + event.delta);
      events.push({
        type: StreamEventType.TextDelta,
        index: event.output_index,
        delta: { text: event.delta },
      });
      break;
    }

    case 'response.refusal.done':
      state.hadRefusal = true;
      state.textByIndex.set(event.output_index, event.refusal);
      break;

    case 'response.function_call_arguments.delta': {
      let toolCall = state.toolCalls.get(event.output_index);
      if (!toolCall) {
        toolCall = { arguments: '' };
        state.toolCalls.set(event.output_index, toolCall);
      }
      if (event.item_id && !toolCall.itemId) {
        toolCall.itemId = event.item_id;
      }
      if (event.call_id && !toolCall.callId) {
        toolCall.callId = event.call_id;
      }
      toolCall.arguments += event.delta;
      events.push({
        type: StreamEventType.ToolCallDelta,
        index: event.output_index,
        delta: {
          toolCallId: toolCall.callId ?? toolCall.itemId ?? '',
          toolName: toolCall.name,
          argumentsJson: event.delta,
        },
      });
      break;
    }

    case 'response.function_call_arguments.done': {
      let toolCall = state.toolCalls.get(event.output_index);
      if (!toolCall) {
        toolCall = { arguments: '' };
        state.toolCalls.set(event.output_index, toolCall);
      }
      if (event.item_id) {
        toolCall.itemId = event.item_id;
      }
      if (event.call_id) {
        toolCall.callId = event.call_id;
      }
      toolCall.name = event.name;
      toolCall.arguments = event.arguments;
      break;
    }

    case 'response.reasoning_summary_text.delta': {
      const currentReasoning = state.reasoningByIndex.get(event.output_index) ?? '';
      state.reasoningByIndex.set(event.output_index, currentReasoning + event.delta);
      events.push({
        type: StreamEventType.ReasoningDelta,
        index: event.output_index,
        delta: { text: event.delta },
      });
      break;
    }

    case 'response.reasoning_summary_text.done':
      state.reasoningByIndex.set(event.output_index, event.text);
      break;

    case 'error':
      break;

    default:
      break;
  }

  return events;
}

/**
 * Builds a complete LLMResponse from accumulated streaming state.
 */
export function buildResponseFromState(state: StreamState): LLMResponse {
  const content: AssistantContent[] = [];
  let structuredData: unknown;

  const orderedReasoningEntries = [...state.reasoningByIndex.entries()].sort(
    ([leftIndex], [rightIndex]) => leftIndex - rightIndex
  );
  for (const [, reasoning] of orderedReasoningEntries) {
    if (reasoning) {
      content.push({ type: 'reasoning', text: reasoning });
    }
  }

  const orderedTextEntries = [...state.textByIndex.entries()].sort(
    ([leftIndex], [rightIndex]) => leftIndex - rightIndex
  );
  for (const [, text] of orderedTextEntries) {
    if (text) {
      content.push({ type: 'text', text });
      if (structuredData === undefined) {
        try {
          structuredData = JSON.parse(text);
        } catch {
          // Not JSON - expected for non-structured responses
        }
      }
    }
  }

  const toolCalls: ToolCall[] = [];
  const functionCallItems: Array<{
    id: string;
    call_id: string;
    name: string;
    arguments: string;
  }> = [];
  const orderedToolEntries = [...state.toolCalls.entries()].sort(
    ([leftIndex], [rightIndex]) => leftIndex - rightIndex
  );
  for (const [, toolCall] of orderedToolEntries) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON - use empty object
      }
    }
    const itemId = toolCall.itemId ?? '';
    const callId = toolCall.callId ?? toolCall.itemId ?? '';
    const name = toolCall.name ?? '';
    if (!name || !callId) {
      continue;
    }
    toolCalls.push({
      toolCallId: callId,
      toolName: name,
      arguments: args,
    });

    if (itemId && callId && name) {
      functionCallItems.push({
        id: itemId,
        call_id: callId,
        name,
        arguments: toolCall.arguments,
      });
    }
  }

  const responseId = state.id || generateId();
  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: responseId,
      metadata: {
        responses: {
          model: state.model,
          status: state.status,
          response_id: responseId,
          functionCallItems:
            functionCallItems.length > 0 ? functionCallItems : undefined,
          reasoningEncryptedContent: state.reasoningEncryptedContent,
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
  if (state.status === 'completed') {
    stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
  } else if (state.status === 'incomplete') {
    stopReason = state.incompleteReason === 'max_output_tokens' ? 'max_tokens' : 'end_turn';
  } else if (state.status === 'failed') {
    stopReason = 'error';
  }
  if (state.hadRefusal && stopReason !== 'error') {
    stopReason = 'content_filter';
  }

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}
