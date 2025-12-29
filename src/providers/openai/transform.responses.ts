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
import type { OpenAILLMParams } from './types.ts';
import type {
  OpenAIResponsesRequest,
  OpenAIResponsesInputItem,
  OpenAIResponsesInputContent,
  OpenAIResponsesTool,
  OpenAIResponsesResponse,
  OpenAIResponsesStreamEvent,
  OpenAIResponsesOutputItem,
  OpenAIResponsesFunctionCall,
} from './types.responses.ts';

/**
 * Transform UPP request to OpenAI Responses API format
 */
export function transformResponsesRequest<TParams extends OpenAILLMParams>(
  request: LLMRequest<TParams>,
  modelId: string
): OpenAIResponsesRequest {
  const params = (request.params ?? {}) as OpenAILLMParams;

  const responsesRequest: OpenAIResponsesRequest = {
    model: modelId,
    // Cast to any since the input can include function_call items
    input: transformMessagesToInput(request.messages) as any,
  };

  // System prompt becomes instructions
  if (request.system) {
    responsesRequest.instructions = request.system;
  }

  // Model parameters (note: max_output_tokens not max_completion_tokens)
  if (params.max_completion_tokens !== undefined) {
    responsesRequest.max_output_tokens = params.max_completion_tokens;
  } else if (params.max_tokens !== undefined) {
    responsesRequest.max_output_tokens = params.max_tokens;
  }
  if (params.temperature !== undefined) {
    responsesRequest.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    responsesRequest.top_p = params.top_p;
  }
  if (params.stop !== undefined) {
    responsesRequest.stop = params.stop;
  }
  if (params.seed !== undefined) {
    responsesRequest.seed = params.seed;
  }
  if (params.user !== undefined) {
    responsesRequest.user = params.user;
  }

  // Tools (flattened structure in Responses API)
  if (request.tools && request.tools.length > 0) {
    responsesRequest.tools = request.tools.map(transformTool);
    responsesRequest.tool_choice = 'auto';
  }

  // Don't store by default (matches UPP's stateless behavior)
  responsesRequest.store = true;

  return responsesRequest;
}

/**
 * Function call input item (for including tool calls from assistant)
 */
interface OpenAIResponsesFunctionCallInput {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

/**
 * Transform UPP Messages to Responses API input items
 */
function transformMessagesToInput(messages: Message[]): (OpenAIResponsesInputItem | OpenAIResponsesFunctionCallInput)[] {
  const input: (OpenAIResponsesInputItem | OpenAIResponsesFunctionCallInput)[] = [];

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      const content = msg.content;
      const validContent = content.filter((c) => c && typeof c.type === 'string');
      const hasMultimodal = validContent.some(
        (c) => c.type === 'image' || c.type === 'audio' || c.type === 'video'
      );

      if (hasMultimodal) {
        input.push({
          role: 'user',
          content: validContent.map(transformContentBlock),
        });
      } else {
        // Simple text format
        const text = validContent
          .filter((c): c is TextBlock => c.type === 'text')
          .map((c) => c.text)
          .join('\n\n');

        input.push({
          role: 'user',
          content: text,
        });
      }
    } else if (isAssistantMessage(msg)) {
      const textContent = msg.content
        .filter((c): c is TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n\n');

      if (textContent) {
        input.push({
          role: 'assistant',
          content: textContent,
        });
      }

      // Include function calls from assistant messages
      // The Responses API requires these when sending function_call_output items
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const call of msg.toolCalls) {
          input.push({
            type: 'function_call',
            id: `fc_${call.toolCallId}`,
            call_id: call.toolCallId,
            name: call.toolName,
            arguments: typeof call.arguments === 'string'
              ? call.arguments
              : JSON.stringify(call.arguments),
          });
        }
      }
    } else if (isToolResultMessage(msg)) {
      // Tool results as function_call_output items
      for (const result of msg.results) {
        input.push({
          type: 'function_call_output',
          call_id: result.toolCallId,
          output:
            typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result),
        });
      }
    }
  }

  return input;
}

/**
 * Transform a content block to Responses API input content
 */
function transformContentBlock(block: ContentBlock): OpenAIResponsesInputContent {
  switch (block.type) {
    case 'text':
      return { type: 'input_text', text: block.text };

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

      return { type: 'input_image', image_url: url };
    }

    default:
      throw new Error(`Unsupported content type: ${block.type}`);
  }
}

/**
 * Transform a UPP Tool to Responses API format (flattened structure)
 */
