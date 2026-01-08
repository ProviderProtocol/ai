/**
 * @fileoverview UPP to Anthropic message transformation utilities.
 *
 * This module handles bidirectional conversion between Universal Provider Protocol
 * message formats and Anthropic's native API structures. It supports:
 * - Request transformation (UPP -> Anthropic)
 * - Response transformation (Anthropic -> UPP)
 * - Stream event transformation for real-time responses
 * - Tool call and structured output handling
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
  AnthropicLLMParams,
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContent,
  AnthropicTool,
  AnthropicResponse,
  AnthropicStreamEvent,
  AnthropicCacheControl,
  AnthropicSystemContent,
} from './types.ts';

/**
 * Transforms a UPP LLM request to Anthropic's native API format.
 *
 * Handles conversion of messages, system prompts, tools, and structured output
 * configuration. Parameters are spread directly to enable pass-through of any
 * Anthropic API fields, even those not explicitly defined in our types.
 *
 * @typeParam TParams - Anthropic-specific parameters extending AnthropicLLMParams
 * @param request - The UPP-formatted LLM request
 * @param modelId - The Anthropic model identifier (e.g., 'claude-sonnet-4-20250514')
 * @returns An AnthropicRequest ready for the Messages API
 *
 * @example
 * ```typescript
 * const anthropicRequest = transformRequest({
 *   messages: [new UserMessage([{ type: 'text', text: 'Hello!' }])],
 *   config: { apiKey: 'sk-...' },
 *   params: { max_tokens: 1024, temperature: 0.7 },
 * }, 'claude-sonnet-4-20250514');
 * ```
 *
 * @see {@link transformResponse} for the reverse transformation
 */
export function transformRequest<TParams extends AnthropicLLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): AnthropicRequest {
  const params = (request.params ?? {}) as AnthropicLLMParams;
  const { builtInTools, ...restParams } = params;

  const anthropicRequest: AnthropicRequest = {
    ...restParams,
    model: modelId,
    messages: request.messages.map(transformMessage),
  };

  if (request.system) {
    // Pass through directly - accepts string or array of AnthropicSystemContent
    // Array format enables cache_control: [{type: 'text', text: '...', cache_control: {...}}]
    anthropicRequest.system = request.system as string | AnthropicSystemContent[];
  }

  // Collect all tools: user-defined tools + built-in tools
  const allTools: NonNullable<AnthropicRequest['tools']> = [];

  if (request.tools && request.tools.length > 0) {
    // For tool caching, use params.tools directly with native Anthropic format
    allTools.push(...request.tools.map(transformTool));
  }

  // Add built-in tools (web_search, computer, text_editor, bash, code_execution, etc.)
  if (builtInTools && builtInTools.length > 0) {
    allTools.push(...builtInTools);
  }

  if (allTools.length > 0) {
    anthropicRequest.tools = allTools;
    anthropicRequest.tool_choice = { type: 'auto' };
  }

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

    anthropicRequest.tools = [...(anthropicRequest.tools ?? []), structuredTool];
    anthropicRequest.tool_choice = { type: 'tool', name: 'json_response' };
  }

  return anthropicRequest;
}

/**
 * Filters content blocks to include only those with a valid type property.
 *
 * @param content - Array of content blocks to filter
 * @returns Filtered array containing only blocks with a string type property
 */
function filterValidContent<T extends { type?: string }>(content: T[]): T[] {
  return content.filter((c) => c && typeof c.type === 'string');
}

/**
 * Extracts cache control configuration from message metadata.
 *
 * @param message - The message to extract cache control from
 * @returns The cache control configuration if present, undefined otherwise
 */
function extractCacheControl(message: Message): AnthropicCacheControl | undefined {
  const anthropicMeta = message.metadata?.anthropic as
    | { cache_control?: AnthropicCacheControl }
    | undefined;
  return anthropicMeta?.cache_control;
}

/**
 * Transforms a UPP Message to Anthropic's message format.
 *
 * Handles three message types:
 * - UserMessage: Converted with content blocks
 * - AssistantMessage: Includes text and tool_use blocks
 * - ToolResultMessage: Converted to user role with tool_result content
 *
 * Cache control can be specified via message metadata:
 * ```typescript
 * new UserMessage(content, {
 *   metadata: { anthropic: { cache_control: { type: "ephemeral" } } }
 * })
 * ```
 *
 * @param message - The UPP message to transform
 * @returns An AnthropicMessage with the appropriate role and content
 * @throws Error if the message type is unknown
 */
