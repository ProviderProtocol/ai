/**
 * @fileoverview Transformation utilities for Ollama provider.
 *
 * This module handles bidirectional transformation between the Unified Provider
 * Protocol (UPP) format and Ollama's native API format. It includes:
 *
 * - Request transformation (UPP to Ollama)
 * - Response transformation (Ollama to UPP)
 * - Stream chunk processing
 * - Message format conversion
 *
 * @module providers/ollama/transform
 */

import type { LLMRequest, LLMResponse } from '../../types/llm.ts';
import type { Message } from '../../types/messages.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType } from '../../types/stream.ts';
import type { Tool, ToolCall } from '../../types/tool.ts';
import type { TokenUsage } from '../../types/turn.ts';
import type { TextBlock, ImageBlock, AssistantContent } from '../../types/content.ts';
import {
  AssistantMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from '../../types/messages.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import type {
  OllamaLLMParams,
  OllamaRequest,
  OllamaMessage,
  OllamaTool,
  OllamaResponse,
  OllamaStreamChunk,
  OllamaOptions,
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
      'ollama',
      ModalityType.LLM
    );
  }

  const texts: string[] = [];
  for (const block of system) {
    if (!block || typeof block !== 'object' || !('text' in block)) {
      throw new UPPError(
        'System prompt array must contain objects with a text field',
        ErrorCode.InvalidRequest,
        'ollama',
        ModalityType.LLM
      );
    }
    const textValue = (block as { text?: unknown }).text;
    if (typeof textValue !== 'string') {
      throw new UPPError(
        'System prompt text must be a string',
        ErrorCode.InvalidRequest,
        'ollama',
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
 * Transforms UPP messages to Ollama's message format.
 *
 * Handles conversion of:
 * - User messages with text and image content
 * - Assistant messages with text and tool calls
 * - Tool result messages
 * - System prompts (prepended as first message)
 *
 * Image handling:
 * - Base64 images are passed directly
 * - Byte arrays are converted to base64
 * - URL images are converted to text placeholders (Ollama limitation)
 *
 * @param messages - Array of UPP messages to transform
 * @param system - Optional system prompt (string or array, normalized to string)
 * @returns Array of Ollama-formatted messages
 */
function transformMessages(messages: Message[], system?: string | unknown[]): OllamaMessage[] {
  const ollamaMessages: OllamaMessage[] = [];
  const normalizedSystem = normalizeSystem(system);

  // System prompt as first message
  if (normalizedSystem) {
    ollamaMessages.push({
      role: 'system',
      content: normalizedSystem,
    });
  }

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      const textContent: string[] = [];
      const images: string[] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textContent.push(block.text);
        } else if (block.type === 'image') {
          const imageBlock = block as ImageBlock;
          if (imageBlock.source.type === 'base64') {
            images.push(imageBlock.source.data);
          } else if (imageBlock.source.type === 'bytes') {
            const base64 = Buffer.from(imageBlock.source.data).toString('base64');
            images.push(base64);
          } else if (imageBlock.source.type === 'url') {
            // Ollama doesn't support URL images directly
            // Would need to fetch and convert, for now just add as text
            textContent.push(`[Image: ${imageBlock.source.url}]`);
          }
        }
      }

      const message: OllamaMessage = {
        role: 'user',
        content: textContent.join('\n'),
      };

      if (images.length > 0) {
        message.images = images;
      }

      ollamaMessages.push(message);
    } else if (isAssistantMessage(msg)) {
      // Filter for text blocks only (exclude reasoning blocks from history)
      // Also strip any <think>...</think> tags that may be embedded in text
      // (required for proper multi-turn with Qwen 3, DeepSeek-R1, etc.)
      const textContent = msg.content
        .filter((block): block is TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();

      const message: OllamaMessage = {
        role: 'assistant',
        content: textContent,
      };

      // Add tool calls if present
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        message.tool_calls = msg.toolCalls.map((call) => ({
          function: {
            name: call.toolName,
            arguments: call.arguments,
          },
        }));
      }

      ollamaMessages.push(message);
    } else if (isToolResultMessage(msg)) {
      // Tool results are sent as 'tool' role messages
      for (const result of msg.results) {
        // Extract tool name from toolCallId (format: {name}_{index})
        const underscoreIndex = result.toolCallId.lastIndexOf('_');
        const toolName = underscoreIndex > 0
          ? result.toolCallId.slice(0, underscoreIndex)
          : result.toolCallId;
        ollamaMessages.push({
          role: 'tool',
          tool_name: toolName,
          content:
            typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result),
        });
      }
    }
  }

  return ollamaMessages;
}

