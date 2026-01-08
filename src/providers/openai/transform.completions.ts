/**
 * @fileoverview Chat Completions API Message Transformers
 *
 * This module provides transformation functions for converting between the
 * Universal Provider Protocol (UPP) message format and OpenAI's Chat Completions
 * API format. It handles both request transformation (UPP -> OpenAI) and response
 * transformation (OpenAI -> UPP), including streaming event transformation.
 *
 * Key transformations handled:
 * - Message format conversion (user, assistant, system, tool messages)
 * - Content block handling (text, images)
 * - Tool/function definition and call transformation
 * - Structured output (JSON schema) configuration
 * - Streaming state accumulation and event mapping
 *
 * @module providers/openai/transform.completions
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
  OpenAICompletionsParams,
  OpenAICompletionsRequest,
  OpenAICompletionsMessage,
  OpenAIUserContent,
  OpenAICompletionsTool,
  OpenAICompletionsResponse,
  OpenAICompletionsStreamChunk,
  OpenAIToolCall,
} from './types.ts';

/**
 * Transforms a UPP LLM request into OpenAI Chat Completions API format.
 *
 * This function converts the universal request format to OpenAI's specific
 * structure. Parameters are spread directly to support pass-through of any
 * OpenAI API fields, enabling use of new API features without library updates.
 *
 * @param request - The UPP LLM request containing messages, tools, and configuration
 * @param modelId - The OpenAI model identifier (e.g., 'gpt-4o', 'gpt-4-turbo')
 * @returns An OpenAI Chat Completions API request body
 *
 * @example
 * ```typescript
 * const openaiRequest = transformRequest({
 *   messages: [userMessage('Hello!')],
 *   params: { temperature: 0.7, max_tokens: 1000 },
 *   config: { apiKey: 'sk-...' }
 * }, 'gpt-4o');
 * ```
 */
export function transformRequest(
  request: LLMRequest<OpenAICompletionsParams>,
  modelId: string
): OpenAICompletionsRequest {
  const params = request.params ?? ({} as OpenAICompletionsParams);

  const openaiRequest: OpenAICompletionsRequest = {
    ...params,
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  if (request.tools && request.tools.length > 0) {
    openaiRequest.tools = request.tools.map(transformTool);
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

    openaiRequest.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return openaiRequest;
}

/**
 * Normalizes system prompt to string.
 * Converts array format to concatenated string for providers that only support strings.
 */
function normalizeSystem(system: string | unknown[] | undefined): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  // Array format: extract text from each block and join
  return (system as Array<{text?: string}>)
    .map(block => block.text ?? '')
    .filter(text => text.length > 0)
    .join('\n\n');
}

/**
 * Transforms UPP messages to OpenAI Chat Completions message format.
 *
 * Handles system prompt injection as the first message and processes
 * all message types including tool result messages which may expand
 * into multiple OpenAI messages.
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt (string or array, normalized to string)
 * @returns Array of OpenAI-formatted messages
 */
function transformMessages(
  messages: Message[],
  system?: string | unknown[]
): OpenAICompletionsMessage[] {
  const result: OpenAICompletionsMessage[] = [];
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
 * Filters content blocks to only include those with a valid type property.
 *
 * @param content - Array of content blocks to filter
 * @returns Filtered array containing only valid content blocks
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Transforms a single UPP message to OpenAI Chat Completions format.
 *
 * Handles user, assistant, and tool result messages. For user messages,
 * optimizes to use simple string content when possible. For assistant
 * messages, extracts text and tool calls.
 *
 * @param message - The UPP message to transform
 * @returns The transformed OpenAI message, or null if transformation fails
 */
function transformMessage(message: Message): OpenAICompletionsMessage | null {
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

    const assistantMessage: OpenAICompletionsMessage = {
      role: 'assistant',
      content: textContent || null,
    };

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
 * Transforms tool result messages into multiple OpenAI tool messages.
 *
 * OpenAI requires each tool result to be sent as a separate message with
 * a `tool` role. This function expands a single UPP tool result message
 * containing multiple results into the corresponding OpenAI messages.
 *
 * @param message - The UPP message to transform (should be a tool result message)
 * @returns Array of OpenAI tool messages
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
 * Transforms a UPP content block to OpenAI user content format.
 *
 * Handles text and image content blocks. Images are converted to
 * data URLs for base64 and bytes sources, or passed through for URL sources.
 *
 * @param block - The content block to transform
 * @returns The transformed OpenAI content part
 * @throws Error if the content type is unsupported or image source type is unknown
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
 * Extracts OpenAI-specific options from tool metadata.
 *
 * @param tool - The tool to extract options from
 * @returns The OpenAI options if present (currently supports `strict`)
 */
function extractToolOptions(tool: Tool): { strict?: boolean } {
  const openaiMeta = tool.metadata?.openai as
    | { strict?: boolean }
    | undefined;
  return { strict: openaiMeta?.strict };
}

/**
 * Transforms a UPP tool definition to OpenAI function tool format.
 *
 * OpenAI's Chat Completions API expects tools as function definitions
 * with JSON Schema parameters.
 *
 * Strict mode can be specified via tool metadata:
 * ```typescript
 * const tool: Tool = {
 *   name: 'get_weather',
 *   description: 'Get weather for a location',
 *   parameters: {...},
 *   metadata: { openai: { strict: true } },
 *   run: async (params) => {...}
 * };
 * ```
 *
 * @param tool - The UPP tool definition
 * @returns The transformed OpenAI function tool
 */
function transformTool(tool: Tool): OpenAICompletionsTool {
  const { strict } = extractToolOptions(tool);

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
      ...(strict !== undefined ? { strict } : {}),
    },
  };
}

/**
 * Transforms an OpenAI Chat Completions response to UPP LLMResponse format.
 *
 * Extracts the first choice from the response and converts it to the universal
 * format, including text content, tool calls, usage statistics, and stop reason.
 * Also attempts to parse JSON content for structured output responses.
 *
 * @param data - The raw OpenAI Chat Completions API response
 * @returns The transformed UPP LLM response
 * @throws Error if the response contains no choices
 */
export function transformResponse(data: OpenAICompletionsResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in OpenAI response');
  }

  const textContent: TextBlock[] = [];
  let structuredData: unknown;
  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
    try {
      structuredData = JSON.parse(choice.message.content);
    } catch {
      // Not JSON - expected for non-structured responses
    }
  }
  let hadRefusal = false;
  if (choice.message.refusal) {
    textContent.push({ type: 'text', text: choice.message.refusal });
    hadRefusal = true;
  }

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
 * Mutable state object for accumulating data during streaming responses.
 *
 * As streaming chunks arrive, this state object is updated to build up
 * the complete response. It tracks text content, tool calls, token usage,
 * and other metadata needed to construct the final LLMResponse.
 */