function transformMessage(message: Message): AnthropicMessage {
  const cacheControl = extractCacheControl(message);

  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    const contentBlocks = validContent.map((block, index, arr) =>
      transformContentBlock(block, index === arr.length - 1 ? cacheControl : undefined)
    );
    return {
      role: 'user',
      content: contentBlocks,
    };
  }

  if (isAssistantMessage(message)) {
    const validContent = filterValidContent(message.content);
    const content: AnthropicContent[] = validContent.map((block, index, arr) =>
      transformContentBlock(block, index === arr.length - 1 && !message.toolCalls?.length ? cacheControl : undefined)
    );

    if (message.toolCalls) {
      for (let i = 0; i < message.toolCalls.length; i++) {
        const call = message.toolCalls[i]!;
        const isLast = i === message.toolCalls.length - 1;
        content.push({
          type: 'tool_use',
          id: call.toolCallId,
          name: call.toolName,
          input: call.arguments,
          ...(isLast && cacheControl ? { cache_control: cacheControl } : {}),
        });
      }
    }

    return {
      role: 'assistant',
      content,
    };
  }

  if (isToolResultMessage(message)) {
    return {
      role: 'user',
      content: message.results.map((result, index, arr) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content:
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result),
        is_error: result.isError,
        ...(index === arr.length - 1 && cacheControl ? { cache_control: cacheControl } : {}),
      })),
    };
  }

  throw new Error(`Unknown message type: ${message.type}`);
}

/**
 * Transforms a UPP ContentBlock to Anthropic's content format.
 *
 * Supports text and image content types. Image blocks can be provided
 * as base64, URL, or raw bytes (which are converted to base64).
 *
 * @param block - The UPP content block to transform
 * @param cacheControl - Optional cache control to apply to the block
 * @returns An AnthropicContent object
 * @throws Error if the content type or image source type is unsupported
 */
function transformContentBlock(
  block: ContentBlock,
  cacheControl?: AnthropicCacheControl
): AnthropicContent {
  switch (block.type) {
    case 'text':
      return {
        type: 'text',
        text: block.text,
        ...(cacheControl ? { cache_control: cacheControl } : {}),
      };

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
          ...(cacheControl ? { cache_control: cacheControl } : {}),
        };
      }
      if (imageBlock.source.type === 'url') {
        return {
          type: 'image',
          source: {
            type: 'url',
            url: imageBlock.source.url,
          },
          ...(cacheControl ? { cache_control: cacheControl } : {}),
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
          ...(cacheControl ? { cache_control: cacheControl } : {}),
        };
      }
      throw new Error(`Unknown image source type`);
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Extracts cache control configuration from tool metadata.
 *
 * @param tool - The tool to extract cache control from
 * @returns The cache control configuration if present, undefined otherwise
 */
function extractToolCacheControl(tool: Tool): AnthropicCacheControl | undefined {
  const anthropicMeta = tool.metadata?.anthropic as
    | { cache_control?: AnthropicCacheControl }
    | undefined;
  return anthropicMeta?.cache_control;
}

/**
 * Transforms a UPP Tool definition to Anthropic's tool format.
 *
 * Cache control can be specified via tool metadata:
 * ```typescript
 * const tool: Tool = {
 *   name: 'search_docs',
 *   description: 'Search documentation',
 *   parameters: {...},
 *   metadata: { anthropic: { cache_control: { type: 'ephemeral' } } },
 *   run: async (params) => {...}
 * };
 * ```
 *
 * @param tool - The UPP tool definition
 * @returns An AnthropicTool with the appropriate input schema
 */
function transformTool(tool: Tool): AnthropicTool {
  const cacheControl = extractToolCacheControl(tool);

  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
    ...(cacheControl ? { cache_control: cacheControl } : {}),
  };
}

/**
 * Transforms an Anthropic API response to UPP's LLMResponse format.
 *
 * Extracts text content, tool calls, code execution results, and structured
 * output data from Anthropic's response. The json_response tool is treated
 * specially for structured output extraction. Code execution results (stdout)
 * are appended to the text content.
 *
 * @param data - The raw Anthropic API response
 * @returns A UPP LLMResponse with message, usage, and optional structured data
 *
 * @see {@link transformRequest} for the request transformation
 */
export function transformResponse(data: AnthropicResponse): LLMResponse {
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
    } else if (block.type === 'bash_code_execution_tool_result') {
      // Extract stdout from code execution results and append to text
      if (block.content.type === 'bash_code_execution_result' && block.content.stdout) {
        textContent.push({ type: 'text', text: `\n\`\`\`\n${block.content.stdout}\`\`\`\n` });
      }
    } else if (block.type === 'text_editor_code_execution_tool_result') {
      // Extract file content from text editor results
      if (block.content.type === 'text_editor_code_execution_result' && block.content.content) {
        textContent.push({ type: 'text', text: `\n\`\`\`\n${block.content.content}\`\`\`\n` });
      }
    }
    // server_tool_use blocks are tracked for context but don't produce output
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
 * Mutable state object for accumulating streamed response data.
 *
 * Used during streaming to collect content blocks, token counts, and
 * metadata as events arrive from the Anthropic API.
 */
