/**
 * @fileoverview UPP to Vertex AI Claude message transformation utilities.
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
  VertexClaudeParams,
  VertexClaudeRequest,
  VertexClaudeMessage,
  VertexClaudeContent,
  VertexClaudeTool,
  VertexClaudeResponse,
  VertexClaudeStreamEvent,
  VertexClaudeResponseContent,
} from './types.ts';

/**
 * Transforms a UPP LLM request to Vertex AI Claude format.
 */
export function transformClaudeRequest<TParams extends VertexClaudeParams>(
  request: LLMRequest<TParams>,
  _modelId: string
): VertexClaudeRequest {
  const params = (request.params ?? {}) as VertexClaudeParams;
  const { max_tokens, ...restParams } = params;

  const claudeRequest: VertexClaudeRequest = {
    ...restParams,
    anthropic_version: 'vertex-2023-10-16',
    messages: request.messages.map(transformMessage),
    max_tokens: max_tokens ?? 4096,
  };

  if (request.system) {
    if (typeof request.system === 'string') {
      claudeRequest.system = request.system;
    } else if (Array.isArray(request.system)) {
      claudeRequest.system = request.system as VertexClaudeRequest['system'];
    }
  }

  if (request.tools && request.tools.length > 0) {
    claudeRequest.tools = request.tools.map(transformTool);
    claudeRequest.tool_choice = { type: 'auto' };
  }

  if (request.structure) {
    const structuredTool: VertexClaudeTool = {
      name: 'json_response',
      description: 'Return the response in the specified JSON format. You MUST use this tool.',
      input_schema: {
        type: 'object',
        properties: request.structure.properties,
        required: request.structure.required,
      },
    };

    claudeRequest.tools = [...(claudeRequest.tools ?? []), structuredTool];
    claudeRequest.tool_choice = { type: 'tool', name: 'json_response' };
  }

  return claudeRequest;
}

function transformMessage(message: Message): VertexClaudeMessage {
  if (isUserMessage(message)) {
    return {
      role: 'user',
      content: message.content.map(transformContentBlock).filter((c): c is VertexClaudeContent => c !== null),
    };
  }

  if (isAssistantMessage(message)) {
    const content: VertexClaudeContent[] = message.content
      .map(transformContentBlock)
      .filter((c): c is VertexClaudeContent => c !== null);

    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: call.toolCallId,
          name: call.toolName,
          input: call.arguments as Record<string, unknown>,
        });
      }
    }

    return { role: 'assistant', content };
  }

  if (isToolResultMessage(message)) {
    return {
      role: 'user',
      content: message.results.map((result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
        is_error: result.isError,
      })),
    };
  }

  throw new Error(`Unknown message type: ${message.type}`);
}

function transformContentBlock(block: ContentBlock): VertexClaudeContent | null {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: (block as TextBlock).text };

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
      if (imageBlock.source.type === 'bytes') {
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
      return null;
    }

    default:
      return null;
  }
}

function transformTool(tool: Tool): VertexClaudeTool {
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
 * Transforms a Vertex AI Claude response to UPP format.
 */
export function transformClaudeResponse(data: VertexClaudeResponse): LLMResponse {
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
        vertex: {
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
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  return {
    message,
    usage,
    stopReason: data.stop_reason ?? 'end_turn',
    data: structuredData,
  };
}

/**
 * Stream state for accumulating Claude streaming responses.
 */
export interface ClaudeStreamState {
  messageId: string;
  model: string;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: string;
  }>;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

export function createClaudeStreamState(): ClaudeStreamState {
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
 * Transforms a Claude stream event to a UPP stream event.
 */
export function transformClaudeStreamEvent(
  event: VertexClaudeStreamEvent,
  state: ClaudeStreamState
): StreamEvent | null {
  switch (event.type) {
    case 'message_start':
      state.messageId = event.message.id;
      state.model = event.message.model;
      state.inputTokens = event.message.usage.input_tokens;
      return { type: 'message_start', index: 0, delta: {} };

    case 'content_block_start':
      if (event.content_block.type === 'text') {
        state.content[event.index] = { type: 'text', text: '' };
      } else if (event.content_block.type === 'tool_use') {
        const block = event.content_block as VertexClaudeResponseContent & { id: string; name: string };
        state.content[event.index] = {
          type: 'tool_use',
          id: block.id,
          name: block.name,
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
 * Builds an LLMResponse from accumulated stream state.
 */
export function buildClaudeResponseFromState(state: ClaudeStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  for (const block of state.content) {
    if (!block) continue;

    if (block.type === 'text' && block.text) {
      textContent.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use' && block.id && block.name) {
      let args: Record<string, unknown> = {};
      if (block.input) {
        try {
          args = JSON.parse(block.input);
        } catch {
          // Invalid JSON
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

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: state.messageId,
      metadata: {
        vertex: {
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
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  return {
    message,
    usage,
    stopReason: state.stopReason ?? 'end_turn',
    data: structuredData,
  };
}
