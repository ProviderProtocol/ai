/**
 * @fileoverview UPP to Vertex AI MaaS (OpenAI-compatible) message transformation utilities.
 *
 * This transform handles DeepSeek, gpt-oss-120b, and other OpenAI-compatible models
 * available through Vertex AI's Model-as-a-Service endpoints.
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { TextBlock } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import type {
  VertexMaaSParams,
  VertexMaaSRequest,
  VertexMaaSMessage,
  VertexMaaSTool,
  VertexMaaSResponse,
  VertexMaaSStreamChunk,
} from './types.ts';

/**
 * Transforms a UPP LLM request to Vertex AI MaaS format.
 */
export function transformMaaSRequest<TParams extends VertexMaaSParams>(
  request: LLMRequest<TParams>,
  modelId: string
): VertexMaaSRequest {
  const params = (request.params ?? {}) as VertexMaaSParams;

  const messages: VertexMaaSMessage[] = [];

  if (request.system) {
    messages.push({
      role: 'system',
      content: typeof request.system === 'string'
        ? request.system
        : JSON.stringify(request.system),
    });
  }

  messages.push(...request.messages.map(transformMessage));

  const maasRequest: VertexMaaSRequest = {
    ...params,
    model: modelId,
    messages,
  };

  if (request.tools && request.tools.length > 0) {
    maasRequest.tools = request.tools.map(transformTool);
    maasRequest.tool_choice = 'auto';
  }

  if (request.structure) {
    maasRequest.response_format = { type: 'json_object' };
  }

  return maasRequest;
}

function transformMessage(message: Message): VertexMaaSMessage {
  if (isUserMessage(message)) {
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

    const maasMessage: VertexMaaSMessage = {
      role: 'assistant',
      content: text || '',
    };

    if (message.toolCalls) {
      maasMessage.tool_calls = message.toolCalls.map((call) => ({
        id: call.toolCallId,
        type: 'function' as const,
        function: {
          name: call.toolName,
          arguments: JSON.stringify(call.arguments),
        },
      }));
    }

    return maasMessage;
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

function transformTool(tool: Tool): VertexMaaSTool {
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
 * Transforms a Vertex AI MaaS response to UPP format.
 */
export function transformMaaSResponse(data: VertexMaaSResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in MaaS response');
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
          reasoning_content: choice.message.reasoning_content,
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
 * Stream state for accumulating MaaS streaming responses.
 */
export interface MaaSStreamState {
  id: string;
  model: string;
  content: string;
  reasoningContent: string;
  toolCalls: Map<number, {
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

export function createMaaSStreamState(): MaaSStreamState {
  return {
    id: '',
    model: '',
    content: '',
    reasoningContent: '',
    toolCalls: new Map(),
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * Transforms a MaaS stream chunk to a UPP stream event.
 */
export function transformMaaSStreamChunk(
  chunk: VertexMaaSStreamChunk,
  state: MaaSStreamState
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

  if (choice.delta.reasoning_content) {
    state.reasoningContent += choice.delta.reasoning_content;
    return {
      type: 'reasoning_delta',
      index: 0,
      delta: { text: choice.delta.reasoning_content },
    };
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
export function buildMaaSResponseFromState(state: MaaSStreamState): LLMResponse {
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
          reasoning_content: state.reasoningContent || undefined,
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
