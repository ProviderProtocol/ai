/**
 * Transform utilities for OpenRouter Responses API (beta).
 *
 * This module handles bidirectional conversion between UPP (Unified Provider Protocol)
 * request/response formats and OpenRouter's Responses API format. The Responses API
 * uses a different structure than Chat Completions, with input items and output items.
 *
 * @module transform.responses
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
  AudioBlock,
  VideoBlock,
  AssistantContent,
  ReasoningBlock,
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
  OpenRouterResponsesParams,
  OpenRouterResponsesRequest,
  OpenRouterResponsesInputItem,
  OpenRouterResponsesContentPart,
  OpenRouterResponsesTool,
  OpenRouterResponsesResponse,
  OpenRouterResponsesStreamEvent,
  OpenRouterSystemContent,
  OpenRouterCacheControl,
  OpenRouterResponsesReasoningOutput,
} from './types.ts';

function isValidCacheControl(value: unknown): value is OpenRouterCacheControl {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; ttl?: unknown };
  if (candidate.type !== 'ephemeral') return false;
  if (candidate.ttl !== undefined && candidate.ttl !== '1h') return false;
  return true;
}

function normalizeSystem(system: string | unknown[]): string | OpenRouterSystemContent[] {
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) {
    throw new UPPError(
      'System prompt must be a string or an array of text blocks',
      ErrorCode.InvalidRequest,
      'openrouter',
      ModalityType.LLM
    );
  }

  const blocks: OpenRouterSystemContent[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object') {
      throw new UPPError(
        'System prompt array must contain objects with type "text"',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }
    const candidate = block as { type?: unknown; text?: unknown; cache_control?: unknown };
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') {
      throw new UPPError(
        'OpenRouter system blocks must be of type "text" with a string text field',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }
    if (candidate.cache_control !== undefined && !isValidCacheControl(candidate.cache_control)) {
      throw new UPPError(
        'Invalid cache_control for OpenRouter system prompt',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }
    blocks.push(block as OpenRouterSystemContent);
  }

  return blocks;
}

/**
 * Filters content blocks to only those with a valid type property.
 *
 * @param content - Array of content blocks to filter
 * @returns Filtered array containing only blocks with string type properties
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transforms a UPP content block to Responses API content part format.
 *
 * Supports text and image content types. Images are converted to data URLs
 * or passed through as URL references.
 *
 * @param block - The UPP content block to transform
 * @returns Responses API content part
 * @throws Error if the content type is unsupported
 */