/**
 * Transforms a UPP tool definition to Ollama's function format.
 *
 * Ollama uses the OpenAI-style function calling format with a
 * `type: 'function'` wrapper around the function definition.
 *
 * @param tool - The UPP tool definition
 * @returns The Ollama-formatted tool definition
 */
function transformTool(tool: Tool): OllamaTool {
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
 * Transforms a UPP LLM request into Ollama's native API format.
 *
 * This function handles the mapping between UPP's unified request structure
 * and Ollama's specific requirements, including:
 *
 * - Converting messages to Ollama's message format
 * - Mapping model parameters to Ollama's nested `options` structure
 * - Handling top-level parameters like `keep_alive` and `think`
 * - Converting tools to Ollama's function format
 * - Setting up structured output via the `format` field
 *
 * Parameters are spread to allow pass-through of any Ollama API fields,
 * enabling developers to use new API features without library updates.
 *
 * @typeParam TParams - The parameter type extending OllamaLLMParams
 * @param request - The UPP-format LLM request
 * @param modelId - The Ollama model identifier (e.g., 'llama3.2', 'mistral')
 * @returns The transformed Ollama API request body
 *
 * @example
 * ```typescript
 * const ollamaRequest = transformRequest(
 *   {
 *     messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
 *     config: {},
 *     params: { temperature: 0.7 }
 *   },
 *   'llama3.2'
 * );
 * ```
 */
export function transformRequest<TParams extends OllamaLLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): OllamaRequest {
  const params = (request.params ?? {}) as OllamaLLMParams;

  // Extract top-level params vs options params
  const {
    keep_alive,
    think,
    logprobs,
    top_logprobs,
    ...optionsParams
  } = params;

  // Spread params to pass through all fields, then set required fields
  const ollamaRequest: OllamaRequest = {
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  // Add top-level params if provided
  if (keep_alive !== undefined) ollamaRequest.keep_alive = keep_alive;
  if (think !== undefined) ollamaRequest.think = think;
  if (logprobs !== undefined) ollamaRequest.logprobs = logprobs;
  if (top_logprobs !== undefined) ollamaRequest.top_logprobs = top_logprobs;

  // Spread remaining params into options to pass through all model parameters
  if (Object.keys(optionsParams).length > 0) {
    ollamaRequest.options = optionsParams as OllamaOptions;
  }

  // Tools come from request, not params
  if (request.tools && request.tools.length > 0) {
    ollamaRequest.tools = request.tools.map(transformTool);
  }

  // Structured output via format field
  if (request.structure) {
    ollamaRequest.format = request.structure as unknown as Record<string, unknown>;
  }

  return ollamaRequest;
}

/**
 * Transforms an Ollama API response to the UPP LLMResponse format.
 *
 * This function extracts and normalizes:
 * - Text content from the assistant message
 * - Tool calls with their arguments
 * - Token usage statistics (prompt + completion tokens)
 * - Stop reason mapping (stop -> end_turn, length -> max_tokens)
 * - Ollama-specific metadata (timings, model info, thinking content)
 *
 * For structured output requests, the response content is automatically
 * parsed as JSON and stored in the `data` field.
 *
 * @param data - The raw Ollama API response
 * @returns The normalized UPP LLM response
 */
export function transformResponse(data: OllamaResponse): LLMResponse {
  const content: AssistantContent[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  // Add reasoning/thinking content first (if present)
  if (data.message.thinking) {
    content.push({ type: 'reasoning', text: data.message.thinking });
  }

  // Add main content
  if (data.message.content) {
    content.push({ type: 'text', text: data.message.content });

    // Try to parse as JSON for structured output
    try {
      structuredData = JSON.parse(data.message.content);
    } catch {
      // Not valid JSON - that's fine, might not be structured output
    }
  }

  // Extract tool calls
  if (data.message.tool_calls) {
    for (let idx = 0; idx < data.message.tool_calls.length; idx++) {
      const call = data.message.tool_calls[idx]!;
      const index = call.function.index ?? idx;
      toolCalls.push({
        toolCallId: `${call.function.name}_${index}`,
        toolName: call.function.name,
        arguments: call.function.arguments,
      });
    }
  }

  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        ollama: {
          model: data.model,
          created_at: data.created_at,
          done_reason: data.done_reason,
          thinking: data.message.thinking,
          total_duration: data.total_duration,
          load_duration: data.load_duration,
          prompt_eval_duration: data.prompt_eval_duration,
          eval_duration: data.eval_duration,
          logprobs: data.logprobs,
        },
      },
    }
  );

  // Calculate token usage (Ollama doesn't support API-level prompt caching)
  const usage: TokenUsage = {
    inputTokens: data.prompt_eval_count ?? 0,
    outputTokens: data.eval_count ?? 0,
    totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  // Map done_reason to standard stop reason
  let stopReason = 'end_turn';
  if (data.done_reason === 'length') {
    stopReason = 'max_tokens';
  } else if (data.done_reason === 'stop') {
    stopReason = 'end_turn';
  } else if (toolCalls.length > 0) {
    stopReason = 'tool_use';
  }

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}