export interface CompletionsStreamState {
  /** Response ID from the first chunk */
  id: string;
  /** Model identifier */
  model: string;
  /** Accumulated text content */
  text: string;
  /** Map of tool call index to accumulated tool call data */
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  /** The finish reason when streaming completes */
  finishReason: string | null;
  /** Input token count (from usage chunk) */
  inputTokens: number;
  /** Output token count (from usage chunk) */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
  /** Whether a refusal was encountered */
  hadRefusal: boolean;
}

/**
 * Creates a fresh stream state object for a new streaming session.
 *
 * @returns A new CompletionsStreamState with all fields initialized
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
    cacheReadTokens: 0,
    hadRefusal: false,
  };
}

/**
 * Transforms an OpenAI streaming chunk into UPP stream events.
 *
 * Processes each chunk from the SSE stream, updating the accumulated state
 * and emitting corresponding UPP events. A single chunk may produce multiple
 * events (e.g., both text and tool call deltas).
 *
 * @param chunk - The OpenAI streaming chunk to process
 * @param state - The mutable state object to update
 * @returns Array of UPP stream events generated from this chunk
 */
export function transformStreamEvent(
  chunk: OpenAICompletionsStreamChunk,
  state: CompletionsStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (chunk.id && !state.id) {
    state.id = chunk.id;
    events.push({ type: 'message_start', index: 0, delta: {} });
  }
  if (chunk.model) {
    state.model = chunk.model;
  }

  const choice = chunk.choices[0];
  if (choice) {
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

    if (choice.finish_reason) {
      state.finishReason = choice.finish_reason;
      events.push({ type: 'message_stop', index: 0, delta: {} });
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
 * Builds a complete LLMResponse from accumulated streaming state.
 *
 * Called after all streaming chunks have been processed to construct
 * the final response object with all accumulated content, tool calls,
 * and usage statistics.
 *
 * @param state - The accumulated stream state
 * @returns A complete UPP LLMResponse
 */
export function buildResponseFromState(state: CompletionsStreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  let structuredData: unknown;
  if (state.text) {
    textContent.push({ type: 'text', text: state.text });
    try {
      structuredData = JSON.parse(state.text);
    } catch {
      // Not JSON - expected for non-structured responses
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
