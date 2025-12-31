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
  XAICompletionsRequest,
  XAICompletionsMessage,
  XAIUserContent,
  XAICompletionsTool,
  XAICompletionsResponse,
  XAICompletionsStreamChunk,
  XAIToolCall,
} from './types.ts';

/**
 * Transform UPP request to xAI Chat Completions format
 */
export function transformRequest<TParams extends XAILLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): XAICompletionsRequest {
  const params: XAILLMParams = request.params ?? {};

  const xaiRequest: XAICompletionsRequest = {
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  // Model parameters
  if (params.temperature !== undefined) {
    xaiRequest.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    xaiRequest.top_p = params.top_p;
  }
  if (params.max_completion_tokens !== undefined) {
    xaiRequest.max_completion_tokens = params.max_completion_tokens;
  } else if (params.max_tokens !== undefined) {
    xaiRequest.max_tokens = params.max_tokens;
  }
  if (params.frequency_penalty !== undefined) {
    xaiRequest.frequency_penalty = params.frequency_penalty;
  }
  if (params.presence_penalty !== undefined) {
    xaiRequest.presence_penalty = params.presence_penalty;
  }
  if (params.stop !== undefined) {
    xaiRequest.stop = params.stop;
  }
  if (params.n !== undefined) {
    xaiRequest.n = params.n;
  }
  if (params.logprobs !== undefined) {
    xaiRequest.logprobs = params.logprobs;
  }
  if (params.top_logprobs !== undefined) {
    xaiRequest.top_logprobs = params.top_logprobs;
  }
  if (params.seed !== undefined) {
    xaiRequest.seed = params.seed;
  }
  if (params.user !== undefined) {
    xaiRequest.user = params.user;
  }
  if (params.logit_bias !== undefined) {
    xaiRequest.logit_bias = params.logit_bias;
  }
  if (params.reasoning_effort !== undefined) {
    xaiRequest.reasoning_effort = params.reasoning_effort;
  }
  if (params.store !== undefined) {
    xaiRequest.store = params.store;
  }
  if (params.metadata !== undefined) {
    xaiRequest.metadata = params.metadata;
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

    xaiRequest.response_format = {
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
    xaiRequest.response_format = params.response_format;
  }

  return xaiRequest;
}

/**
 * Transform messages including system prompt
 */
function transformMessages(
  messages: Message[],
  system?: string
): XAICompletionsMessage[] {
  const result: XAICompletionsMessage[] = [];

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
 * Transform a UPP Message to xAI format
 */
function transformMessage(message: Message): XAICompletionsMessage | null {
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

    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

    const assistantMessage: XAICompletionsMessage = {
      role: 'assistant',
      // xAI/OpenAI: content should be null when tool_calls are present and there's no text
      content: hasToolCalls && !textContent ? null : textContent,
    };

    // Add tool calls if present
    if (hasToolCalls) {
      (assistantMessage as { tool_calls?: XAIToolCall[] }).tool_calls =
        message.toolCalls!.map((call) => ({
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
): XAICompletionsMessage[] {
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
 * Transform a content block to xAI format
 */
function transformContentBlock(block: ContentBlock): XAIUserContent {
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
 * Transform a UPP Tool to xAI format
 */
function transformTool(tool: Tool): XAICompletionsTool {
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
 * Transform xAI response to UPP LLMResponse
 */
export function transformResponse(data: XAICompletionsResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in xAI response');
  }

  // Extract text content
  const textContent: TextBlock[] = [];
  let structuredData: unknown;
  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
    // Try to parse as JSON for structured output (native JSON mode)
    try {
      structuredData = JSON.parse(choice.message.content);
    } catch {
      // Not valid JSON - that's fine, might not be structured output
    }
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
        xai: {
          model: data.model,
          finish_reason: choice.finish_reason,
          system_fingerprint: data.system_fingerprint,
          citations: data.citations,
          inline_citations: data.inline_citations,
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
    data: structuredData,
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
 * Transform xAI stream chunk to UPP StreamEvent
 * Returns array since one chunk may produce multiple events
 */
export function transformStreamEvent(
  chunk: XAICompletionsStreamChunk,
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
  let structuredData: unknown;
  if (state.text) {
    textContent.push({ type: 'text', text: state.text });
    // Try to parse as JSON for structured output (native JSON mode)
    try {
      structuredData = JSON.parse(state.text);
    } catch {
      // Not valid JSON - that's fine, might not be structured output
    }
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
        xai: {
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
    data: structuredData,
  };
}