export interface StreamState {
  /** Unique identifier for the message being streamed. */
  messageId: string;
  /** The model that generated this response. */
  model: string;
  /** Accumulated content blocks indexed by their stream position. */
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: string;
    /** Code execution stdout (for bash_code_execution_tool_result). */
    stdout?: string;
    /** Code execution tool use ID (for result blocks). */
    tool_use_id?: string;
    /** File content (for text_editor_code_execution_tool_result). */
    fileContent?: string;
  }>;
  /** The reason the response ended, if completed. */
  stopReason: string | null;
  /** Number of input tokens consumed. */
  inputTokens: number;
  /** Number of output tokens generated. */
  outputTokens: number;
  /** Number of tokens read from cache (cache hits). */
  cacheReadTokens: number;
  /** Number of tokens written to cache. */
  cacheWriteTokens: number;
}

/**
 * Creates an initialized StreamState for accumulating streaming responses.
 *
 * @returns A fresh StreamState with empty/default values
 */
export function createStreamState(): StreamState {
  return {
    messageId: '',
    model: '',
    content: [],
    stopReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/**
 * Transforms an Anthropic streaming event to a UPP StreamEvent.
 *
 * Updates the provided state object as a side effect to accumulate
 * response data across multiple events. Returns null for events that
 * don't produce corresponding UPP events (e.g., ping, message_delta).
 *
 * @param event - The Anthropic SSE event to transform
 * @param state - Mutable state object to update with accumulated data
 * @returns A UPP StreamEvent, or null if no event should be emitted
 *
 * @example
 * ```typescript
 * const state = createStreamState();
 * for await (const event of parseSSEStream(response.body)) {
 *   const uppEvent = transformStreamEvent(event, state);
 *   if (uppEvent) {
 *     yield uppEvent;
 *   }
 * }
 * const finalResponse = buildResponseFromState(state);
 * ```
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
      state.cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
      state.cacheWriteTokens = event.message.usage.cache_creation_input_tokens ?? 0;
      return { type: 'message_start', index: 0, delta: {} };

    case 'content_block_start':
      if (event.content_block.type === 'text') {
        state.content[event.index] = { type: 'text', text: '' };
      } else if (event.content_block.type === 'tool_use') {
        state.content[event.index] = {
          type: 'tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
          input: '',
        };
      } else if (event.content_block.type === 'server_tool_use') {
        state.content[event.index] = {
          type: 'server_tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
          input: '',
        };
      } else if (event.content_block.type === 'bash_code_execution_tool_result') {
        // Handle code execution results - extract stdout for text
        const resultBlock = event.content_block as {
          type: 'bash_code_execution_tool_result';
          tool_use_id: string;
          content?: { type: string; stdout?: string };
        };
        state.content[event.index] = {
          type: 'bash_code_execution_tool_result',
          tool_use_id: resultBlock.tool_use_id,
          stdout: resultBlock.content?.stdout ?? '',
        };
      } else if (event.content_block.type === 'text_editor_code_execution_tool_result') {
        // Handle text editor results - extract file content
        const resultBlock = event.content_block as {
          type: 'text_editor_code_execution_tool_result';
          tool_use_id: string;
          content?: { type: string; content?: string };
        };
        state.content[event.index] = {
          type: 'text_editor_code_execution_tool_result',
          tool_use_id: resultBlock.tool_use_id,
          fileContent: resultBlock.content?.content ?? '',
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
 * Builds a complete LLMResponse from accumulated stream state.
 *
 * Call this after all stream events have been processed to construct
 * the final response. Parses accumulated JSON for tool call arguments
 * and extracts structured output data.
 *
 * @param state - The accumulated stream state
 * @returns A complete UPP LLMResponse
 *
 * @see {@link createStreamState} for initializing state
 * @see {@link transformStreamEvent} for populating state from events
 */
export function buildResponseFromState(state: StreamState): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  for (const block of state.content) {
    // Skip undefined blocks (can happen with built-in tool results that aren't tracked)
    if (!block) continue;

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
      if (block.name === 'json_response') {
        structuredData = args;
      }
      toolCalls.push({
        toolCallId: block.id,
        toolName: block.name,
        arguments: args,
      });
    } else if (block.type === 'bash_code_execution_tool_result' && block.stdout) {
      // Append code execution stdout to text content
      textContent.push({ type: 'text', text: `\n\`\`\`\n${block.stdout}\`\`\`\n` });
    } else if (block.type === 'text_editor_code_execution_tool_result' && block.fileContent) {
      // Append file content to text content
      textContent.push({ type: 'text', text: `\n\`\`\`\n${block.fileContent}\`\`\`\n` });
    }
    // server_tool_use blocks are tracked for context but don't produce output
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