/**
 * Mutable state object for accumulating data during stream processing.
 *
 * As streaming chunks arrive, this state object accumulates content,
 * tool calls, and metadata. Once the stream completes (indicated by
 * `done: true`), this state is used to build the final LLMResponse.
 */
export interface StreamState {
  /** The model name from the stream. */
  model: string;
  /** Accumulated text content from all chunks. */
  content: string;
  /** Accumulated thinking/reasoning content (for models with think mode). */
  thinking: string;
  /** Tool calls extracted from the stream. */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** The reason the generation stopped (stop, length, etc.). */
  doneReason: string | null;
  /** Number of tokens in the prompt evaluation. */
  promptEvalCount: number;
  /** Number of tokens generated in the response. */
  evalCount: number;
  /** Total generation duration in nanoseconds. */
  totalDuration: number;
  /** Whether we're still waiting for the first chunk. */
  isFirstChunk: boolean;
  /** ISO timestamp when the response was created. */
  createdAt: string;
}

/**
 * Creates an initial empty stream state for accumulating streaming responses.
 *
 * @returns A fresh StreamState object with default values
 */
export function createStreamState(): StreamState {
  return {
    model: '',
    content: '',
    thinking: '',
    toolCalls: [],
    doneReason: null,
    promptEvalCount: 0,
    evalCount: 0,
    totalDuration: 0,
    isFirstChunk: true,
    createdAt: '',
  };
}

/**
 * Transforms an Ollama stream chunk into UPP StreamEvents.
 *
 * Each Ollama chunk may produce zero or more UPP events:
 * - First chunk: `message_start` event
 * - Content chunks: `text_delta` events
 * - Thinking chunks: `reasoning_delta` events
 * - Tool call chunks: `tool_call_delta` events
 * - Final chunk (done=true): `message_stop` event
 *
 * The function also updates the provided state object with accumulated
 * content and metadata for building the final response.
 *
 * @param chunk - The raw Ollama stream chunk
 * @param state - Mutable state object to accumulate data
 * @returns Array of UPP stream events (may be empty)
 */
