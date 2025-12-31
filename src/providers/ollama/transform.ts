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
  OllamaLLMParams,
  OllamaRequest,
  OllamaMessage,
  OllamaTool,
  OllamaResponse,
  OllamaStreamChunk,
  OllamaToolCall,
  OllamaOptions,
} from './types.ts';

/**
 * Transform UPP request to Ollama format
 *
 * Params are spread to allow pass-through of any Ollama API fields,
 * even those not explicitly defined in our type. This enables developers to
 * use new API features without waiting for library updates.
 *
 * Note: Ollama uses nested 'options' for model parameters. Params that belong
 * in options (like temperature, top_p, etc.) are spread into options, while
 * top-level params (like keep_alive, think) are spread at the request level.
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
 * Transform UPP Messages to Ollama messages
 */
function transformMessages(messages: Message[], system?: string): OllamaMessage[] {
  const ollamaMessages: OllamaMessage[] = [];

  // System prompt as first message
  if (system) {
    ollamaMessages.push({
      role: 'system',
      content: system,
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
            // Convert bytes to base64
            const base64 = btoa(
              Array.from(imageBlock.source.data)
                .map((b) => String.fromCharCode(b))
                .join('')
            );
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
      const textContent = msg.content
        .filter((block): block is TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

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
        ollamaMessages.push({
          role: 'tool',
          tool_name: result.toolCallId, // In our UPP, toolCallId maps to tool name for Ollama
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
 * Transform a UPP Tool to Ollama format
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
      },
    },
  };
}

/**
 * Transform Ollama response to UPP LLMResponse
 */
export function transformResponse(data: OllamaResponse): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let structuredData: unknown;

  // Add main content
  if (data.message.content) {
    textContent.push({ type: 'text', text: data.message.content });

    // Try to parse as JSON for structured output
    try {
      structuredData = JSON.parse(data.message.content);
    } catch {
      // Not valid JSON - that's fine, might not be structured output
    }
  }

  // Extract tool calls
  if (data.message.tool_calls) {
    for (const call of data.message.tool_calls) {
      toolCalls.push({
        toolCallId: call.function.name, // Ollama doesn't have separate IDs, use name
        toolName: call.function.name,
        arguments: call.function.arguments,
      });
    }
  }

  const message = new AssistantMessage(
    textContent,
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

  // Calculate token usage
  const usage: TokenUsage = {
    inputTokens: data.prompt_eval_count ?? 0,
    outputTokens: data.eval_count ?? 0,
    totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
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
 * State for accumulating streaming response
 */
export interface StreamState {
  model: string;
  content: string;
  thinking: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  doneReason: string | null;
  promptEvalCount: number;
  evalCount: number;
  totalDuration: number;
  isFirstChunk: boolean;
  createdAt: string;
}

/**
 * Create initial stream state
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
 * Transform Ollama stream chunk to UPP StreamEvents
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
    events.push({ type: 'message_start', index: 0, delta: {} });
    state.isFirstChunk = false;
  }

  // Process message content
  if (chunk.message) {
    // Text content delta
    if (chunk.message.content) {
      state.content += chunk.message.content;
      events.push({
        type: 'text_delta',
        index: 0,
        delta: { text: chunk.message.content },
      });
    }

    // Thinking content delta
    if (chunk.message.thinking) {
      state.thinking += chunk.message.thinking;
      events.push({
        type: 'reasoning_delta',
        index: 0,
        delta: { text: chunk.message.thinking },
      });
    }

    // Tool calls (typically come in final chunk)
    if (chunk.message.tool_calls) {
      for (const call of chunk.message.tool_calls) {
        state.toolCalls.push({
          name: call.function.name,
          args: call.function.arguments,
        });
        events.push({
          type: 'tool_call_delta',
          index: state.toolCalls.length - 1,
          delta: {
            toolCallId: call.function.name,
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
  let structuredData: unknown;

  if (state.content) {
    textContent.push({ type: 'text', text: state.content });

    // Try to parse as JSON for structured output
    try {
      structuredData = JSON.parse(state.content);
    } catch {
      // Not valid JSON - that's fine
    }
  }

  for (const tc of state.toolCalls) {
    toolCalls.push({
      toolCallId: tc.name,
      toolName: tc.name,
      arguments: tc.args,
    });
  }

  const message = new AssistantMessage(
    textContent,
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

  const usage: TokenUsage = {
    inputTokens: state.promptEvalCount,
    outputTokens: state.evalCount,
    totalTokens: state.promptEvalCount + state.evalCount,
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
