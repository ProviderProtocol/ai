import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { ContentBlock, TextBlock, ImageBlock, AssistantContent } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  XAICompletionsParams,
  XAICompletionsRequest,
  XAICompletionsMessage,
  XAIUserContent,
  XAICompletionsTool,
  XAICompletionsResponse,
  XAICompletionsStreamChunk,
  XAIToolCall,
} from './types.ts';

/**
 * Normalizes system prompt to string.
 * Converts array format to concatenated string for providers that only support strings.
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
 * Filters content blocks to only those with a valid type property.
 *
 * @param content - Array of content blocks
 * @returns Filtered array with only valid content blocks
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transforms a UPP content block to xAI user content format.
 *
 * @param block - The content block to transform
 * @returns The xAI-formatted user content
 * @throws Error if the content type is unsupported
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
        const base64 = Buffer.from(imageBlock.source.data).toString('base64');
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
 * Transforms a single UPP message to xAI Chat Completions format.
 *
 * @param message - The UPP message to transform
 * @returns The xAI-formatted message or null if unsupported
 */
function transformMessage(message: Message): XAICompletionsMessage | null {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
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
    const textContent = validContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

    const assistantMessage: XAICompletionsMessage = {
      role: 'assistant',
      content: hasToolCalls && !textContent ? null : textContent,
    };

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
    const results = message.results.map((result) => ({
      role: 'tool' as const,
      tool_call_id: result.toolCallId,
      content:
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
    }));
    return results[0] ?? null;
  }

  return null;
}

/**
 * Transforms tool result messages into multiple xAI tool messages.
 *
 * Tool results in xAI's Chat Completions API require separate messages
 * for each tool call result.
 *
 * @param message - The UPP message containing tool results
 * @returns Array of xAI tool messages
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
 * Transforms UPP messages to xAI Chat Completions message format.
 *
 * @param messages - The array of UPP messages
 * @param system - Optional system prompt (string or array, normalized to string)
 * @returns Array of xAI-formatted messages
 */