export function transformStreamChunk(
  chunk: OllamaStreamChunk,
  state: StreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  // First chunk - emit message start
  if (state.isFirstChunk) {
    state.model = chunk.model;
    state.createdAt = chunk.created_at;
    events.push({ type: StreamEventType.MessageStart, index: 0, delta: {} });
    state.isFirstChunk = false;
  }

  // Process message content
  if (chunk.message) {
    // Text content delta
    if (chunk.message.content) {
      state.content += chunk.message.content;
      events.push({
        type: StreamEventType.TextDelta,
        index: 0,
        delta: { text: chunk.message.content },
      });
    }

    // Thinking content delta
    if (chunk.message.thinking) {
      state.thinking += chunk.message.thinking;
      events.push({
        type: StreamEventType.ReasoningDelta,
        index: 0,
        delta: { text: chunk.message.thinking },
      });
    }

    // Tool calls (typically come in final chunk)
    if (chunk.message.tool_calls) {
      for (const call of chunk.message.tool_calls) {
        const idx = state.toolCalls.length;
        const toolCallId = `${call.function.name}_${call.function.index ?? idx}`;
        state.toolCalls.push({
          name: call.function.name,
          args: call.function.arguments,
        });
        events.push({
          type: StreamEventType.ToolCallDelta,
          index: idx,
          delta: {
            toolCallId,
            toolName: call.function.name,
            argumentsJson: JSON.stringify(call.function.arguments),
          },
        });
      }
    }
  }

  // Final chunk with metrics
  if (chunk.done) {
    state.doneReason = chunk.done_reason ?? null;
    state.promptEvalCount = chunk.prompt_eval_count ?? 0;
    state.evalCount = chunk.eval_count ?? 0;
    state.totalDuration = chunk.total_duration ?? 0;
    events.push({ type: StreamEventType.MessageStop, index: 0, delta: {} });
  }

  return events;
}

/**
 * Builds a complete LLMResponse from accumulated stream state.
 *
 * Called after the stream completes to construct the final response object
 * with all accumulated content, tool calls, usage statistics, and metadata.
 *
 * For structured output, attempts to parse the accumulated content as JSON
 * and stores it in the `data` field if successful.
 *
 * @param state - The accumulated stream state
 * @returns The complete UPP LLM response
 */
export function buildResponseFromState(state: StreamState): LLMResponse {
  const content: AssistantContent[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  // Add reasoning/thinking content first (if present)
  if (state.thinking) {
    content.push({ type: 'reasoning', text: state.thinking });
  }

  if (state.content) {
    content.push({ type: 'text', text: state.content });

    // Try to parse as JSON for structured output
    try {
      structuredData = JSON.parse(state.content);
    } catch {
      // Not valid JSON - that's fine
    }
  }

  for (let idx = 0; idx < state.toolCalls.length; idx++) {
    const tc = state.toolCalls[idx]!;
    toolCalls.push({
      toolCallId: `${tc.name}_${idx}`,
      toolName: tc.name,
      arguments: tc.args,
    });
  }

  const message = new AssistantMessage(
    content,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      metadata: {
        ollama: {
          model: state.model,
          created_at: state.createdAt,
          done_reason: state.doneReason,
          thinking: state.thinking || undefined,
          total_duration: state.totalDuration,
        },
      },
    }
  );

  // Ollama doesn't support API-level prompt caching
  const usage: TokenUsage = {
    inputTokens: state.promptEvalCount,
    outputTokens: state.evalCount,
    totalTokens: state.promptEvalCount + state.evalCount,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  // Map done_reason to standard stop reason
  let stopReason = 'end_turn';
  if (state.doneReason === 'length') {
    stopReason = 'max_tokens';
  } else if (toolCalls.length > 0) {
    stopReason = 'tool_use';
  }

  return {
    message,
    usage,
    stopReason,
    data: structuredData,
  };
}
