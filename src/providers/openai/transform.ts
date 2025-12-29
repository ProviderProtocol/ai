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
  OpenAILLMParams,
  OpenAIRequest,
  OpenAIMessage,
  OpenAIUserContent,
  OpenAITool,
  OpenAIResponse,
  OpenAIStreamChunk,
  OpenAIStreamToolCall,
} from './types.ts';

/**
 * Transform UPP request to OpenAI format
 */
export function transformRequest<TParams extends OpenAILLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): OpenAIRequest {
  const params = (request.params ?? {}) as OpenAILLMParams;
  const messages: OpenAIMessage[] = [];

  // Add system message if provided
  if (request.system) {
    messages.push({
      role: 'system',
      content: request.system,
    });
  }

  // Transform conversation messages
  for (const msg of request.messages) {
    if (isToolResultMessage(msg)) {
      // OpenAI requires each tool result as a separate message
      for (const result of msg.results) {
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content:
            typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result),
        });
      }
    } else {
      messages.push(transformMessage(msg));
    }
  }

  const openaiRequest: OpenAIRequest = {
    model: modelId,
    messages,
  };

  // Model parameters
  if (params.max_completion_tokens !== undefined) {
    openaiRequest.max_completion_tokens = params.max_completion_tokens;
  } else if (params.max_tokens !== undefined) {
    openaiRequest.max_tokens = params.max_tokens;
  }
  if (params.temperature !== undefined) {
    openaiRequest.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    openaiRequest.top_p = params.top_p;
  }
  if (params.frequency_penalty !== undefined) {
    openaiRequest.frequency_penalty = params.frequency_penalty;
  }
  if (params.presence_penalty !== undefined) {
    openaiRequest.presence_penalty = params.presence_penalty;
  }
  if (params.stop !== undefined) {
    openaiRequest.stop = params.stop;
  }
  if (params.seed !== undefined) {
    openaiRequest.seed = params.seed;
  }
  if (params.user !== undefined) {
    openaiRequest.user = params.user;
  }
  if (params.response_format !== undefined) {
    openaiRequest.response_format = params.response_format;
  }

  // Tools
  if (request.tools && request.tools.length > 0) {
    openaiRequest.tools = request.tools.map(transformTool);
    openaiRequest.tool_choice = 'auto';
  }

  // Structured output
  if (request.structure) {
    // OpenAI requires additionalProperties: false for strict mode
    const schemaWithAdditional = {
      ...request.structure,
      additionalProperties: false,
    };
    openaiRequest.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: schemaWithAdditional as unknown as Record<string, unknown>,
        strict: true,
      },
    };
  }

  return openaiRequest;
}

/**
 * Transform a UPP Message to OpenAI format
 */
function transformMessage(message: Message): OpenAIMessage {
  if (isUserMessage(message)) {
    const content = message.content;

    // Filter to only valid content blocks with a type property
    const validContent = content.filter((c) => c && typeof c.type === 'string');

    // Check if we have image/audio/video content (need multimodal format)
    const hasMultimodal = validContent.some((c) => c.type === 'image' || c.type === 'audio' || c.type === 'video');

    if (hasMultimodal) {
      return {
        role: 'user',
        content: validContent.map(transformContentBlock),
      };
    }

    // Simple text format
    return {
      role: 'user',
      content: validContent
        .filter((c): c is TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n\n'),
    };
  }

  if (isAssistantMessage(message)) {
    const textContent = message.content
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n\n');

    const result: OpenAIMessage = {
      role: 'assistant',
      content: textContent || null,
    };

    // Add tool calls
    if (message.toolCalls && message.toolCalls.length > 0) {
      (result as any).tool_calls = message.toolCalls.map((call) => ({
        id: call.toolCallId,
        type: 'function' as const,
        function: {
          name: call.toolName,
          arguments: JSON.stringify(call.arguments),
        },
      }));
    }

    return result;
  }

  // Note: ToolResultMessage is handled separately in transformRequest
  // to expand into multiple tool messages
  throw new Error(`Unknown message type: ${message.type}`);
}

/**
 * Transform a content block to OpenAI format
 */
function transformContentBlock(block: ContentBlock): OpenAIUserContent {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };

    case 'image': {
      const imageBlock = block as ImageBlock;
      let url: string;

      if (imageBlock.source.type === 'url') {
        url = imageBlock.source.url;
      } else if (imageBlock.source.type === 'base64') {
        url = `data:${imageBlock.mimeType};base64,${imageBlock.source.data}`;
      } else if (imageBlock.source.type === 'bytes') {
        const base64 = btoa(
          Array.from(imageBlock.source.data)
            .map((b) => String.fromCharCode(b))
            .join('')
        );
        url = `data:${imageBlock.mimeType};base64,${base64}`;
      } else {
        throw new Error('Unknown image source type');
      }

      return {
        type: 'image_url',
        image_url: { url },
      };
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transform a UPP Tool to OpenAI format
 */
function transformTool(tool: Tool): OpenAITool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
        additionalProperties: tool.parameters.additionalProperties,
      },
    },
  };
}