function transformMessages(
  messages: Message[],
  system?: string | unknown[]
): XAICompletionsMessage[] {
  const result: XAICompletionsMessage[] = [];
  const normalizedSystem = normalizeSystem(system);

  if (normalizedSystem) {
    result.push({
      role: 'system',
      content: normalizedSystem,
    });
  }

  for (const message of messages) {
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
 * Transforms a UPP tool definition to xAI Chat Completions format.
 *
 * @param tool - The UPP tool definition
 * @returns The xAI-formatted tool definition
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
 * Transforms a UPP LLM request to the xAI Chat Completions API format.
 *
 * All params are spread directly to enable pass-through of xAI API fields
 * not explicitly defined in our types. This allows developers to use new
 * API features without waiting for library updates.
 *
 * @param request - The unified provider protocol request
 * @param modelId - The xAI model identifier
 * @returns The transformed xAI Chat Completions request body
 */
export function transformRequest(
  request: LLMRequest<XAICompletionsParams>,
  modelId: string
): XAICompletionsRequest {
  const params = request.params ?? ({} as XAICompletionsParams);

  const xaiRequest: XAICompletionsRequest = {
    ...params,
    model: modelId,
    messages: transformMessages(request.messages, request.system),
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

    xaiRequest.response_format = {
      type: 'json_schema',
      json_schema: {
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
 * Transforms an xAI Chat Completions response to the UPP LLMResponse format.
 *
 * @param data - The xAI Chat Completions API response
 * @returns The unified provider protocol response
 * @throws Error if no choices are present in the response
 */
export function transformResponse(data: XAICompletionsResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in xAI response');
  }

  const content: AssistantContent[] = [];
  let structuredData: unknown;

  // Extract reasoning content (grok-3-mini only)
  if (choice.message.reasoning_content) {
    content.push({ type: 'reasoning', text: choice.message.reasoning_content });
  }

  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content });
    try {
      structuredData = JSON.parse(choice.message.content);
    } catch {
      // Not valid JSON, which is fine for non-structured responses
    }
  }
  let hadRefusal = false;
  if (choice.message.refusal) {
    content.push({ type: 'text', text: choice.message.refusal });
    hadRefusal = true;
  }

  const toolCalls: ToolCall[] = [];
  if (choice.message.tool_calls) {
    for (const call of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Invalid JSON, use empty object
      }
      toolCalls.push({
        toolCallId: call.id,
        toolName: call.function.name,
        arguments: args,
      });
    }
  }

  const responseId = data.id || generateId();
  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: responseId,
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
    cacheReadTokens: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };

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
 * State object for accumulating data during streaming responses.
 *
 * This state is progressively updated as stream chunks arrive and is used
 * to build the final LLMResponse when streaming completes.
 */
export interface CompletionsStreamState {
  /** Response identifier */
  id: string;
  /** Model used for generation */
  model: string;
  /** Accumulated text content */
  text: string;
  /** Accumulated reasoning content (grok-3-mini only) */
  reasoning: string;
  /** Map of tool call index to accumulated tool call data */
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  /** Final finish reason from the API */
  finishReason: string | null;
  /** Total input tokens (from usage chunk) */
  inputTokens: number;
  /** Total output tokens (from usage chunk) */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
  /** Whether a refusal message was received */
  hadRefusal: boolean;
}

/**
 * Creates a new initialized stream state for accumulating streaming data.
 *
 * @returns A fresh CompletionsStreamState with default values
 */
export function createStreamState(): CompletionsStreamState {
  return {
    id: '',
    model: '',
    text: '',
    reasoning: '',
    toolCalls: new Map(),
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transforms an xAI Chat Completions stream chunk to UPP StreamEvents.
 *
 * A single chunk may produce multiple events (e.g., text delta + tool call delta).
 * The state object is mutated to accumulate data for the final response.
 *
 * @param chunk - The xAI streaming chunk
 * @param state - The mutable stream state to update
 * @returns Array of UPP stream events (may be empty)
 */
export function transformStreamEvent(
  chunk: XAICompletionsStreamChunk,
  state: CompletionsStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (chunk.id && !state.id) {
    state.id = chunk.id;
    events.push({ type: StreamEventType.MessageStart, index: 0, delta: {} });
  }
  if (chunk.model) {
    state.model = chunk.model;
  }

  const choice = chunk.choices[0];
  if (choice) {
    // Handle reasoning content delta (grok-3-mini only)
    if (choice.delta.reasoning_content) {
      state.reasoning += choice.delta.reasoning_content;
      events.push({
        type: StreamEventType.ReasoningDelta,
        index: 0,
        delta: { text: choice.delta.reasoning_content },
      });
    }
    if (choice.delta.content) {
      state.text += choice.delta.content;
      events.push({
        type: StreamEventType.TextDelta,
        index: 0,
        delta: { text: choice.delta.content },
      });
    }
    if (choice.delta.refusal) {
      state.hadRefusal = true;
      state.text += choice.delta.refusal;
      events.push({
        type: StreamEventType.TextDelta,
        index: 0,
        delta: { text: choice.delta.refusal },
      });
    }

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
            type: StreamEventType.ToolCallDelta,
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

    if (choice.finish_reason) {
      state.finishReason = choice.finish_reason;
      events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
    }
  }

  if (chunk.usage) {
    state.inputTokens = chunk.usage.prompt_tokens;
    state.outputTokens = chunk.usage.completion_tokens;
    state.cacheReadTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
  }

  return events;
}

/**
 * Builds the final LLMResponse from accumulated stream state.
 *
 * Called when streaming is complete to construct the unified response
 * from all the data accumulated during streaming.
 *
 * @param state - The accumulated stream state
 * @returns The complete LLMResponse
 */
export function buildResponseFromState(state: CompletionsStreamState): LLMResponse {
  const content: AssistantContent[] = [];
  let structuredData: unknown;

  // Add reasoning content first (grok-3-mini only)
  if (state.reasoning) {
    content.push({ type: 'reasoning', text: state.reasoning });
  }

  if (state.text) {
    content.push({ type: 'text', text: state.text });
    try {
      structuredData = JSON.parse(state.text);
    } catch {
      // Not valid JSON, which is fine for non-structured responses
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON, use empty object
      }
    }
    toolCalls.push({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: args,
    });
  }

  const messageId = state.id || generateId();
  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: messageId,
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
    cacheReadTokens: state.cacheReadTokens,
    cacheWriteTokens: 0,
  };

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
