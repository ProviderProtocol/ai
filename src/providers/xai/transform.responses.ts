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
  XAIResponsesParams,
  XAIResponsesRequest,
  XAIResponsesInputItem,
  XAIResponsesContentPart,
  XAIResponsesTool,
  XAIResponsesResponse,
  XAIResponsesStreamEvent,
  XAIResponsesOutputItem,
  XAIResponsesMessageOutput,
  XAIResponsesFunctionCallOutput,
} from './types.ts';

/**
 * Transforms a UPP LLM request to the xAI Responses API format.
 *
 * All params are spread directly to enable pass-through of xAI API fields
 * not explicitly defined in our types. This allows developers to use new
 * API features without waiting for library updates.
 *
 * @param request - The unified provider protocol request
 * @param modelId - The xAI model identifier
 * @returns The transformed xAI Responses API request body
 */
export function transformRequest(
  request: LLMRequest<XAIResponsesParams>,
  modelId: string
): XAIResponsesRequest {
  const params = request.params ?? ({} as XAIResponsesParams);

  const xaiRequest: XAIResponsesRequest = {
    ...params,
    model: modelId,
    input: transformInputItems(request.messages, request.system),
  };

  if (request.tools && request.tools.length > 0) {
    xaiRequest.tools = request.tools.map(transformTool);
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

    xaiRequest.text = {
      format: {
        type: 'json_schema',
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return xaiRequest;
}

/**
 * Normalizes system prompt to string.
 * Converts array format to concatenated string for providers that only support strings.
 */
function normalizeSystem(system: string | unknown[] | undefined): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  return (system as Array<{text?: string}>)
    .map(block => block.text ?? '')
    .filter(text => text.length > 0)
    .join('\n\n');
}

/**
 * Transforms UPP messages to Responses API input items.
 *
 * @param messages - The array of UPP messages
 * @param system - Optional system prompt (string or array, normalized to string)
 * @returns Array of input items or a simple string for single user messages
 */
function transformInputItems(
  messages: Message[],
  system?: string | unknown[]
): XAIResponsesInputItem[] | string {
  const result: XAIResponsesInputItem[] = [];
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
 * Filters content blocks to only those with a valid type property.
 *
 * @param content - Array of content blocks
 * @returns Filtered array with only valid content blocks
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transforms a single UPP message to xAI Responses API input items.
 *
 * A single message may produce multiple input items (e.g., assistant message
 * followed by function_call items for tool calls).
 *
 * @param message - The UPP message to transform
 * @returns Array of xAI Responses API input items
 */
function transformMessage(message: Message): XAIResponsesInputItem[] {
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
    const items: XAIResponsesInputItem[] = [];

    const textContent = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n\n');

    if (textContent) {
      items.push({
        type: 'message',
        role: 'assistant',
        content: textContent,
      });
    }

    const xaiMeta = message.metadata?.xai as
      | { functionCallItems?: Array<{ id: string; call_id: string; name: string; arguments: string }> }
      | undefined;
    const functionCallItems = xaiMeta?.functionCallItems;

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
 * Transforms a UPP content block to Responses API content part format.
 *
 * @param block - The content block to transform
 * @returns The xAI-formatted content part
 * @throws Error if the content type is unsupported
 */
function transformContentPart(block: ContentBlock): XAIResponsesContentPart {
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
        // Convert bytes to base64
        const base64 = btoa(
          Array.from(imageBlock.source.data)
            .map((b) => String.fromCharCode(b))
            .join('')
        );
        return {
          type: 'input_image',
          image_url: `data:${imageBlock.mimeType};base64,${base64}`,
        };
      }

      throw new Error('Unknown image source type');
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transforms a UPP tool definition to Responses API format.
 *
 * @param tool - The UPP tool definition
 * @returns The xAI-formatted tool definition
 */
function transformTool(tool: Tool): XAIResponsesTool {
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
 * Transforms an xAI Responses API response to the UPP LLMResponse format.
 *
 * @param data - The xAI Responses API response
 * @returns The unified provider protocol response
 */
export function transformResponse(data: XAIResponsesResponse): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  const functionCallItems: Array<{
    id: string;
    call_id: string;
    name: string;
    arguments: string;
  }> = [];
  let hadRefusal = false;
  let structuredData: unknown;

  for (const item of data.output) {
    if (item.type === 'message') {
      const messageItem = item as XAIResponsesMessageOutput;
      for (const content of messageItem.content) {
        if (content.type === 'output_text') {
          textContent.push({ type: 'text', text: content.text });
          if (structuredData === undefined) {
            try {
              structuredData = JSON.parse(content.text);
            } catch {
              // Not valid JSON, which is fine for non-structured responses
            }
          }
        } else if (content.type === 'refusal') {
          textContent.push({ type: 'text', text: content.refusal });
          hadRefusal = true;
        }
      }
    } else if (item.type === 'function_call') {
      const functionCall = item as XAIResponsesFunctionCallOutput;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(functionCall.arguments);
      } catch {
        // Invalid JSON, use empty object
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
    }
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: data.id,
      metadata: {
        xai: {
          model: data.model,
          status: data.status,
          response_id: data.id,
          functionCallItems:
            functionCallItems.length > 0 ? functionCallItems : undefined,
          citations: data.citations,
          inline_citations: data.inline_citations,
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
 * State object for accumulating data during Responses API streaming.
 *
 * This state is progressively updated as stream events arrive and is used
 * to build the final LLMResponse when streaming completes.
 */
export interface ResponsesStreamState {
  /** Response identifier */
  id: string;
  /** Model used for generation */
  model: string;
  /** Map of output index to accumulated text content */
  textByIndex: Map<number, string>;
  /** Map of output index to accumulated tool call data */
  toolCalls: Map<
    number,
    { itemId?: string; callId?: string; name?: string; arguments: string }
  >;
  /** Current response status */
  status: string;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
  /** Whether a refusal message was received */
  hadRefusal: boolean;
}

/**
 * Creates a new initialized stream state for Responses API streaming.
 *
 * @returns A fresh ResponsesStreamState with default values
 */
export function createStreamState(): ResponsesStreamState {
  return {
    id: '',
    model: '',
    textByIndex: new Map(),
    toolCalls: new Map(),
    status: 'in_progress',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transforms an xAI Responses API stream event to UPP StreamEvents.
 *
 * A single event may produce multiple UPP events. The state object is
 * mutated to accumulate data for the final response.
 *
 * @param event - The xAI Responses API stream event
 * @param state - The mutable stream state to update
 * @returns Array of UPP stream events (may be empty)
 */
export function transformStreamEvent(
  event: XAIResponsesStreamEvent,
  state: ResponsesStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  switch (event.type) {
    case 'response.created':
      state.id = event.response.id;
      state.model = event.response.model;
      events.push({ type: 'message_start', index: 0, delta: {} });
      break;

    case 'response.in_progress':
      state.status = 'in_progress';
      break;

    case 'response.completed':
      state.status = 'completed';
      if (event.response.usage) {
        state.inputTokens = event.response.usage.input_tokens;
        state.outputTokens = event.response.usage.output_tokens;
        state.cacheReadTokens = event.response.usage.input_tokens_details?.cached_tokens ?? 0;
      }
      events.push({ type: 'message_stop', index: 0, delta: {} });
      break;

    case 'response.failed':
      state.status = 'failed';
      events.push({ type: 'message_stop', index: 0, delta: {} });
      break;

    case 'response.output_item.added':
      if (event.item.type === 'function_call') {
        const functionCall = event.item as XAIResponsesFunctionCallOutput;
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
        type: 'content_block_start',
        index: event.output_index,
        delta: {},
      });
      break;

    case 'response.output_item.done':
      if (event.item.type === 'function_call') {
        const functionCall = event.item as XAIResponsesFunctionCallOutput;
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
        type: 'content_block_stop',
        index: event.output_index,
        delta: {},
      });
      break;

    case 'response.output_text.delta': {
      const currentText = state.textByIndex.get(event.output_index) ?? '';
      state.textByIndex.set(event.output_index, currentText + event.delta);
      events.push({
        type: 'text_delta',
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
        type: 'text_delta',
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
        type: 'tool_call_delta',
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

    case 'error':
      break;

    default:
      break;
  }

  return events;
}

/**
 * Builds the final LLMResponse from accumulated Responses API stream state.
 *
 * Called when streaming is complete to construct the unified response
 * from all the data accumulated during streaming.
 *
 * @param state - The accumulated stream state
 * @returns The complete LLMResponse
 */
export function buildResponseFromState(state: ResponsesStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  let structuredData: unknown;

  for (const [, text] of state.textByIndex) {
    if (text) {
      textContent.push({ type: 'text', text });
      if (structuredData === undefined) {
        try {
          structuredData = JSON.parse(text);
        } catch {
          // Not valid JSON, which is fine for non-structured responses
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
  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON, use empty object
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

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: state.id,
      metadata: {
        xai: {
          model: state.model,
          status: state.status,
          response_id: state.id,
          functionCallItems:
            functionCallItems.length > 0 ? functionCallItems : undefined,
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