function transformTool(tool: Tool): OpenAIResponsesTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.parameters.properties,
      required: tool.parameters.required,
      additionalProperties: tool.parameters.additionalProperties,
    },
  };
}

/**
 * Transform Responses API response to UPP LLMResponse
 */
export function transformResponsesResponse(data: OpenAIResponsesResponse): LLMResponse {
  const textContent: TextBlock[] = [];
  const toolCalls: ToolCall[] = [];

  // Extract text and tool calls from output items
  for (const item of data.output) {
    if (item.type === 'message') {
      for (const content of item.content) {
        if (content.type === 'output_text') {
          textContent.push({ type: 'text', text: content.text });
        }
      }
    } else if (item.type === 'function_call') {
      const fc = item as OpenAIResponsesFunctionCall;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fc.arguments);
      } catch {
        // Invalid JSON
      }
      toolCalls.push({
        toolCallId: fc.call_id,
        toolName: fc.name,
        arguments: args,
      });
    }
  }

  // If no structured content, use output_text convenience accessor
  if (textContent.length === 0 && data.output_text) {
    textContent.push({ type: 'text', text: data.output_text });
  }

  const message = new AssistantMessage(
    textContent,
    toolCalls.length > 0 ? toolCalls : undefined,
    {
      id: data.id,
      metadata: {
        openai: {
          model: data.model,
          status: data.status,
          api: 'responses',
        },
      },
    }
  );

  const usage: TokenUsage = {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: data.usage.total_tokens,
  };

  // Map status to stop reason
  let stopReason: string = 'stop';
  if (data.status === 'incomplete' && data.incomplete_details?.reason) {
    stopReason = data.incomplete_details.reason;
  } else if (data.status === 'failed') {
    stopReason = 'error';
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
export interface ResponsesStreamState {
  id: string;
  model: string;
  content: string;
  toolCalls: Map<number, { callId: string; name: string; arguments: string }>;
  status: string;
  inputTokens: number;
  outputTokens: number;
  isFirstChunk: boolean;
}

/**
 * Create initial stream state for Responses API
 */
export function createResponsesStreamState(): ResponsesStreamState {
  return {
    id: '',
    model: '',
    content: '',
    toolCalls: new Map(),
    status: '',
    inputTokens: 0,
    outputTokens: 0,
    isFirstChunk: true,
  };
}

/**
 * Transform Responses API stream event to UPP StreamEvents
 */
export function transformResponsesStreamEvent(
  event: OpenAIResponsesStreamEvent,
  state: ResponsesStreamState
): StreamEvent[] {
  const events: StreamEvent[] = [];

  switch (event.type) {
    case 'response.created': {
      if (event.response.id) state.id = event.response.id;
      if (event.response.model) state.model = event.response.model;
      if (state.isFirstChunk) {
        events.push({ type: 'message_start', index: 0, delta: {} });
        state.isFirstChunk = false;
      }
      break;
    }

    case 'response.output_item.added': {
      const item = event.item;
      if (item.type === 'function_call') {
        const fc = item as OpenAIResponsesFunctionCall;
        state.toolCalls.set(event.output_index, {
          callId: fc.call_id,
          name: fc.name,
          arguments: '',
        });
      }
      break;
    }

    case 'response.output_text.delta': {
      state.content += event.delta;
      events.push({
        type: 'text_delta',
        index: 0,
        delta: { text: event.delta },
      });
      break;
    }

    case 'response.function_call_arguments.delta': {
      const existing = state.toolCalls.get(event.output_index);
      if (existing) {
        existing.arguments += event.delta;
        events.push({
          type: 'tool_call_delta',
          index: event.output_index,
          delta: {
            toolCallId: existing.callId,
            toolName: existing.name,
            argumentsJson: event.delta,
          },
        });
      }
      break;
    }

    case 'response.completed': {
      state.status = event.response.status;
      state.inputTokens = event.response.usage.input_tokens;
      state.outputTokens = event.response.usage.output_tokens;
      events.push({ type: 'message_stop', index: 0, delta: {} });
      break;
    }

    case 'error': {
      // Handle error event
      break;
    }
  }

  return events;
}

/**
 * Build LLMResponse from accumulated Responses API stream state
 */
export function buildResponsesFromState(state: ResponsesStreamState): LLMResponse {
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
      toolCallId: tc.callId,
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
          status: state.status,
          api: 'responses',
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
    stopReason: state.status || 'completed',
  };
}