function transformContentPart(block: ContentBlock): OpenRouterResponsesContentPart {
  switch (block.type) {
    case 'text':
      return { type: 'input_text', text: block.text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      if (imageBlock.source.type === 'base64') {
        return {
          type: 'input_image',
          image_url: `data:${imageBlock.mimeType};base64,${imageBlock.source.data}`,
          detail: 'auto',
        };
      }

      if (imageBlock.source.type === 'url') {
        return {
          type: 'input_image',
          image_url: imageBlock.source.url,
          detail: 'auto',
        };
      }

      if (imageBlock.source.type === 'bytes') {
        const base64 = Buffer.from(imageBlock.source.data).toString('base64');
        return {
          type: 'input_image',
          image_url: `data:${imageBlock.mimeType};base64,${base64}`,
          detail: 'auto',
        };
      }

      throw new Error('Unknown image source type');
    }

    case 'document': {
      const documentBlock = block as DocumentBlock;

      if (documentBlock.source.type === 'text') {
        if (!documentBlock.source.data) {
          throw new UPPError(
            'Text document source data is empty',
            ErrorCode.InvalidRequest,
            'openrouter',
            ModalityType.LLM
          );
        }
        const title = documentBlock.title ? `[Document: ${documentBlock.title}]\n` : '';
        return { type: 'input_text', text: `${title}${documentBlock.source.data}` };
      }

      const filename = documentBlock.title ?? 'document.pdf';

      if (documentBlock.source.type === 'base64') {
        const fileData = `data:${documentBlock.mimeType};base64,${documentBlock.source.data}`;
        return {
          type: 'input_file',
          filename,
          file_data: fileData,
        };
      }

      if (documentBlock.source.type === 'url') {
        return {
          type: 'input_file',
          filename,
          file_url: documentBlock.source.url,
        };
      }

      throw new UPPError(
        'Unknown document source type',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }

    case 'audio': {
      const audioBlock = block as AudioBlock;
      const base64 = Buffer.from(audioBlock.data).toString('base64');
      const format = audioBlock.mimeType.split('/')[1] ?? 'mp3';

      return {
        type: 'input_audio',
        input_audio: {
          data: base64,
          format,
        },
      };
    }

    case 'video': {
      const videoBlock = block as VideoBlock;
      const base64 = Buffer.from(videoBlock.data).toString('base64');
      const url = `data:${videoBlock.mimeType};base64,${base64}`;

      return {
        type: 'input_video',
        video_url: url,
      };
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transforms a single UPP message to Responses API input items.
 *
 * May return multiple input items for messages containing tool calls,
 * as function_call items must be separate from message items.
 *
 * @param message - The UPP message to transform
 * @returns Array of Responses API input items
 */
function transformMessage(message: Message): OpenRouterResponsesInputItem[] {
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
    const items: OpenRouterResponsesInputItem[] = [];

    const contentParts: OpenRouterResponsesContentPart[] = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c): OpenRouterResponsesContentPart => ({
        type: 'output_text',
        text: c.text,
        annotations: [],
      }));

    const messageId = message.id || generateId();

    if (contentParts.length > 0) {
      items.push({
        type: 'message',
        role: 'assistant',
        id: messageId,
        status: 'completed',
        content: contentParts,
      });
    }

    const openrouterMeta = message.metadata?.openrouter as
      | {
          functionCallItems?: Array<{ id: string; call_id: string; name: string; arguments: string }>;
          reasoningEncryptedContent?: string;
        }
      | undefined;
    const functionCallItems = openrouterMeta?.functionCallItems;

    if (openrouterMeta?.reasoningEncryptedContent) {
      try {
        const reasoningData = JSON.parse(openrouterMeta.reasoningEncryptedContent) as {
          id: string;
          summary: Array<{ type: 'summary_text'; text: string }>;
          encrypted_content?: string;
        };
        items.push({
          type: 'reasoning',
          id: reasoningData.id,
          summary: reasoningData.summary,
          encrypted_content: reasoningData.encrypted_content,
        } as OpenRouterResponsesInputItem);
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
    return message.results.map((result, index) => ({
      type: 'function_call_output' as const,
      id: `fco_${result.toolCallId}_${index}`,
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
 * Transforms UPP messages into Responses API input items.
 *
 * Handles system prompts, user messages, assistant messages, function calls,
 * and tool results. Returns a string for simple single-message requests.
 *
 * System prompts support both string and array formats for cache_control.
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt (string or array with cache_control)
 * @returns Array of input items, or a simple string for single-message requests
 */
function transformInputItems(
  messages: Message[],
  system?: string | unknown[]
): OpenRouterResponsesInputItem[] | string {
  const result: OpenRouterResponsesInputItem[] = [];

  if (system !== undefined && system !== null) {
    const normalizedSystem = normalizeSystem(system);
    if (typeof normalizedSystem === 'string') {
      if (normalizedSystem.length > 0) {
        result.push({
          type: 'message',
          role: 'system',
          content: normalizedSystem,
        } as OpenRouterResponsesInputItem);
      }
    } else if (normalizedSystem.length > 0) {
      result.push({
        type: 'message',
        role: 'system',
        content: normalizedSystem,
      } as OpenRouterResponsesInputItem);
    }
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
 * Transforms a UPP Tool definition to Responses API function tool format.
 *
 * @param tool - The UPP tool definition
 * @returns Responses API function tool definition
 */
function transformTool(tool: Tool): OpenRouterResponsesTool {
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
  };
}

/**
 * Transforms a UPP LLMRequest into an OpenRouter Responses API request body.
 *
 * Parameters are spread directly to enable pass-through of any OpenRouter API fields,
 * even those not explicitly defined in our types. This allows developers to use new
 * API features without waiting for library updates.
 *
 * @param request - The UPP LLM request containing messages, tools, and parameters
 * @param modelId - The OpenRouter model identifier (e.g., 'openai/gpt-4o')
 * @returns A fully formed OpenRouter Responses API request body
 */
export function transformRequest(
  request: LLMRequest<OpenRouterResponsesParams>,
  modelId: string
): OpenRouterResponsesRequest {
  const params = request.params ?? ({} as OpenRouterResponsesParams);

  const openrouterRequest: OpenRouterResponsesRequest = {
    ...params,
    model: modelId,
    input: transformInputItems(request.messages, request.system),
  };

  if (request.tools && request.tools.length > 0) {
    openrouterRequest.tools = request.tools.map(transformTool);
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

    openrouterRequest.text = {
      format: {
        type: 'json_schema',
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return openrouterRequest;
}

/**
 * Transforms an OpenRouter Responses API response to UPP LLMResponse format.
 *
 * Extracts text content, tool calls, usage statistics, and stop reason from
 * the Responses API output items. Handles refusals and structured output parsing.
 *
 * @param data - The raw OpenRouter Responses API response
 * @returns UPP-formatted LLM response
 */
export function transformResponse(data: OpenRouterResponsesResponse): LLMResponse {
  const reasoningContent: ReasoningBlock[] = [];
  const textContent: AssistantContent[] = [];
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
          textContent.push({ type: 'text', text: part.text });
          if (structuredData === undefined) {
            try {
              structuredData = JSON.parse(part.text);
            } catch {
              // Content is not JSON - acceptable for non-structured responses
            }
          }
        } else if (part.type === 'refusal') {
          textContent.push({ type: 'text', text: part.refusal });
          hadRefusal = true;
        }
      }
    } else if (item.type === 'function_call') {
      const functionCall = item;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(functionCall.arguments);
      } catch {
        // Invalid JSON arguments - use empty object as fallback
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
        textContent.push({
          type: 'image',
          mimeType: 'image/png',
          source: { type: 'base64', data: imageGen.result },
        } as ImageBlock);
      }
    } else if (item.type === 'reasoning') {
      const reasoningItem = item as OpenRouterResponsesReasoningOutput;
      const reasoningText = reasoningItem.summary
        .filter((s): s is { type: 'summary_text'; text: string } => s.type === 'summary_text')
        .map(s => s.text)
        .join('');
      if (reasoningText) {
        reasoningContent.push({ type: 'reasoning', text: reasoningText });
      }
      reasoningEncryptedContent = JSON.stringify({
        id: reasoningItem.id,
        summary: reasoningItem.summary,
        encrypted_content: reasoningItem.encrypted_content,
      });
    }
  }

  const content: AssistantContent[] = [...reasoningContent, ...textContent];

  const responseId = data.id || generateId();
  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: responseId,
      metadata: {
        openrouter: {
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
 * Mutable state object for accumulating Responses API streaming data.
 *
 * Used during streaming to collect text deltas, tool call fragments,
 * and usage statistics before building the final LLMResponse.
 */
export interface ResponsesStreamState {
  /** Response ID from the created event */
  id: string;
  /** Model identifier from the response */
  model: string;
  /** Map of output index to accumulated text content */
  textByIndex: Map<number, string>;
  /** Map of output index to accumulated reasoning text */
  reasoningByIndex: Map<number, string>;
  /** Map of output index to accumulated tool call data */
  toolCalls: Map<
    number,
    { itemId?: string; callId?: string; name?: string; arguments: string }
  >;
  /** Map of output index to generated image data (base64) */
  images: Map<number, string>;
  /** Current response status */
  status: string;
  /** Input token count from usage */
  inputTokens: number;
  /** Output token count from usage */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
  /** Whether a refusal was encountered */
  hadRefusal: boolean;
  /** Serialized reasoning item for multi-turn context preservation (includes encrypted_content) */
  reasoningEncryptedContent?: string;
}

/**
 * Creates an empty stream state object for accumulating Responses API streaming data.
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
    images: new Map(),
    status: 'in_progress',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transforms an OpenRouter Responses API streaming event into UPP StreamEvents.
 *
 * Handles the various Responses API event types including response lifecycle events,
 * output item events, content deltas, function call arguments, and reasoning deltas.
 * Updates the provided state object with accumulated data.
 *
 * @param event - The OpenRouter Responses API streaming event to process
 * @param state - The mutable state object to update with event data
 * @returns Array of UPP StreamEvents generated from this event
 */
export function transformStreamEvent(
  event: OpenRouterResponsesStreamEvent,
  state: ResponsesStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  switch (event.type) {
    case 'response.created':
      state.id = event.response.id;
      state.model = event.response.model;
      events.push({ type: StreamEventType.MessageStart, index: 0, delta: {} });
      break;

    case 'response.in_progress':
      state.status = 'in_progress';
      break;

    case 'response.completed':
    case 'response.done':
      state.status = 'completed';
      if (event.response?.usage) {
        state.inputTokens = event.response.usage.input_tokens;
        state.outputTokens = event.response.usage.output_tokens;
        state.cacheReadTokens = event.response.usage.input_tokens_details?.cached_tokens ?? 0;
      }
      if (event.response?.output) {
        for (let i = 0; i < event.response.output.length; i++) {
          const item = event.response.output[i];
          if (item && item.type === 'function_call') {
            const functionCall = item;
            const existing = state.toolCalls.get(i) ?? { arguments: '' };
            existing.itemId = functionCall.id ?? existing.itemId;
            existing.callId = functionCall.call_id ?? existing.callId;
            existing.name = functionCall.name ?? existing.name;
            if (functionCall.arguments) {
              existing.arguments = functionCall.arguments;
            }
            state.toolCalls.set(i, existing);
          }
        }
      }
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
      break;

    case 'response.failed':
      state.status = 'failed';
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
      } else if (event.item.type === 'message') {
        const messageItem = event.item;
        for (const content of messageItem.content || []) {
          if (content.type === 'output_text') {
            const existingText = state.textByIndex.get(event.output_index) ?? '';
            if (!existingText && content.text) {
              state.textByIndex.set(event.output_index, content.text);
              events.push({
                type: StreamEventType.TextDelta,
                index: event.output_index,
                delta: { text: content.text },
              });
            }
          }
        }
      } else if (event.item.type === 'image_generation_call') {
        const imageGen = event.item;
        if (imageGen.result) {
          state.images.set(event.output_index, imageGen.result);
        }
      } else if (event.item.type === 'reasoning') {
        const reasoningItem = event.item as OpenRouterResponsesReasoningOutput;
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

    case 'response.content_part.delta':
    case 'response.output_text.delta': {
      const textDelta = (event as { delta: string }).delta;
      const currentText = state.textByIndex.get(event.output_index) ?? '';
      state.textByIndex.set(event.output_index, currentText + textDelta);
      events.push({
        type: StreamEventType.TextDelta,
        index: event.output_index,
        delta: { text: textDelta },
      });
      break;
    }

    case 'response.output_text.done':
    case 'response.content_part.done':
      if ('text' in event) {
        state.textByIndex.set(event.output_index, (event as { text: string }).text);
      }
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

    case 'response.reasoning.delta': {
      const currentReasoning = state.reasoningByIndex.get(0) ?? '';
      state.reasoningByIndex.set(0, currentReasoning + event.delta);
      events.push({
        type: StreamEventType.ReasoningDelta,
        index: 0,
        delta: { text: event.delta },
      });
      break;
    }

    case 'error':
      break;

    default:
      break;
  }

  return events;
}

/**
 * Builds the final LLMResponse from accumulated Responses API streaming state.
 *
 * Constructs the complete response after streaming has finished, including
 * the assistant message, tool calls, usage statistics, and stop reason.
 *
 * @param state - The accumulated stream state
 * @returns Complete UPP LLMResponse
 */
export function buildResponseFromState(state: ResponsesStreamState): LLMResponse {
  const reasoningContent: ReasoningBlock[] = [];
  const textContent: AssistantContent[] = [];
  let structuredData: unknown;

  for (const [, reasoning] of state.reasoningByIndex) {
    if (reasoning) {
      reasoningContent.push({ type: 'reasoning', text: reasoning });
    }
  }

  for (const [, text] of state.textByIndex) {
    if (text) {
      textContent.push({ type: 'text', text });
      if (structuredData === undefined) {
        try {
          structuredData = JSON.parse(text);
        } catch {
          // Content is not JSON - acceptable for non-structured responses
        }
      }
    }
  }

  for (const [, imageData] of state.images) {
    if (imageData) {
      textContent.push({
        type: 'image',
        mimeType: 'image/png',
        source: { type: 'base64', data: imageData },
      } as ImageBlock);
    }
  }

  const content: AssistantContent[] = [...reasoningContent, ...textContent];

  const toolCalls: ToolCall[] = [];
  const functionCallItems: Array<{
    id: string;
    call_id: string;
    name: string;
    arguments: string;
  }> = [];
  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON arguments - use empty object as fallback
      }
    }
    const itemId = toolCall.itemId ?? '';
    const callId = toolCall.callId ?? toolCall.itemId ?? '';
    const name = toolCall.name ?? '';
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
        openrouter: {
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
