import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock, ImageBlock } from '../../types/content.ts';
import {
  AssistantMessage,
  UserMessage,
  ToolResultMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import type {
  AnthropicLLMParams,
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContent,
  AnthropicTool,
  AnthropicResponse,
  AnthropicStreamEvent,
  AnthropicContentBlockDeltaEvent,
} from './types.ts';

/**
 * Transform UPP request to Anthropic format
 */
export function transformRequest<TParams extends AnthropicLLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): AnthropicRequest {
  const params = (request.params ?? {}) as AnthropicLLMParams;

  const anthropicRequest: AnthropicRequest = {
    model: modelId,
    messages: request.messages.map(transformMessage),
  };

  // Only include max_tokens if provided - let Anthropic API enforce its requirement
  if (params.max_tokens !== undefined) {
    anthropicRequest.max_tokens = params.max_tokens;
  }

  // System prompt (top-level in Anthropic)
  if (request.system) {
    anthropicRequest.system = request.system;
  }

  // Model parameters
  if (params.temperature !== undefined) {
    anthropicRequest.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    anthropicRequest.top_p = params.top_p;
  }
  if (params.top_k !== undefined) {
    anthropicRequest.top_k = params.top_k;
  }
  if (params.stop_sequences) {
    anthropicRequest.stop_sequences = params.stop_sequences;
  }
  if (params.metadata) {
    anthropicRequest.metadata = params.metadata;
  }
  if (params.thinking) {
    anthropicRequest.thinking = params.thinking;
  }
  if (params.service_tier !== undefined) {
    anthropicRequest.service_tier = params.service_tier;
  }

  // Tools
  if (request.tools && request.tools.length > 0) {
    anthropicRequest.tools = request.tools.map(transformTool);
    anthropicRequest.tool_choice = { type: 'auto' };
  }

  // Structured output via tool-based approach
  // Anthropic doesn't have native structured output, so we use a tool to enforce the schema
  if (request.structure) {
    const structuredTool: AnthropicTool = {
      name: 'json_response',
      description: 'Return the response in the specified JSON format. You MUST use this tool to provide your response.',
      input_schema: {
        type: 'object',
        properties: request.structure.properties,
        required: request.structure.required,
      },
    };

    // Add the structured output tool (may coexist with user tools)
    anthropicRequest.tools = [...(anthropicRequest.tools ?? []), structuredTool];
    // Force the model to use the json_response tool
    anthropicRequest.tool_choice = { type: 'tool', name: 'json_response' };
  }

  return anthropicRequest;
}

/**
 * Filter to only valid content blocks with a type property
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transform a UPP Message to Anthropic format
 */
function transformMessage(message: Message): AnthropicMessage {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    return {
      role: 'user',
      content: validContent.map(transformContentBlock),
    };
  }

  if (isAssistantMessage(message)) {
    const validContent = filterValidContent(message.content);
    const content: AnthropicContent[] = validContent.map(transformContentBlock);

    // Add tool calls as tool_use content blocks
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

    return {
      role: 'assistant',
      content,
    };
  }

  if (isToolResultMessage(message)) {
    // Tool results are sent as user messages with tool_result content
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
 * Transform a content block to Anthropic format
 */
function transformContentBlock(block: ContentBlock): AnthropicContent {
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
 * Transform a UPP Tool to Anthropic format
 */
function transformTool(tool: Tool): AnthropicTool {
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
 * Transform Anthropic response to UPP LLMResponse
 */
export function transformResponse(data: AnthropicResponse): LLMResponse {
  // Extract text content
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  for (const block of data.content) {
    if (block.type === 'text') {
      textContent.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      // Check if this is the json_response tool (structured output)
      if (block.name === 'json_response') {
        // Extract structured data from tool arguments
        structuredData = block.input;
      }
      toolCalls.push({
        toolCallId: block.id,
        toolName: block.name,
        arguments: block.input,
      });
    }
    // Skip thinking blocks for now
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: data.id,
      metadata: {
        anthropic: {
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
  };

  return {
    message,
    usage,
    stopReason: data.stop_reason ?? 'end_turn',
    data: structuredData,
  };
}

/**
 * State for accumulating streaming response
 */
export interface StreamState {
  messageId: string;
  model: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: string }>;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Create initial stream state
 */
export function createStreamState(): StreamState {
  return {
    messageId: '',
    model: '',
    content: [],
    stopReason: null,
    inputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * Transform Anthropic stream event to UPP StreamEvent
 * Returns null for events that don't produce UPP events
 */
export function transformStreamEvent(
  event: AnthropicStreamEvent,
  state: StreamState
): StreamEvent | null {
  switch (event.type) {
    case 'message_start':
      state.messageId = event.message.id;
      state.model = event.message.model;
      state.inputTokens = event.message.usage.input_tokens;
      return { type: 'message_start', index: 0, delta: {} };

    case 'content_block_start':
      // Initialize content block
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
      return { type: 'content_block_start', index: event.index, delta: {} };

    case 'content_block_delta': {
      const delta = event.delta;
      if (delta.type === 'text_delta') {
        if (state.content[event.index]) {
          state.content[event.index]!.text =
            (state.content[event.index]!.text ?? '') + delta.text;
        }
        return {
          type: 'text_delta',
          index: event.index,
          delta: { text: delta.text },
        };
      }
      if (delta.type === 'input_json_delta') {
        if (state.content[event.index]) {
          state.content[event.index]!.input =
            (state.content[event.index]!.input ?? '') + delta.partial_json;
        }
        return {
          type: 'tool_call_delta',
          index: event.index,
          delta: {
            argumentsJson: delta.partial_json,
            toolCallId: state.content[event.index]?.id,
            toolName: state.content[event.index]?.name,
          },
        };
      }
      if (delta.type === 'thinking_delta') {
        return {
          type: 'reasoning_delta',
          index: event.index,
          delta: { text: delta.thinking },
        };
      }
      return null;
    }

    case 'content_block_stop':
      return { type: 'content_block_stop', index: event.index, delta: {} };

    case 'message_delta':
      state.stopReason = event.delta.stop_reason;
      state.outputTokens = event.usage.output_tokens;
      return null;

    case 'message_stop':
      return { type: 'message_stop', index: 0, delta: {} };

    case 'ping':
    case 'error':
      return null;

    default:
      return null;
  }
}

/**
 * Build LLMResponse from accumulated stream state
 */
export function buildResponseFromState(state: StreamState): LLMResponse {
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
          // Invalid JSON - use empty object
        }
      }
      // Check if this is the json_response tool (structured output)
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

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: state.messageId,
      metadata: {
        anthropic: {
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
  };

  return {
    message,
    usage,
    stopReason: state.stopReason ?? 'end_turn',
    data: structuredData,
  };
}
