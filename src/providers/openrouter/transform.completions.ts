/**
 * Transform utilities for OpenRouter Chat Completions API.
 *
 * This module handles bidirectional conversion between UPP (Unified Provider Protocol)
 * request/response formats and OpenRouter's Chat Completions API format, which is
 * compatible with the OpenAI Chat Completions API.
 *
 * @module transform.completions
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type {
  ContentBlock,
  TextBlock,
  ImageBlock,
  DocumentBlock,
  AudioBlock,
  VideoBlock,
  AssistantContent,
  ReasoningBlock,
} from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { generateId } from '../../utils/id.ts';
import type {
  OpenRouterCompletionsParams,
  OpenRouterCompletionsRequest,
  OpenRouterCompletionsMessage,
  OpenRouterSystemContent,
  OpenRouterUserContent,
  OpenRouterCompletionsTool,
  OpenRouterCompletionsResponse,
  OpenRouterCompletionsStreamChunk,
  OpenRouterToolCall,
  OpenRouterCacheControl,
  OpenRouterReasoningDetail,
} from './types.ts';

function isValidCacheControl(value: unknown): value is OpenRouterCacheControl {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; ttl?: unknown };
  if (candidate.type !== 'ephemeral') return false;
  if (candidate.ttl !== undefined && candidate.ttl !== '1h') return false;
  return true;
}

function normalizeSystem(system: string | unknown[]): string | OpenRouterSystemContent[] {
  if (typeof system === 'string') return system;
  if (!Array.isArray(system)) {
    throw new UPPError(
      'System prompt must be a string or an array of text blocks',
      ErrorCode.InvalidRequest,
      'openrouter',
      ModalityType.LLM
    );
  }

  const blocks: OpenRouterSystemContent[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object') {
      throw new UPPError(
        'System prompt array must contain objects with type "text"',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }
    const candidate = block as { type?: unknown; text?: unknown; cache_control?: unknown };
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') {
      throw new UPPError(
        'OpenRouter system blocks must be of type "text" with a string text field',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }
    if (candidate.cache_control !== undefined && !isValidCacheControl(candidate.cache_control)) {
      throw new UPPError(
        'Invalid cache_control for OpenRouter system prompt',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }
    blocks.push(block as OpenRouterSystemContent);
  }

  return blocks;
}

/**
 * Filters content blocks to only those with a valid type property.
 *
 * @param content - Array of content blocks to filter
 * @returns Filtered array containing only blocks with string type properties
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
function extractCacheControl(message: Message): OpenRouterCacheControl | undefined {
  const openrouterMeta = message.metadata?.openrouter as
    | { cache_control?: OpenRouterCacheControl }
    | undefined;
  return openrouterMeta?.cache_control;
}

/**
 * Transforms a UPP content block to OpenRouter user content format.
 *
 * Supports text and image content types. Images are converted to data URLs
 * or passed through as URL references.
 *
 * @param block - The UPP content block to transform
 * @returns OpenRouter user content part
 * @throws Error if the content type is unsupported
 */
