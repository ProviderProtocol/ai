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
  OpenAILLMParams,
  OpenAICompletionsRequest,
  OpenAICompletionsMessage,
  OpenAIUserContent,
  OpenAICompletionsTool,
  OpenAICompletionsResponse,
  OpenAICompletionsStreamChunk,
  OpenAIToolCall,
} from './types.ts';

/**
 * Transform UPP request to OpenAI Chat Completions format
 */
export function transformRequest<TParams extends OpenAILLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): OpenAICompletionsRequest {
  const params: OpenAILLMParams = request.params ?? {};

  const openaiRequest: OpenAICompletionsRequest = {
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  // Model parameters
  if (params.temperature !== undefined) {
    openaiRequest.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    openaiRequest.top_p = params.top_p;
  }
  if (params.max_completion_tokens !== undefined) {
    openaiRequest.max_completion_tokens = params.max_completion_tokens;
  } else if (params.max_tokens !== undefined) {
    openaiRequest.max_tokens = params.max_tokens;
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
  if (params.n !== undefined) {
    openaiRequest.n = params.n;
  }
  if (params.logprobs !== undefined) {
    openaiRequest.logprobs = params.logprobs;
  }
  if (params.top_logprobs !== undefined) {
    openaiRequest.top_logprobs = params.top_logprobs;
  }
  if (params.seed !== undefined) {
    openaiRequest.seed = params.seed;
  }
  if (params.user !== undefined) {
    openaiRequest.user = params.user;
  }
  if (params.logit_bias !== undefined) {
    openaiRequest.logit_bias = params.logit_bias;
  }
  if (params.reasoning_effort !== undefined) {
    openaiRequest.reasoning_effort = params.reasoning_effort;
  }
  if (params.verbosity !== undefined) {
    openaiRequest.verbosity = params.verbosity;
  }
  if (params.service_tier !== undefined) {
    openaiRequest.service_tier = params.service_tier;
  }
  if (params.store !== undefined) {
    openaiRequest.store = params.store;
  }
  if (params.metadata !== undefined) {
    openaiRequest.metadata = params.metadata;
  }

  // Tools
  if (request.tools && request.tools.length > 0) {
    openaiRequest.tools = request.tools.map(transformTool);
    if (params.parallel_tool_calls !== undefined) {
      openaiRequest.parallel_tool_calls = params.parallel_tool_calls;
    }
  }

  // Structured output via response_format
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

    openaiRequest.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  } else if (params.response_format !== undefined) {
    // Pass through response_format from params if no structure is defined
    openaiRequest.response_format = params.response_format;
  }

  return openaiRequest;
}

/**
 * Transform messages including system prompt
 */
function transformMessages(
  messages: Message[],
  system?: string
): OpenAICompletionsMessage[] {
  const result: OpenAICompletionsMessage[] = [];

  // Add system message first if present
  if (system) {
    result.push({
      role: 'system',
      content: system,
    });
  }

  // Transform each message
  for (const message of messages) {
    // Handle tool result messages specially - they need to produce multiple messages
    if (isToolResultMessage(message)) {
      const toolMessages = transformToolResults(message);
      result.push(...toolMessages);
    } else {
      const transformed = transformMessage(message);
      if (transformed) {
        result.push(transformed);
      }
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
 * Transform a UPP Message to OpenAI format
 */
function transformMessage(message: Message): OpenAICompletionsMessage | null {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    // Check if we can use simple string content
    if (validContent.length === 1 && validContent[0]?.type === 'text') {
      return {
        role: 'user',
        content: (validContent[0] as TextBlock).text,
      };
    }
    return {
      role: 'user',
      content: validContent.map(transformContentBlock),
    };
  }

  if (isAssistantMessage(message)) {
    const validContent = filterValidContent(message.content);
    // Extract text content
    const textContent = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    const assistantMessage: OpenAICompletionsMessage = {
      role: 'assistant',
      content: textContent || null,
    };

    // Add tool calls if present
    if (message.toolCalls && message.toolCalls.length > 0) {
      (assistantMessage as { tool_calls?: OpenAIToolCall[] }).tool_calls =
        message.toolCalls.map((call) => ({
          id: call.toolCallId,
          type: 'function' as const,
          function: {
            name: call.toolName,
            arguments: JSON.stringify(call.arguments),
          },
        }));
    }

    return assistantMessage;
  }

  if (isToolResultMessage(message)) {
    // Tool results are sent as individual tool messages
    // Return the first one and handle multiple in a different way
    // Actually, we need to return multiple messages for multiple tool results
    // This is handled by the caller - transform each result to a message
    const results = message.results.map((result) => ({
      role: 'tool' as const,
      tool_call_id: result.toolCallId,
      content:
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
    }));

    // For now, return the first result - caller should handle multiple
    return results[0] ?? null;
  }

  return null;
}

/**
 * Transform multiple tool results to messages
 */
export function transformToolResults(
  message: Message
): OpenAICompletionsMessage[] {
  if (!isToolResultMessage(message)) {
    const single = transformMessage(message);
    return single ? [single] : [];
  }

  return message.results.map((result) => ({
    role: 'tool' as const,
    tool_call_id: result.toolCallId,
    content:
      typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result),
  }));
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

      if (imageBlock.source.type === 'base64') {
        url = `data:${imageBlock.mimeType};base64,${imageBlock.source.data}`;
      } else if (imageBlock.source.type === 'url') {
        url = imageBlock.source.url;
      } else if (imageBlock.source.type === 'bytes') {
        // Convert bytes to base64
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
function transformTool(tool: Tool): OpenAICompletionsTool {
  return {
    type: 'function',
    function: {
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
    },
  };
}

/**
 * Transform OpenAI response to UPP LLMResponse
 */
export function transformResponse(data: OpenAICompletionsResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in OpenAI response');
  }

  // Extract text content
  const textContent: TextBlock[] = [];
  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
  }
  let hadRefusal = false;
  if (choice.message.refusal) {
    textContent.push({ type: 'text', text: choice.message.refusal });
    hadRefusal = true;
  }

  // Extract tool calls
  const toolCalls: ToolCall[] = [];
  if (choice.message.tool_calls) {
    for (const call of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Invalid JSON - use empty object
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
        openai: {
          model: data.model,
          finish_reason: choice.finish_reason,
          system_fingerprint: data.system_fingerprint,
          service_tier: data.service_tier,
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
  };

  // Map finish reason to stop reason
  let stopReason = 'end_turn';
  switch (choice.finish_reason) {
    case 'stop':
      stopReason = 'end_turn';
      break;
    case 'length':
      stopReason = 'max_tokens';
      break;
    case 'tool_calls':
      stopReason = 'tool_use';
      break;
    case 'content_filter':
      stopReason = 'content_filter';
      break;
  }
  if (hadRefusal && stopReason !== 'content_filter') {
    stopReason = 'content_filter';
  }

  return {
    message,
    usage,
    stopReason,
  };
}

/**
 * State for accumulating streaming response
 */
export interface CompletionsStreamState {
  id: string;
  model: string;
  text: string;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
  hadRefusal: boolean;
}

/**
 * Create initial stream state
 */
export function createStreamState(): CompletionsStreamState {
  return {
    id: '',
    model: '',
    text: '',
    toolCalls: new Map(),
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transform OpenAI stream chunk to UPP StreamEvent
 * Returns array since one chunk may produce multiple events
 */
export function transformStreamEvent(
  chunk: OpenAICompletionsStreamChunk,
  state: CompletionsStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  // Update state with basic info
  if (chunk.id && !state.id) {
    state.id = chunk.id;
    events.push({ type: 'message_start', index: 0, delta: {} });
  }
  if (chunk.model) {
    state.model = chunk.model;
  }

  // Process choices
  const choice = chunk.choices[0];
  if (choice) {
    // Text delta
    if (choice.delta.content) {
      state.text += choice.delta.content;
      events.push({
        type: 'text_delta',
        index: 0,
        delta: { text: choice.delta.content },
      });
    }
    if (choice.delta.refusal) {
      state.hadRefusal = true;
      state.text += choice.delta.refusal;
      events.push({
        type: 'text_delta',
        index: 0,
        delta: { text: choice.delta.refusal },
      });
    }

    // Tool call deltas
    if (choice.delta.tool_calls) {
      for (const toolCallDelta of choice.delta.tool_calls) {
        const index = toolCallDelta.index;
        let toolCall = state.toolCalls.get(index);

        if (!toolCall) {
          toolCall = { id: '', name: '', arguments: '' };
          state.toolCalls.set(index, toolCall);
        }

        if (toolCallDelta.id) {
          toolCall.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          toolCall.name = toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          toolCall.arguments += toolCallDelta.function.arguments;
          events.push({
            type: 'tool_call_delta',
            index: index,
            delta: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              argumentsJson: toolCallDelta.function.arguments,
            },
          });
        }
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      state.finishReason = choice.finish_reason;
      events.push({ type: 'message_stop', index: 0, delta: {} });
    }
  }

  // Usage info (usually comes at the end with stream_options.include_usage)
  if (chunk.usage) {
    state.inputTokens = chunk.usage.prompt_tokens;
    state.outputTokens = chunk.usage.completion_tokens;
  }

  return events;
}

/**
 * Build LLMResponse from accumulated stream state
 */
export function buildResponseFromState(state: CompletionsStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  if (state.text) {
    textContent.push({ type: 'text', text: state.text });
  }

  const toolCalls: ToolCall[] = [];
  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON - use empty object
      }
    }
    toolCalls.push({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
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

  // Map finish reason to stop reason
  let stopReason = 'end_turn';
  switch (state.finishReason) {
    case 'stop':
      stopReason = 'end_turn';
      break;
    case 'length':
      stopReason = 'max_tokens';
      break;
    case 'tool_calls':
      stopReason = 'tool_use';
      break;
    case 'content_filter':
      stopReason = 'content_filter';
      break;
  }
  if (state.hadRefusal && stopReason !== 'content_filter') {
    stopReason = 'content_filter';
  }

  return {
    message,
    usage,
    stopReason,
  };
}
