import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock, ImageBlock } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  XAIMessagesParams,
  XAIMessagesRequest,
  XAIMessagesMessage,
  XAIMessagesContent,
  XAIMessagesTool,
  XAIMessagesResponse,
  XAIMessagesStreamEvent,
  XAIMessagesContentBlockDeltaEvent,
} from './types.ts';

/**
 * Normalizes system prompt to string.
 * Converts array format to concatenated string since xAI Messages API only supports string.
 */
function normalizeSystem(system: string | unknown[] | undefined): string | undefined {
  if (system === undefined || system === null) return undefined;
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) {
    throw new UPPError(
      'System prompt must be a string or an array of text blocks',
      ErrorCode.InvalidRequest,
      'xai',
      ModalityType.LLM
    );
  }

  const texts: string[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object' || !('text' in block)) {
      throw new UPPError(
        'System prompt array must contain objects with a text field',
        ErrorCode.InvalidRequest,
        'xai',
        ModalityType.LLM
      );
    }
    const textValue = (block as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'System prompt text must be a string',
        ErrorCode.InvalidRequest,
        'xai',
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
 * Transforms a UPP LLM request to the xAI Messages API format (Anthropic-compatible).
 *
 * All params are spread directly to enable pass-through of xAI API fields
 * not explicitly defined in our types.
 *
 * @param request - The unified provider protocol request
 * @param modelId - The xAI model identifier
 * @returns The transformed xAI Messages API request body
 */
export function transformRequest(
  request: LLMRequest<XAIMessagesParams>,
  modelId: string
): XAIMessagesRequest {
  const params = request.params ?? ({} as XAIMessagesParams);
  const normalizedSystem = normalizeSystem(request.system);

  const xaiRequest: XAIMessagesRequest = {
    ...params,
    model: modelId,
    messages: request.messages.map(transformMessage),
  };

  if (normalizedSystem) {
    xaiRequest.system = normalizedSystem;
  }

  if (request.tools && request.tools.length > 0) {
    xaiRequest.tools = request.tools.map(transformTool);
    xaiRequest.tool_choice = { type: 'auto' };
  }

  if (request.structure) {
    const structuredTool: XAIMessagesTool = {
      name: 'json_response',
      description: 'Return the response in the specified JSON format. You MUST use this tool to provide your response.',
      input_schema: {
        type: 'object',
        properties: request.structure.properties,
        required: request.structure.required,
      },
    };

    xaiRequest.tools = [...(xaiRequest.tools ?? []), structuredTool];
    xaiRequest.tool_choice = { type: 'tool', name: 'json_response' };
  }

  return xaiRequest;
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
 * Transforms a single UPP message to xAI Messages API format.
 *
 * @param message - The UPP message to transform
 * @returns The xAI-formatted message
 * @throws Error if the message type is unknown
 */
function transformMessage(message: Message): XAIMessagesMessage {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    return {
      role: 'user',
      content: validContent.map(transformContentBlock),
    };
  }

  if (isAssistantMessage(message)) {
    const validContent = filterValidContent(message.content);
    const content: XAIMessagesContent[] = validContent.map(transformContentBlock);

    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: call.toolCallId,
          name: call.toolName,
          input: call.arguments,
        });
      }
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' });
    }

    return {
      role: 'assistant',
      content,
    };
  }

  if (isToolResultMessage(message)) {
    return {
      role: 'user',
      content: message.results.map((result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content:
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result),
        is_error: result.isError,
      })),
    };
  }

  throw new Error(`Unknown message type: ${message.type}`);
}

/**
 * Transforms a UPP content block to xAI Messages API format.
 *
 * @param block - The content block to transform
 * @returns The xAI-formatted content block
 * @throws Error if the content type is unsupported
 */
function transformContentBlock(block: ContentBlock): XAIMessagesContent {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      if (imageBlock.source.type === 'base64') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageBlock.mimeType,
            data: imageBlock.source.data,
          },
        };
      }
      if (imageBlock.source.type === 'url') {
        return {
          type: 'image',
          source: {
            type: 'url',
            url: imageBlock.source.url,
          },
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
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageBlock.mimeType,
            data: base64,
          },
        };
      }
      throw new Error(`Unknown image source type`);
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transforms a UPP tool definition to xAI Messages API format.
 *
 * @param tool - The UPP tool definition
 * @returns The xAI-formatted tool definition
 */
function transformTool(tool: Tool): XAIMessagesTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  };
}

/**
 * Transforms an xAI Messages API response to the UPP LLMResponse format.
 *
 * @param data - The xAI Messages API response
 * @returns The unified provider protocol response
 */
