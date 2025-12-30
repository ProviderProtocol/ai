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
 */
export function transformRequest<TParams extends OllamaLLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): OllamaRequest {
  const params = (request.params ?? {}) as OllamaLLMParams;

  const ollamaRequest: OllamaRequest = {
    model: modelId,
    messages: transformMessages(request.messages, request.system),
  };

  // Build options object for runtime parameters
  const options: OllamaOptions = {};

  if (params.num_predict !== undefined) options.num_predict = params.num_predict;
  if (params.temperature !== undefined) options.temperature = params.temperature;
  if (params.top_p !== undefined) options.top_p = params.top_p;
  if (params.top_k !== undefined) options.top_k = params.top_k;
  if (params.min_p !== undefined) options.min_p = params.min_p;
  if (params.typical_p !== undefined) options.typical_p = params.typical_p;
  if (params.repeat_penalty !== undefined) options.repeat_penalty = params.repeat_penalty;
  if (params.repeat_last_n !== undefined) options.repeat_last_n = params.repeat_last_n;
  if (params.presence_penalty !== undefined) options.presence_penalty = params.presence_penalty;
  if (params.frequency_penalty !== undefined) options.frequency_penalty = params.frequency_penalty;
  if (params.mirostat !== undefined) options.mirostat = params.mirostat;
  if (params.mirostat_eta !== undefined) options.mirostat_eta = params.mirostat_eta;
  if (params.mirostat_tau !== undefined) options.mirostat_tau = params.mirostat_tau;
  if (params.penalize_newline !== undefined) options.penalize_newline = params.penalize_newline;
  if (params.stop !== undefined) options.stop = params.stop;
  if (params.seed !== undefined) options.seed = params.seed;
  if (params.num_keep !== undefined) options.num_keep = params.num_keep;
  if (params.num_ctx !== undefined) options.num_ctx = params.num_ctx;
  if (params.num_batch !== undefined) options.num_batch = params.num_batch;
  if (params.num_thread !== undefined) options.num_thread = params.num_thread;
  if (params.num_gpu !== undefined) options.num_gpu = params.num_gpu;
  if (params.main_gpu !== undefined) options.main_gpu = params.main_gpu;
  if (params.low_vram !== undefined) options.low_vram = params.low_vram;
  if (params.f16_kv !== undefined) options.f16_kv = params.f16_kv;
  if (params.use_mmap !== undefined) options.use_mmap = params.use_mmap;
  if (params.use_mlock !== undefined) options.use_mlock = params.use_mlock;
  if (params.vocab_only !== undefined) options.vocab_only = params.vocab_only;
  if (params.numa !== undefined) options.numa = params.numa;
  if (params.tfs_z !== undefined) options.tfs_z = params.tfs_z;

  if (Object.keys(options).length > 0) {
    ollamaRequest.options = options;
  }

  // Top-level parameters
  if (params.keep_alive !== undefined) {
    ollamaRequest.keep_alive = params.keep_alive;
  }
  if (params.think !== undefined) {
    ollamaRequest.think = params.think;
  }
  if (params.logprobs !== undefined) {
    ollamaRequest.logprobs = params.logprobs;
  }
  if (params.top_logprobs !== undefined) {
    ollamaRequest.top_logprobs = params.top_logprobs;
  }

  // Tools
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