/**
 * Transform OpenAI response to UPP LLMResponse
 */
export function transformResponse(data: OpenAIResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in OpenAI response');
  }

  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];

  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      toolCalls.push({
        toolCallId: tc.id,
        toolName: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      });
    }
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: data.id,
      metadata: {
        openai: {
          model: data.model,
          finish_reason: choice.finish_reason,
          system_fingerprint: data.system_fingerprint,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
  };

  return {
    message,
    usage,
    stopReason: choice.finish_reason ?? 'stop',
  };
}

/**
 * State for accumulating streaming response
 */
export interface StreamState {
  id: string;
  model: string;
  content: string;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Create initial stream state
 */
export function createStreamState(): StreamState {
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
 * Transform OpenAI stream chunk to UPP StreamEvent
 */
export function transformStreamChunk(
  chunk: OpenAIStreamChunk,
  state: StreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  state.id = chunk.id;
  state.model = chunk.model;

  // Handle usage (when stream_options.include_usage is true)
  if (chunk.usage) {
    state.inputTokens = chunk.usage.prompt_tokens;
    state.outputTokens = chunk.usage.completion_tokens;
  }

  const choice = chunk.choices[0];
  if (!choice) {
    return events;
  }

  const delta = choice.delta;

  // First chunk with role
  if (delta.role === 'assistant') {
    events.push({ type: 'message_start', index: 0, delta: {} });
  }

  // Text content
  if (delta.content) {
    state.content += delta.content;
    events.push({
      type: 'text_delta',
      index: 0,
      delta: { text: delta.content },
    });
  }

  // Tool calls
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      const existing = state.toolCalls.get(tc.index);

      if (tc.id) {
        // New tool call
        state.toolCalls.set(tc.index, {
          id: tc.id,
          name: tc.function?.name ?? '',
          arguments: tc.function?.arguments ?? '',
        });
      } else if (existing) {
        // Update existing
        if (tc.function?.name) {
          existing.name = tc.function.name;
        }
        if (tc.function?.arguments) {
          existing.arguments += tc.function.arguments;
          events.push({
            type: 'tool_call_delta',
            index: tc.index,
            delta: {
              toolCallId: existing.id,
              toolName: existing.name,
              argumentsJson: tc.function.arguments,
            },
          });
        }
      }
    }
  }

  // Finish reason
  if (choice.finish_reason) {
    state.finishReason = choice.finish_reason;
    events.push({ type: 'message_stop', index: 0, delta: {} });
  }

  return events;
}

/**
 * Build LLMResponse from accumulated stream state
 */
export function buildResponseFromState(state: StreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];

  if (state.content) {
    textContent.push({ type: 'text', text: state.content });
  }

  for (const [_, tc] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments);
    } catch {
      // Invalid JSON
    }
    toolCalls.push({
      toolCallId: tc.id,
      toolName: tc.name,
      arguments: args,
    });
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: state.id,
      metadata: {
        openai: {
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
  };

  return {
    message,
    usage,
    stopReason: state.finishReason ?? 'stop',
  };
}