export function transformResponse(data: XAIMessagesResponse): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  for (const block of data.content) {
    if (block.type === 'text') {
      textContent.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      if (block.name === 'json_response') {
        structuredData = block.input;
      }
      toolCalls.push({
        toolCallId: block.id,
        toolName: block.name,
        arguments: block.input,
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
          stop_reason: data.stop_reason,
          stop_sequence: data.stop_sequence,
          model: data.model,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    cacheReadTokens: data.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: data.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    message,
    usage,
    stopReason: data.stop_reason ?? 'end_turn',
    data: structuredData,
  };
}

/**
 * State object for accumulating data during Messages API streaming.
 *
 * This state is progressively updated as stream events arrive and is used
 * to build the final LLMResponse when streaming completes.
 */
export interface MessagesStreamState {
  /** Message identifier */
  messageId: string;
  /** Model used for generation */
  model: string;
  /** Accumulated content blocks */
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: string }>;
  /** Final stop reason */
  stopReason: string | null;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
  /** Number of tokens written to cache */
  cacheWriteTokens: number;
  /** Current content block index (xAI may omit index in delta events) */
  currentIndex: number;
}

/**
 * Creates a new initialized stream state for Messages API streaming.
 *
 * @returns A fresh MessagesStreamState with default values
 */
export function createStreamState(): MessagesStreamState {
  return {
    messageId: '',
    model: '',
    content: [],
    stopReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    currentIndex: 0,
  };
}

/**
 * Transforms an xAI Messages API stream event to a UPP StreamEvent.
 *
 * The state object is mutated to accumulate data for the final response.
 *
 * @param event - The xAI Messages API stream event
 * @param state - The mutable stream state to update
 * @returns A UPP stream event or null for events that don't map to UPP events
 */
export function transformStreamEvent(
  event: XAIMessagesStreamEvent,
  state: MessagesStreamState
): StreamEvent | null {
  switch (event.type) {
    case 'message_start':
      state.messageId = event.message.id;
      state.model = event.message.model;
      state.inputTokens = event.message.usage.input_tokens;
      state.cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
      state.cacheWriteTokens = event.message.usage.cache_creation_input_tokens ?? 0;
      return { type: StreamEventType.MessageStart, index: 0, delta: {} };

    case 'content_block_start':
      state.currentIndex = event.index;
      if (event.content_block.type === 'text') {
        state.content[event.index] = { type: 'text', text: '' };
      } else if (event.content_block.type === 'tool_use') {
        state.content[event.index] = {
          type: 'tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
          input: '',
        };
      }
      return { type: StreamEventType.ContentBlockStart, index: event.index, delta: {} };

    case 'content_block_delta': {
      const delta = event.delta;
      const index = event.index ?? state.currentIndex;
      if (delta.type === 'text_delta') {
        if (!state.content[index]) {
          state.content[index] = { type: 'text', text: '' };
        }
        state.content[index]!.text =
          (state.content[index]!.text ?? '') + delta.text;
        return {
          type: StreamEventType.TextDelta,
          index: index,
          delta: { text: delta.text },
        };
      }
      if (delta.type === 'input_json_delta') {
        if (!state.content[index]) {
          state.content[index] = { type: 'tool_use', id: '', name: '', input: '' };
        }
        state.content[index]!.input =
          (state.content[index]!.input ?? '') + delta.partial_json;
        return {
          type: StreamEventType.ToolCallDelta,
          index: index,
          delta: {
            argumentsJson: delta.partial_json,
            toolCallId: state.content[index]?.id,
            toolName: state.content[index]?.name,
          },
        };
      }
      if (delta.type === 'thinking_delta') {
        return {
          type: StreamEventType.ReasoningDelta,
          index: index,
          delta: { text: delta.thinking },
        };
      }
      return null;
    }

    case 'content_block_stop':
      return { type: StreamEventType.ContentBlockStop, index: event.index ?? state.currentIndex, delta: {} };

    case 'message_delta':
      state.stopReason = event.delta.stop_reason;
      state.outputTokens = event.usage.output_tokens;
      return null;

    case 'message_stop':
      return { type: StreamEventType.MessageStop, index: 0, delta: {} };

    case 'ping':
    case 'error':
      return null;

    default:
      return null;
  }
}

/**
 * Builds the final LLMResponse from accumulated Messages API stream state.
 *
 * Called when streaming is complete to construct the unified response
 * from all the data accumulated during streaming.
 *
 * @param state - The accumulated stream state
 * @returns The complete LLMResponse
 */
export function buildResponseFromState(state: MessagesStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  for (const block of state.content) {
    if (block.type === 'text' && block.text) {
      textContent.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use' && block.id && block.name) {
      let args: Record<string, unknown> = {};
      if (block.input) {
        try {
          args = JSON.parse(block.input);
        } catch {
          // Invalid JSON, use empty object
        }
      }
      if (block.name === 'json_response') {
        structuredData = args;
      }
      toolCalls.push({
        toolCallId: block.id,
        toolName: block.name,
        arguments: args,
      });
    }
  }

  const messageId = state.messageId || generateId();
  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: messageId,
      metadata: {
        xai: {
          stop_reason: state.stopReason,
          model: state.model,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens: state.inputTokens + state.outputTokens,
    cacheReadTokens: state.cacheReadTokens,
    cacheWriteTokens: state.cacheWriteTokens,
  };

  return {
    message,
    usage,
    stopReason: state.stopReason ?? 'end_turn',
    data: structuredData,
  };
}
