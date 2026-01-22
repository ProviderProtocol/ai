/**
 * @fileoverview Responses API Message Transformers
 *
 * This module provides transformation functions for converting between the
 * Universal Provider Protocol (UPP) message format and OpenAI's Responses API
 * format. The Responses API uses a different structure than Chat Completions,
 * with input items instead of messages and support for built-in tools.
 *
 * Key differences from Chat Completions:
 * - Uses `input` array instead of `messages`
 * - Function calls are separate input items, not embedded in messages
 * - Tool results use `function_call_output` items
 * - Supports built-in tools (web search, image generation, etc.)
 * - Different streaming event structure
 *
 * @module providers/openai/transform.responses
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock, ImageBlock, DocumentBlock, AssistantContent } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  OpenAIResponsesParams,
  OpenAIResponsesRequest,
  OpenAIResponsesInputItem,
  OpenAIResponsesContentPart,
  OpenAIResponsesTool,
  OpenAIResponsesToolUnion,
  OpenAIResponsesResponse,
  OpenAIResponsesStreamEvent,
  OpenAIReasoningOutput,
} from './types.ts';

/**
 * Normalizes system prompt to string.
 * Converts array format to concatenated string for providers that only support strings.
 */
function normalizeSystem(system: string | unknown[] | undefined): string | undefined {
  if (system === undefined || system === null) return undefined;
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) {
    throw new UPPError(
      'System prompt must be a string or an array of text blocks',
      ErrorCode.InvalidRequest,
      'openai',
      ModalityType.LLM
    );
  }

  const texts: string[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object' || !('text' in block)) {
      throw new UPPError(
        'System prompt array must contain objects with a text field',
        ErrorCode.InvalidRequest,
        'openai',
        ModalityType.LLM
      );
    }
    const textValue = (block as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'System prompt text must be a string',
        ErrorCode.InvalidRequest,
        'openai',
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
 *
 * @param content - Array of content blocks to filter
 * @returns Filtered array containing only valid content blocks
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transforms a UPP content block to Responses API content part format.
 *
 * Handles text, image, and document content blocks. The Responses API uses different
 * type names than Chat Completions (`input_text` vs `text`, `input_image` vs `image_url`).
 * Documents (PDFs only) are converted to input_file content parts.
 *
 * @param block - The content block to transform
 * @returns The transformed Responses API content part
 * @throws Error if the content type is unsupported or source type is unknown
 */
function transformContentPart(block: ContentBlock): OpenAIResponsesContentPart {
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

      throw new Error('Unknown image source type');
    }

    case 'document': {
      const documentBlock = block as DocumentBlock;

      if (documentBlock.mimeType !== 'application/pdf') {
        throw new UPPError(
          'OpenAI Responses API only supports PDF documents',
          ErrorCode.InvalidRequest,
          'openai',
          ModalityType.LLM
        );
      }

      if (documentBlock.source.type === 'base64') {
        return {
          type: 'input_file',
          filename: documentBlock.title ?? 'document.pdf',
          file_data: `data:application/pdf;base64,${documentBlock.source.data}`,
        };
      }

      if (documentBlock.source.type === 'url') {
        return {
          type: 'input_file',
          file_url: documentBlock.source.url,
        };
      }

      throw new UPPError(
        'Unknown document source type',
        ErrorCode.InvalidRequest,
        'openai',
        ModalityType.LLM
      );
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transforms a single UPP message to Responses API input items.
 *
 * Unlike Chat Completions, the Responses API separates function calls from
 * messages. An assistant message with tool calls becomes multiple input items:
 * a message item for text content plus separate function_call items.
 *
 * @param message - The UPP message to transform
 * @returns Array of Responses API input items (may be multiple per message)
 */
function transformMessage(message: Message): OpenAIResponsesInputItem[] {
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
    const items: OpenAIResponsesInputItem[] = [];

    const contentParts: OpenAIResponsesContentPart[] = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c): OpenAIResponsesContentPart => ({
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

    const openaiMeta = message.metadata?.openai as
      | {
          functionCallItems?: Array<{ id: string; call_id: string; name: string; arguments: string }>;
          reasoningEncryptedContent?: string;
        }
      | undefined;
    const functionCallItems = openaiMeta?.functionCallItems;

    if (openaiMeta?.reasoningEncryptedContent) {
      try {
        const reasoningData = JSON.parse(openaiMeta.reasoningEncryptedContent) as {
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
 * Transforms UPP messages to Responses API input items.
 *
 * The Responses API accepts either a string (for simple prompts) or an array
 * of input items. This function optimizes by returning a string when the
 * input is a single user message with text content.
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt (string or array, normalized to string)
 * @returns Either a string (for simple inputs) or array of input items
 */
function transformInputItems(
  messages: Message[],
  system?: string | unknown[]
): OpenAIResponsesInputItem[] | string {
  const result: OpenAIResponsesInputItem[] = [];
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
 * Extracts OpenAI-specific options from tool metadata.
 *
 * @param tool - The tool to extract options from
 * @returns The OpenAI options if present (currently supports `strict`)
 */
function extractToolOptions(tool: Tool): { strict?: boolean } {
  const openaiMeta = tool.metadata?.openai as
    | { strict?: boolean }
    | undefined;
  return { strict: openaiMeta?.strict };
}

/**
 * Transforms a UPP tool definition to Responses API function tool format.
 *
 * The Responses API uses a flatter structure for function tools compared to
 * Chat Completions, with properties at the top level rather than nested.
 *
 * Strict mode can be specified via tool metadata:
 * ```typescript
 * const tool: Tool = {
 *   name: 'get_weather',
 *   description: 'Get weather for a location',
 *   parameters: {...},
 *   metadata: { openai: { strict: true } },
 *   run: async (params) => {...}
 * };
 * ```
 *
 * @param tool - The UPP tool definition
 * @returns The transformed Responses API function tool
 */
function transformTool(tool: Tool): OpenAIResponsesTool {
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
 * Transforms a UPP LLM request into OpenAI Responses API format.
 *
 * This function converts the universal request format to OpenAI's Responses API
 * structure. It merges UPP function tools with any built-in tools specified in
 * params, and handles structured output configuration.
 *
 * @param request - The UPP LLM request containing messages, tools, and configuration
 * @param modelId - The OpenAI model identifier (e.g., 'gpt-4o')
 * @returns An OpenAI Responses API request body
 *
 * @example
 * ```typescript
 * const openaiRequest = transformRequest({
 *   messages: [userMessage('Search for recent news')],
 *   params: {
 *     max_output_tokens: 1000,
 *     tools: [tools.webSearch()]
 *   },
 *   config: { apiKey: 'sk-...' }
 * }, 'gpt-4o');
 * ```
 */
export function transformRequest(
  request: LLMRequest<OpenAIResponsesParams>,
  modelId: string
): OpenAIResponsesRequest {
  const params = request.params ?? ({} as OpenAIResponsesParams);

  const { tools: builtInTools, ...restParams } = params;

  const openaiRequest: OpenAIResponsesRequest = {
    ...restParams,
    model: modelId,
    input: transformInputItems(request.messages, request.system),
  };

  const functionTools: OpenAIResponsesToolUnion[] = request.tools?.map(transformTool) ?? [];
  const allTools: OpenAIResponsesToolUnion[] = [
    ...functionTools,
    ...(builtInTools ?? []),
  ];

  if (allTools.length > 0) {
    openaiRequest.tools = allTools;
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

    openaiRequest.text = {
      format: {
        type: 'json_schema',
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return openaiRequest;
}

/**
 * Transforms an OpenAI Responses API response to UPP LLMResponse format.
 *
 * Processes all output items from the response, extracting text content,
 * tool calls, and generated images. Also handles built-in tool outputs
 * like image generation results.
 *
 * @param data - The raw OpenAI Responses API response
 * @returns The transformed UPP LLM response
 */
export function transformResponse(data: OpenAIResponsesResponse): LLMResponse {
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
      const functionCall = item;
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
    } else if (item.type === 'image_generation_call') {
      const imageGen = item;
      if (imageGen.result) {
        const mimeType = imageGen.mime_type ?? 'image/png';
        content.push({
          type: 'image',
          mimeType,
          source: { type: 'base64', data: imageGen.result },
        } as ImageBlock);
      }
    } else if (item.type === 'reasoning') {
      const reasoningItem = item as OpenAIReasoningOutput;
      const reasoningText = reasoningItem.summary
        .filter((s): s is { type: 'summary_text'; text: string } => s.type === 'summary_text')
        .map(s => s.text)
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
        openai: {
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

/**
 * Mutable state object for accumulating data during Responses API streaming.
 *
 * The Responses API has a different streaming structure than Chat Completions,
 * with events organized by output index. This state tracks content and tool
 * calls by their output index for proper reconstruction.
 */
export interface ResponsesStreamState {
  /** Response ID */
  id: string;
  /** Model identifier */
  model: string;
  /** Map of output index to accumulated text content */
  textByIndex: Map<number, string>;
  /** Map of output index to accumulated reasoning/thinking content */
  reasoningByIndex: Map<number, string>;
  /** Map of output index to accumulated tool call data */
  toolCalls: Map<
    number,
    { itemId?: string; callId?: string; name?: string; arguments: string }
  >;
  /** Base64 image data from image_generation_call outputs */
  images: Array<{ data: string; mimeType: string }>;
  /** Current response status */
  status: string;
  /** Reason for incomplete responses (if provided) */
  incompleteReason?: string;
  /** Input token count */
  inputTokens: number;
  /** Output token count */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
  /** Whether a refusal was encountered */
  hadRefusal: boolean;
  /** Serialized reasoning item for multi-turn context preservation (includes encrypted_content) */
  reasoningEncryptedContent?: string;
}

/**
 * Creates a fresh stream state object for a new Responses API streaming session.
 *
 * @returns A new ResponsesStreamState with all fields initialized
 */
export function createStreamState(): ResponsesStreamState {
  return {
    id: '',
    model: '',
    textByIndex: new Map(),
    reasoningByIndex: new Map(),
    toolCalls: new Map(),
    images: [],
    status: 'in_progress',
    incompleteReason: undefined,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transforms an OpenAI Responses API streaming event into UPP stream events.
 *
 * The Responses API uses a granular event structure with separate events for
 * response lifecycle, output items, and content deltas. This function maps
 * these events to the UPP streaming format.
 *
 * @param event - The Responses API streaming event to process
 * @param state - The mutable state object to update
 * @returns Array of UPP stream events generated from this event
 */
export function transformStreamEvent(
  event: OpenAIResponsesStreamEvent,
  state: ResponsesStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  const updateFromResponse = (response: OpenAIResponsesResponse): void => {
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

    case 'response.in_progress':
      updateFromResponse(event.response);
      break;

    case 'response.completed':
      updateFromResponse(event.response);
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
      break;

    case 'response.failed':
      updateFromResponse(event.response);
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
      break;

    case 'response.output_item.added':
      if (event.item.type === 'function_call') {
        const functionCall = event.item;
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
        const functionCall = event.item;
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
      } else if (event.item.type === 'image_generation_call') {
        const imageGen = event.item;
        if (imageGen.result) {
          state.images.push({
            data: imageGen.result,
            mimeType: imageGen.mime_type ?? 'image/png',
          });
        }
      } else if (event.item.type === 'reasoning') {
        const reasoningItem = event.item as OpenAIReasoningOutput;
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
          toolName: toolCall.name ?? '',
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
 * Builds a complete LLMResponse from accumulated Responses API streaming state.
 *
 * Called after all streaming events have been processed to construct the final
 * response object with all accumulated content, tool calls, images, and usage
 * statistics.
 *
 * @param state - The accumulated stream state
 * @returns A complete UPP LLMResponse
 */
export function buildResponseFromState(state: ResponsesStreamState): LLMResponse {
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

  for (const imageData of state.images) {
    content.push({
      type: 'image',
      mimeType: imageData.mimeType,
      source: { type: 'base64', data: imageData.data },
    } as ImageBlock);
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
        openai: {
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
