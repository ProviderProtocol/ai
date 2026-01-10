/**
 * @fileoverview UPP to Vertex AI Mistral message transformation utilities.
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
  VertexMistralParams,
  VertexMistralRequest,
  VertexMistralMessage,
  VertexMistralTool,
  VertexMistralResponse,
  VertexMistralStreamChunk,
  VertexMistralContentPart,
} from './types.ts';

/**
 * Transforms a UPP LLM request to Vertex AI Mistral format.
 */
export function transformMistralRequest<TParams extends VertexMistralParams>(
  request: LLMRequest<TParams>,
  modelId: string
): VertexMistralRequest {
  const params = (request.params ?? {}) as VertexMistralParams;

  const messages: VertexMistralMessage[] = [];

  if (request.system) {
    messages.push({
      role: 'system',
      content: typeof request.system === 'string'
        ? request.system
        : JSON.stringify(request.system),
    });
  }

  messages.push(...request.messages.map(transformMessage));

  const mistralRequest: VertexMistralRequest = {
    ...params,
    model: modelId,
    messages,
  };

  if (request.tools && request.tools.length > 0) {
    mistralRequest.tools = request.tools.map(transformTool);
    mistralRequest.tool_choice = 'auto';
  }

  if (request.structure) {
    mistralRequest.response_format = { type: 'json_object' };
  }

  return mistralRequest;
}

function transformMessage(message: Message): VertexMistralMessage {
  if (isUserMessage(message)) {
    const hasImages = message.content.some((block) => block.type === 'image');

    if (hasImages) {
      const content: VertexMistralContentPart[] = message.content
        .map(transformContentPart)
        .filter((p): p is VertexMistralContentPart => p !== null);
      return { role: 'user', content };
    }

    return {
      role: 'user',
      content: message.content
        .filter((block): block is TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n'),
    };
  }

  if (isAssistantMessage(message)) {
    const text = message.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');

    const mistralMessage: VertexMistralMessage = {
      role: 'assistant',
      content: text || null,
    };

    if (message.toolCalls) {
      mistralMessage.tool_calls = message.toolCalls.map((call) => ({
        id: call.toolCallId,
        type: 'function' as const,
        function: {
          name: call.toolName,
          arguments: JSON.stringify(call.arguments),
        },
      }));
    }

    return mistralMessage;
  }

  if (isToolResultMessage(message)) {
    return {
      role: 'tool',
      content: message.results
        .map((result) =>
          typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
        )
        .join('\n'),
      tool_call_id: message.results[0]?.toolCallId,
    };
  }

  throw new Error(`Unknown message type: ${message.type}`);
}

function transformContentPart(block: ContentBlock): VertexMistralContentPart | null {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: (block as TextBlock).text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      if (imageBlock.source.type === 'base64') {
        return {
          type: 'image_url',
          image_url: `data:${imageBlock.mimeType};base64,${imageBlock.source.data}`,
        };
      }
      if (imageBlock.source.type === 'bytes') {
        const base64 = btoa(
          Array.from(imageBlock.source.data)
            .map((b) => String.fromCharCode(b))
            .join('')
        );
        return {
          type: 'image_url',
          image_url: `data:${imageBlock.mimeType};base64,${base64}`,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

function transformTool(tool: Tool): VertexMistralTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  };
}

/**
 * Transforms a Vertex AI Mistral response to UPP format.
 */
export function transformMistralResponse(data: VertexMistralResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in Mistral response');
  }

  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];

  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const call of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        args = { _raw: call.function.arguments };
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
      id: data.id,
      metadata: {
        vertex: {
          object: data.object,
          created: data.created,
          model: data.model,
          finish_reason: choice.finish_reason,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  let stopReason = 'end_turn';
  if (choice.finish_reason === 'length') stopReason = 'max_tokens';
  else if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use';

  return {
    message,
    usage,
    stopReason,
  };
}

/**
 * Stream state for accumulating Mistral streaming responses.
 */
export interface MistralStreamState {
  id: string;
  model: string;
  content: string;
  toolCalls: Map<number, {
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

export function createMistralStreamState(): MistralStreamState {
  return {
    id: '',
    model: '',
    content: '',
    toolCalls: new Map(),
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * Transforms a Mistral stream chunk to a UPP stream event.
 */
export function transformMistralStreamChunk(
  chunk: VertexMistralStreamChunk,
  state: MistralStreamState
): StreamEvent | null {
  state.id = chunk.id;
  state.model = chunk.model;

  if (chunk.usage) {
    state.inputTokens = chunk.usage.prompt_tokens;
    state.outputTokens = chunk.usage.completion_tokens;
  }

  const choice = chunk.choices[0];
  if (!choice) return null;

  if (choice.finish_reason) {
    state.finishReason = choice.finish_reason;
  }

  if (choice.delta.content) {
    state.content += choice.delta.content;
    return {
      type: 'text_delta',
      index: 0,
      delta: { text: choice.delta.content },
    };
  }

  if (choice.delta.tool_calls) {
    for (const toolCall of choice.delta.tool_calls) {
      const existing = state.toolCalls.get(toolCall.index);
      if (!existing) {
        state.toolCalls.set(toolCall.index, {
          id: toolCall.id ?? '',
          name: toolCall.function?.name ?? '',
          arguments: toolCall.function?.arguments ?? '',
        });
      } else {
        if (toolCall.function?.arguments) {
          existing.arguments += toolCall.function.arguments;
        }
      }

      if (toolCall.function?.arguments) {
        return {
          type: 'tool_call_delta',
          index: toolCall.index,
          delta: {
            toolCallId: existing?.id ?? toolCall.id,
            toolName: existing?.name ?? toolCall.function?.name,
            argumentsJson: toolCall.function.arguments,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Builds an LLMResponse from accumulated stream state.
 */
export function buildMistralResponseFromState(state: MistralStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];

  if (state.content) {
    textContent.push({ type: 'text', text: state.content });
  }

  for (const [, call] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments);
    } catch {
      args = { _raw: call.arguments };
    }
    toolCalls.push({
      toolCallId: call.id,
      toolName: call.name,
      arguments: args,
    });
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: state.id,
      metadata: {
        vertex: {
          model: state.model,
          finish_reason: state.finishReason,
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

  let stopReason = 'end_turn';
  if (state.finishReason === 'length') stopReason = 'max_tokens';
  else if (state.finishReason === 'tool_calls') stopReason = 'tool_use';

  return {
    message,
    usage,
    stopReason,
  };
}