function transformContentBlock(block: ContentBlock): OpenRouterUserContent {
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

    case 'document': {
      const documentBlock = block as DocumentBlock;

      if (documentBlock.source.type === 'text') {
        if (!documentBlock.source.data) {
          throw new UPPError(
            'Text document source data is empty',
            ErrorCode.InvalidRequest,
            'openrouter',
            ModalityType.LLM
          );
        }
        const title = documentBlock.title ? `[Document: ${documentBlock.title}]\n` : '';
        return { type: 'text', text: `${title}${documentBlock.source.data}` };
      }

      const filename = documentBlock.title ?? 'document.pdf';

      if (documentBlock.source.type === 'base64') {
        const fileData = `data:${documentBlock.mimeType};base64,${documentBlock.source.data}`;
        return {
          type: 'file',
          file: {
            filename,
            file_data: fileData,
          },
        };
      }

      if (documentBlock.source.type === 'url') {
        return {
          type: 'file',
          file: {
            filename,
            file_url: documentBlock.source.url,
          },
        };
      }

      throw new UPPError(
        'Unknown document source type',
        ErrorCode.InvalidRequest,
        'openrouter',
        ModalityType.LLM
      );
    }

    case 'audio': {
      const audioBlock = block as AudioBlock;
      const base64 = Buffer.from(audioBlock.data).toString('base64');
      const format = audioBlock.mimeType.split('/')[1] ?? 'mp3';

      return {
        type: 'input_audio',
        input_audio: {
          data: base64,
          format,
        },
      };
    }

    case 'video': {
      const videoBlock = block as VideoBlock;
      const base64 = Buffer.from(videoBlock.data).toString('base64');
      const url = `data:${videoBlock.mimeType};base64,${base64}`;

      return {
        type: 'video_url',
        video_url: { url },
      };
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transforms a single UPP message to OpenRouter Chat Completions format.
 *
 * Cache control can be specified via message metadata:
 * ```typescript
 * new UserMessage(content, {
 *   metadata: { openrouter: { cache_control: { type: "ephemeral" } } }
 * })
 * ```
 *
 * @param message - The UPP message to transform
 * @returns The transformed OpenRouter message, or null if the message type is unsupported
 */
function transformMessage(message: Message): OpenRouterCompletionsMessage | null {
  if (isUserMessage(message)) {
    const validContent = filterValidContent(message.content);
    const cacheControl = extractCacheControl(message);

    if (cacheControl) {
      const content = validContent.map(transformContentBlock);
      for (let i = content.length - 1; i >= 0; i--) {
        const block = content[i];
        if (block?.type === 'text') {
          content[i] = { type: 'text', text: block.text, cache_control: cacheControl };
          break;
        }
      }
      return { role: 'user', content };
    }

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
    const nonReasoningContent = validContent.filter(c => c.type !== 'reasoning');
    const textContent = nonReasoningContent
      .filter((c): c is TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    const assistantMessage: OpenRouterCompletionsMessage = {
      role: 'assistant',
      content: textContent || null,
    };

    if (message.toolCalls && message.toolCalls.length > 0) {
      (assistantMessage as { tool_calls?: OpenRouterToolCall[] }).tool_calls =
        message.toolCalls.map((call) => ({
          id: call.toolCallId,
          type: 'function' as const,
          function: {
            name: call.toolName,
            arguments: JSON.stringify(call.arguments),
          },
        }));
    }

    const openrouterMeta = message.metadata?.openrouter as
      | { reasoning_details?: OpenRouterReasoningDetail[] }
      | undefined;
    if (openrouterMeta?.reasoning_details && openrouterMeta.reasoning_details.length > 0) {
      (assistantMessage as { reasoning_details?: OpenRouterReasoningDetail[] }).reasoning_details =
        openrouterMeta.reasoning_details;
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
 * Transforms a tool result message into multiple OpenRouter tool messages.
 *
 * Each tool result in the UPP ToolResultMessage becomes a separate OpenRouter
 * tool message with the corresponding tool_call_id.
 *
 * @param message - The UPP message (expected to be a ToolResultMessage)
 * @returns Array of OpenRouter tool messages
 */
export function transformToolResults(
  message: Message
): OpenRouterCompletionsMessage[] {
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
 * Transforms UPP messages into OpenRouter Chat Completions message format.
 *
 * Handles system prompts, user messages, assistant messages, and tool results.
 * Tool result messages are expanded into individual tool messages.
 *
 * System prompts support both string and array formats:
 * - String: Simple text system prompt
 * - Array: Content blocks with optional cache_control for Anthropic/Gemini models
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt (string or array with cache_control)
 * @returns Array of OpenRouter-formatted messages
 */
function transformMessages(
  messages: Message[],
  system?: string | unknown[]
): OpenRouterCompletionsMessage[] {
  const result: OpenRouterCompletionsMessage[] = [];

  if (system !== undefined && system !== null) {
    const normalizedSystem = normalizeSystem(system);
    if (typeof normalizedSystem === 'string') {
      if (normalizedSystem.length > 0) {
        result.push({
          role: 'system',
          content: normalizedSystem,
        });
      }
    } else if (normalizedSystem.length > 0) {
      result.push({
        role: 'system',
        content: normalizedSystem,
      });
    }
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
 * Transforms a UPP Tool definition to OpenRouter function tool format.
 *
 * @param tool - The UPP tool definition
 * @returns OpenRouter function tool definition
 */
function transformTool(tool: Tool): OpenRouterCompletionsTool {
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
 * Transforms a UPP LLMRequest into an OpenRouter Chat Completions API request body.
 *
 * Parameters are spread directly to enable pass-through of any OpenRouter API fields,
 * even those not explicitly defined in our types. This allows developers to use new
 * API features without waiting for library updates.
 *
 * @param request - The UPP LLM request containing messages, tools, and parameters
 * @param modelId - The OpenRouter model identifier (e.g., 'openai/gpt-4o')
 * @returns A fully formed OpenRouter Chat Completions request body
 */
export function transformRequest(
  request: LLMRequest<OpenRouterCompletionsParams>,
  modelId: string
): OpenRouterCompletionsRequest {
  const params = request.params ?? ({} as OpenRouterCompletionsParams);

  const openrouterRequest: OpenRouterCompletionsRequest = {
    ...params,
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  if (request.tools && request.tools.length > 0) {
    openrouterRequest.tools = request.tools.map(transformTool);
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

    openrouterRequest.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'json_response',
        description: request.structure.description,
        schema,
        strict: true,
      },
    };
  }

  return openrouterRequest;
}

/**
 * Parses a generated image data URL into an ImageBlock.
 *
 * @param dataUrl - The data URL from the image generation response
 * @returns An ImageBlock or null if parsing fails
 */
function parseGeneratedImage(dataUrl: string): ImageBlock | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const [, mimeType, data] = match;
  if (!mimeType || !data) {
    return null;
  }
  return {
    type: 'image',
    mimeType,
    source: { type: 'base64', data },
  };
}

/**
 * Transforms an OpenRouter Chat Completions API response to UPP LLMResponse format.
 *
 * Extracts text content, tool calls, usage statistics, and stop reason from
 * the OpenRouter response. Attempts to parse JSON content for structured output.
 *
 * @param data - The raw OpenRouter Chat Completions response
 * @returns UPP-formatted LLM response
 * @throws Error if no choices are present in the response
 */
export function transformResponse(data: OpenRouterCompletionsResponse): LLMResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error('No choices in OpenRouter response');
  }

  const reasoningContent: ReasoningBlock[] = [];
  const textContent: AssistantContent[] = [];
  let structuredData: unknown;

  if (choice.message.reasoning_details && choice.message.reasoning_details.length > 0) {
    for (const detail of choice.message.reasoning_details) {
      if (detail.type === 'reasoning.text' && detail.text) {
        reasoningContent.push({ type: 'reasoning', text: detail.text });
      } else if (detail.type === 'reasoning.summary' && detail.summary) {
        reasoningContent.push({ type: 'reasoning', text: detail.summary });
      }
    }
  }

  if (choice.message.content) {
    textContent.push({ type: 'text', text: choice.message.content });
    try {
      structuredData = JSON.parse(choice.message.content);
    } catch {
      // Content is not JSON - acceptable for non-structured responses
    }
  }

  if (choice.message.images && choice.message.images.length > 0) {
    for (const image of choice.message.images) {
      const imageBlock = parseGeneratedImage(image.image_url.url);
      if (imageBlock) {
        textContent.push(imageBlock);
      }
    }
  }

  const content: AssistantContent[] = [...reasoningContent, ...textContent];

  const toolCalls: ToolCall[] = [];
  if (choice.message.tool_calls) {
    for (const call of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Invalid JSON arguments - use empty object as fallback
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
        openrouter: {
          model: data.model,
          finish_reason: choice.finish_reason,
          system_fingerprint: data.system_fingerprint,
          reasoning_details: choice.message.reasoning_details,
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

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}

/**
 * Mutable state object for accumulating streaming response data.
 *
 * Used during streaming to collect text deltas, tool call fragments,
 * and usage statistics before building the final LLMResponse.
 */
export interface CompletionsStreamState {
  /** Response ID from the first chunk */
  id: string;
  /** Model identifier from the response */
  model: string;
  /** Accumulated text content */
  text: string;
  /** Accumulated reasoning text from reasoning_details */
  reasoning: string;
  /** Raw reasoning_details for multi-turn context preservation */
  reasoningDetails: OpenRouterReasoningDetail[];
  /** Map of tool call index to accumulated tool call data */
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  /** Generated image data URLs from image generation models */
  images: string[];
  /** Final finish reason from the stream */
  finishReason: string | null;
  /** Input token count from usage */
  inputTokens: number;
  /** Output token count from usage */
  outputTokens: number;
  /** Number of tokens read from cache */
  cacheReadTokens: number;
}

/**
 * Creates an empty stream state object for accumulating streaming data.
 *
 * @returns A new CompletionsStreamState with all fields initialized
 */
export function createStreamState(): CompletionsStreamState {
  return {
    id: '',
    model: '',
    text: '',
    reasoning: '',
    reasoningDetails: [],
    toolCalls: new Map(),
    images: [],
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };
}

/**
 * Transforms an OpenRouter streaming chunk into UPP StreamEvents.
 *
 * Processes the chunk to extract text deltas, tool call updates, and finish signals.
 * Updates the provided state object with accumulated data. Returns an array because
 * a single chunk may produce multiple events (e.g., text delta and tool call delta).
 *
 * @param chunk - The OpenRouter streaming chunk to process
 * @param state - The mutable state object to update with chunk data
 * @returns Array of UPP StreamEvents generated from this chunk
 */
export function transformStreamEvent(
  chunk: OpenRouterCompletionsStreamChunk,
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
    if (choice.delta.content) {
      state.text += choice.delta.content;
      events.push({
        type: StreamEventType.TextDelta,
        index: 0,
        delta: { text: choice.delta.content },
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

    if (choice.delta.images) {
      for (const image of choice.delta.images) {
        state.images.push(image.image_url.url);
      }
    }

    if (choice.delta.reasoning_details) {
      for (const detail of choice.delta.reasoning_details) {
        state.reasoningDetails.push(detail);
        if (detail.type === 'reasoning.text' && detail.text) {
          state.reasoning += detail.text;
          events.push({
            type: StreamEventType.ReasoningDelta,
            index: 0,
            delta: { text: detail.text },
          });
        } else if (detail.type === 'reasoning.summary' && detail.summary) {
          state.reasoning += detail.summary;
          events.push({
            type: StreamEventType.ReasoningDelta,
            index: 0,
            delta: { text: detail.summary },
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
 * Builds the final LLMResponse from accumulated streaming state.
 *
 * Constructs the complete response after streaming has finished, including
 * the assistant message, tool calls, usage statistics, and stop reason.
 *
 * @param state - The accumulated stream state
 * @returns Complete UPP LLMResponse
 */
export function buildResponseFromState(state: CompletionsStreamState): LLMResponse {
  const reasoningContent: ReasoningBlock[] = [];
  const textContent: AssistantContent[] = [];
  let structuredData: unknown;

  if (state.reasoning) {
    reasoningContent.push({ type: 'reasoning', text: state.reasoning });
  }

  if (state.text) {
    textContent.push({ type: 'text', text: state.text });
    try {
      structuredData = JSON.parse(state.text);
    } catch {
      // Content is not JSON - acceptable for non-structured responses
    }
  }

  for (const imageUrl of state.images) {
    const imageBlock = parseGeneratedImage(imageUrl);
    if (imageBlock) {
      textContent.push(imageBlock);
    }
  }

  const content: AssistantContent[] = [...reasoningContent, ...textContent];

  const toolCalls: ToolCall[] = [];
  for (const [, toolCall] of state.toolCalls) {
    let args: Record<string, unknown> = {};
    if (toolCall.arguments) {
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // Invalid JSON arguments - use empty object as fallback
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
        openrouter: {
          model: state.model,
          finish_reason: state.finishReason,
          reasoning_details: state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
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

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}
