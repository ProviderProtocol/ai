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
  XAILLMParams,
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
 * Transform UPP request to xAI Responses API format
 */
export function transformRequest<TParams extends XAILLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): XAIResponsesRequest {
  const params: XAILLMParams = request.params ?? {};

  const xaiRequest: XAIResponsesRequest = {
    model: modelId,
    input: transformInputItems(request.messages, request.system),
  };

  // Model parameters
  if (params.temperature !== undefined) {
    xaiRequest.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    xaiRequest.top_p = params.top_p;
  }
  if (params.max_output_tokens !== undefined) {
    xaiRequest.max_output_tokens = params.max_output_tokens;
  } else if (params.max_completion_tokens !== undefined) {
    xaiRequest.max_output_tokens = params.max_completion_tokens;
  } else if (params.max_tokens !== undefined) {
    xaiRequest.max_output_tokens = params.max_tokens;
  }
  if (params.store !== undefined) {
    xaiRequest.store = params.store;
  }
  if (params.metadata !== undefined) {
    xaiRequest.metadata = params.metadata;
  }
  if (params.truncation !== undefined) {
    xaiRequest.truncation = params.truncation;
  }
  if (params.include !== undefined) {
    xaiRequest.include = params.include;
  }
  if (params.previous_response_id !== undefined) {
    xaiRequest.previous_response_id = params.previous_response_id;
  }
  if (params.reasoning !== undefined) {
    xaiRequest.reasoning = { ...params.reasoning };
  }
  if (params.reasoning_effort !== undefined) {
    xaiRequest.reasoning = {
      ...(xaiRequest.reasoning ?? {}),
      effort: params.reasoning_effort,
    };
  }
  if (params.search_parameters !== undefined) {
    xaiRequest.search_parameters = params.search_parameters;
  }

  // Tools
  if (request.tools && request.tools.length > 0) {
    xaiRequest.tools = request.tools.map(transformTool);
    if (params.parallel_tool_calls !== undefined) {
      xaiRequest.parallel_tool_calls = params.parallel_tool_calls;
    }
  }

  // Structured output via text.format
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
 * Transform messages to Responses API input items
 */
function transformInputItems(
  messages: Message[],
  system?: string
): XAIResponsesInputItem[] | string {
  const result: XAIResponsesInputItem[] = [];

  if (system) {
    result.push({
      type: 'message',
      role: 'system',
      content: system,
    });
  }

  for (const message of messages) {
    const items = transformMessage(message);
    result.push(...items);
  }

  // If there's only one user message with simple text, return as string
  if (result.length === 1 && result[0]?.type === 'message') {
    const item = result[0] as { role?: string; content?: string | unknown[] };
    if (item.role === 'user' && typeof item.content === 'string') {
      return item.content;
    }
  }

  return result;
}

/**
 * Filter to only valid content blocks with a type property
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transform a UPP Message to xAI Responses API input items
 */
function transformMessage(message: Message): XAIResponsesInputItem[] {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    // Check if we can use simple string content
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

    // Extract text content for assistant messages
    // For input, assistant message content should be a plain string
    const textContent = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n\n');

    // Only add assistant message if there's actual text content
    // For tool-only responses, only include the function_call items
    if (textContent) {
      items.push({
        type: 'message',
        role: 'assistant',
        content: textContent,
      });
    }

    // Add function_call items for each tool call (must precede function_call_output)
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
    // Tool results are function_call_output items
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
 * Transform a content block to Responses API format
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
 * Transform a UPP Tool to Responses API format
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
 * Transform xAI Responses API response to UPP LLMResponse
 */
export function transformResponse(data: XAIResponsesResponse): LLMResponse {
  // Extract text content and tool calls from output items
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
          // Try to parse as JSON for structured output (native JSON mode)
          // Only set data if text is valid JSON
          if (structuredData === undefined) {
            try {
              structuredData = JSON.parse(content.text);
            } catch {
              // Not valid JSON - that's fine, might not be structured output
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
          // Store response_id for multi-turn tool calling
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
  };

  // Map status to stop reason
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
 * State for accumulating streaming response
 */
export interface ResponsesStreamState {
  id: string;
  model: string;
  textByIndex: Map<number, string>;
  toolCalls: Map<
    number,
    { itemId?: string; callId?: string; name?: string; arguments: string }
  >;
  status: string;
  inputTokens: number;
  outputTokens: number;
  hadRefusal: boolean;
}

/**
 * Create initial stream state
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
    hadRefusal: false,
  };
}

/**
 * Transform xAI Responses API stream event to UPP StreamEvent
 * Returns array since one event may produce multiple UPP events
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

    case 'response.output_text.delta':
      // Accumulate text
      const currentText = state.textByIndex.get(event.output_index) ?? '';
      state.textByIndex.set(event.output_index, currentText + event.delta);
      events.push({
        type: 'text_delta',
        index: event.output_index,
        delta: { text: event.delta },
      });
      break;

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
      // Accumulate function call arguments
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
      // Finalize function call
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
      // Error events are handled at the handler level
      break;

    default:
      // Ignore other events
      break;
  }

  return events;
}

/**
 * Build LLMResponse from accumulated stream state
 */
export function buildResponseFromState(state: ResponsesStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  let structuredData: unknown;

  // Combine all text content
  for (const [, text] of state.textByIndex) {
    if (text) {
      textContent.push({ type: 'text', text });
      // Try to parse as JSON for structured output (native JSON mode)
      if (structuredData === undefined) {
        try {
          structuredData = JSON.parse(text);
        } catch {
          // Not valid JSON - that's fine, might not be structured output
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
        // Invalid JSON - use empty object
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
          // Store response_id for multi-turn tool calling
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
  };

  // Map status to stop reason
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
