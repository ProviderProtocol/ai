/**
 * @fileoverview LLM instance factory and streaming logic for the Universal Provider Protocol.
 *
 * This module provides the core functionality for creating and managing LLM instances,
 * including support for tool execution, streaming responses, and structured output.
 *
 * @module core/llm
 */

import type {
  LLMOptions,
  LLMInstance,
  LLMRequest,
  LLMResponse,
  InferenceInput,
  BoundLLMModel,
  LLMCapabilities,
  LLMHandler,
} from '../types/llm.ts';
import type { UserMessage, AssistantMessage } from '../types/messages.ts';
import type { ContentBlock, TextBlock } from '../types/content.ts';
import type { AfterCallResult, BeforeCallResult, Tool, ToolExecution, ToolResult } from '../types/tool.ts';
import type { Turn, TokenUsage } from '../types/turn.ts';
import type { StreamResult, StreamEvent } from '../types/stream.ts';
import type { Thread } from '../types/thread.ts';
import type { ProviderConfig } from '../types/provider.ts';
import { UPPError } from '../types/errors.ts';
import { resolveLLMHandler } from './provider-handlers.ts';
import {
  Message,
  UserMessage as UserMessageClass,
  ToolResultMessage,
  isUserMessage,
  isAssistantMessage,
} from '../types/messages.ts';
import { createTurn, aggregateUsage, emptyUsage } from '../types/turn.ts';
import {
  createStreamResult,
  toolExecutionStart,
  toolExecutionEnd,
} from '../types/stream.ts';
import { generateShortId } from '../utils/id.ts';

/** Default maximum iterations for the tool execution loop */
const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Creates an LLM instance configured with the specified options.
 *
 * This is the primary factory function for creating LLM instances. It validates
 * provider capabilities, binds the model, and returns an instance with `generate`
 * and `stream` methods for inference.
 *
 * @typeParam TParams - Provider-specific parameter type for model configuration
 * @param options - Configuration options for the LLM instance
 * @returns A configured LLM instance ready for inference
 * @throws {UPPError} When the provider does not support the LLM modality
 * @throws {UPPError} When structured output is requested but not supported
 * @throws {UPPError} When tools are provided but not supported
 *
 * @example
 * ```typescript
 * import { llm } from 'upp';
 * import { anthropic } from 'upp/providers/anthropic';
 *
 * const assistant = llm({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   system: 'You are a helpful assistant.',
 *   tools: [myTool],
 * });
 *
 * const turn = await assistant.generate('Hello, world!');
 * console.log(turn.text);
 * ```
 */
export function llm<TParams = unknown>(
  options: LLMOptions<TParams>
): LLMInstance<TParams> {
  const { model: modelRef, config: explicitConfig = {}, params, system, tools, toolStrategy, structure } = options;

  // Merge providerConfig from model reference with explicit config
  // Explicit config takes precedence, with headers being deep-merged
  const providerConfig = modelRef.providerConfig ?? {};
  const config: ProviderConfig = {
    ...providerConfig,
    ...explicitConfig,
    headers: {
      ...providerConfig.headers,
      ...explicitConfig.headers,
    },
  };

  // Resolve the correct LLM handler based on model reference options
  // This handles providers with multiple handlers (e.g., OpenAI responses/completions)
  // Cast is safe: ModelInput uses structural typing with unknown for variance, but the
  // actual provider at runtime is a proper Provider with LLMHandler
  const provider = modelRef.provider;
  const llmHandler = resolveLLMHandler(provider, modelRef.options) as LLMHandler<TParams> | undefined;

  if (!llmHandler) {
    throw new UPPError(
      `Provider '${provider.name}' does not support LLM modality`,
      'INVALID_REQUEST',
      provider.name,
      'llm'
    );
  }

  // Bind the model
  const boundModel = llmHandler.bind(modelRef.modelId);

  // Validate capabilities at bind time
  const capabilities = boundModel.capabilities;

  // Check for structured output capability
  if (structure && !capabilities.structuredOutput) {
    throw new UPPError(
      `Provider '${provider.name}' does not support structured output`,
      'INVALID_REQUEST',
      provider.name,
      'llm'
    );
  }

  // Check for tools capability
  if (tools && tools.length > 0 && !capabilities.tools) {
    throw new UPPError(
      `Provider '${provider.name}' does not support tools`,
      'INVALID_REQUEST',
      provider.name,
      'llm'
    );
  }

  // Build the instance
  const instance: LLMInstance<TParams> = {
    model: boundModel,
    system,
    params,
    capabilities,

    async generate(
      historyOrInput: Message[] | Thread | InferenceInput,
      ...inputs: InferenceInput[]
    ): Promise<Turn> {
      const { history, messages } = parseInputs(historyOrInput, inputs);
      return executeGenerate(
        boundModel,
        config,
        system,
        params,
        tools,
        toolStrategy,
        structure,
        history,
        messages
      );
    },

    stream(
      historyOrInput: Message[] | Thread | InferenceInput,
      ...inputs: InferenceInput[]
    ): StreamResult {
      // Check streaming capability
      if (!capabilities.streaming) {
        throw new UPPError(
          `Provider '${provider.name}' does not support streaming`,
          'INVALID_REQUEST',
          provider.name,
          'llm'
        );
      }
      const { history, messages } = parseInputs(historyOrInput, inputs);
      return executeStream(
        boundModel,
        config,
        system,
        params,
        tools,
        toolStrategy,
        structure,
        history,
        messages
      );
    },
  };

  return instance;
}

/**
 * Type guard to check if a value is a Message instance.
 *
 * Uses `instanceof` for class instances, with a structural fallback for
 * deserialized or reconstructed Message objects that have the expected shape.
 *
 * @param value - The value to check
 * @returns `true` if the value is a Message instance
 */
function isMessageInstance(value: unknown): value is Message {
  if (value instanceof Message) {
    return true;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'timestamp' in value &&
    'type' in value &&
    'id' in value
  ) {
    const obj = value as Record<string, unknown>;
    const messageTypes = ['user', 'assistant', 'tool_result'];
    return messageTypes.includes(obj.type as string);
  }
  return false;
}

/**
 * Parses flexible input arguments to separate conversation history from new messages.
 *
 * Supports multiple input patterns:
 * - Thread object with existing messages
 * - Message array as history
 * - Direct input (string, Message, or ContentBlock) without history
 *
 * @param historyOrInput - Either conversation history or the first input
 * @param inputs - Additional inputs to convert to messages
 * @returns Object containing separated history and new messages arrays
 */
function parseInputs(
  historyOrInput: Message[] | Thread | InferenceInput,
  inputs: InferenceInput[]
): { history: Message[]; messages: Message[] } {
  if (
    typeof historyOrInput === 'object' &&
    historyOrInput !== null &&
    'messages' in historyOrInput &&
    Array.isArray((historyOrInput as Thread).messages)
  ) {
    const thread = historyOrInput as Thread;
    const newMessages = inputs.map(inputToMessage);
    return { history: [...thread.messages], messages: newMessages };
  }

  if (Array.isArray(historyOrInput)) {
    if (historyOrInput.length === 0) {
      const newMessages = inputs.map(inputToMessage);
      return { history: [], messages: newMessages };
    }
    const first = historyOrInput[0];
    if (isMessageInstance(first)) {
      const newMessages = inputs.map(inputToMessage);
      return { history: historyOrInput as Message[], messages: newMessages };
    }
  }

  const allInputs = [historyOrInput as InferenceInput, ...inputs];
  const newMessages = allInputs.map(inputToMessage);
  return { history: [], messages: newMessages };
}

/**
 * Converts an inference input to a Message instance.
 *
 * Handles string inputs, existing Message objects, and ContentBlocks,
 * wrapping non-Message inputs in a UserMessage.
 *
 * @param input - The input to convert (string, Message, or ContentBlock)
 * @returns A Message instance
 */
function inputToMessage(input: InferenceInput): Message {
  if (typeof input === 'string') {
    return new UserMessageClass(input);
  }

  if ('type' in input && 'id' in input && 'timestamp' in input) {
    return input as Message;
  }

  const block = input as ContentBlock;
  if (block.type === 'text') {
    return new UserMessageClass((block as TextBlock).text);
  }

  return new UserMessageClass([block]);
}

/**
 * Executes a non-streaming generation request with automatic tool execution loop.
 *
 * Handles the complete lifecycle of a generation request including:
 * - Media capability validation
 * - Iterative tool execution until completion or max iterations
 * - Token usage aggregation across iterations
 * - Structured output extraction
 *
 * @typeParam TParams - Provider-specific parameter type
 * @param model - The bound LLM model to use
 * @param config - Provider configuration options
 * @param system - Optional system prompt
 * @param params - Provider-specific parameters
 * @param tools - Available tools for the model to call
 * @param toolStrategy - Strategy for tool execution behavior
 * @param structure - Schema for structured output
 * @param history - Previous conversation messages
 * @param newMessages - New messages to send
 * @returns A Turn containing all messages, tool executions, and usage
 * @throws {UPPError} When max iterations exceeded or media not supported
 */
async function executeGenerate<TParams>(
  model: BoundLLMModel<TParams>,
  config: ProviderConfig,
  system: string | unknown[] | undefined,
  params: TParams | undefined,
  tools: Tool[] | undefined,
  toolStrategy: LLMOptions<TParams>['toolStrategy'],
  structure: LLMOptions<TParams>['structure'],
  history: Message[],
  newMessages: Message[]
): Promise<Turn> {
  validateMediaCapabilities(
    [...history, ...newMessages],
    model.capabilities,
    model.provider.name
  );
  const maxIterations = toolStrategy?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const allMessages: Message[] = [...history, ...newMessages];
  const toolExecutions: ToolExecution[] = [];
  const usages: TokenUsage[] = [];
  let cycles = 0;

  let structuredData: unknown;

  while (cycles < maxIterations + 1) {
    cycles++;

    const request: LLMRequest<TParams> = {
      messages: allMessages,
      system,
      params,
      tools,
      structure,
      config,
    };

    const response = await model.complete(request);
    usages.push(response.usage);
    allMessages.push(response.message);

    if (response.data !== undefined) {
      structuredData = response.data;
    }

    if (response.message.hasToolCalls && tools && tools.length > 0) {
      if (response.data !== undefined) {
        break;
      }

      if (cycles >= maxIterations) {
        await toolStrategy?.onMaxIterations?.(maxIterations);
        throw new UPPError(
          `Tool execution exceeded maximum iterations (${maxIterations})`,
          'INVALID_REQUEST',
          model.provider.name,
          'llm'
        );
      }

      const results = await executeTools(
        response.message,
        tools,
        toolStrategy,
        toolExecutions
      );

      allMessages.push(new ToolResultMessage(results));

      continue;
    }

    break;
  }

  const data = structure ? structuredData : undefined;

  return createTurn(
    allMessages.slice(history.length),
    toolExecutions,
    aggregateUsage(usages),
    cycles,
    data
  );
}

/**
 * Executes a streaming generation request with automatic tool execution loop.
 *
 * Creates an async generator that yields stream events while handling the complete
 * lifecycle of a streaming request. The returned StreamResult provides both the
 * event stream and a promise that resolves to the final Turn.
 *
 * @typeParam TParams - Provider-specific parameter type
 * @param model - The bound LLM model to use
 * @param config - Provider configuration options
 * @param system - Optional system prompt
 * @param params - Provider-specific parameters
 * @param tools - Available tools for the model to call
 * @param toolStrategy - Strategy for tool execution behavior
 * @param structure - Schema for structured output
 * @param history - Previous conversation messages
 * @param newMessages - New messages to send
 * @returns A StreamResult with event generator and turn promise
 * @throws {UPPError} When max iterations exceeded or media not supported
 */
function executeStream<TParams>(
  model: BoundLLMModel<TParams>,
  config: ProviderConfig,
  system: string | unknown[] | undefined,
  params: TParams | undefined,
  tools: Tool[] | undefined,
  toolStrategy: LLMOptions<TParams>['toolStrategy'],
  structure: LLMOptions<TParams>['structure'],
  history: Message[],
  newMessages: Message[]
): StreamResult {
  validateMediaCapabilities(
    [...history, ...newMessages],
    model.capabilities,
    model.provider.name
  );

  const abortController = new AbortController();

  const allMessages: Message[] = [...history, ...newMessages];
  const toolExecutions: ToolExecution[] = [];
  const usages: TokenUsage[] = [];
  let cycles = 0;
  let generatorError: Error | null = null;
  let structuredData: unknown;

  let resolveGenerator: () => void;
  let rejectGenerator: (error: Error) => void;
  const generatorDone = new Promise<void>((resolve, reject) => {
    resolveGenerator = resolve;
    rejectGenerator = reject;
  });

  const maxIterations = toolStrategy?.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  async function* generateStream(): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      while (cycles < maxIterations + 1) {
        cycles++;

        const request: LLMRequest<TParams> = {
          messages: allMessages,
          system,
          params,
          tools,
          structure,
          config,
          signal: abortController.signal,
        };

        const streamResult = model.stream(request);

        for await (const event of streamResult) {
          yield event;
        }

        const response = await streamResult.response;
        usages.push(response.usage);
        allMessages.push(response.message);

        if (response.data !== undefined) {
          structuredData = response.data;
        }

        if (response.message.hasToolCalls && tools && tools.length > 0) {
          if (response.data !== undefined) {
            break;
          }

          if (cycles >= maxIterations) {
            await toolStrategy?.onMaxIterations?.(maxIterations);
            throw new UPPError(
              `Tool execution exceeded maximum iterations (${maxIterations})`,
              'INVALID_REQUEST',
              model.provider.name,
              'llm'
            );
          }

          const toolEvents: StreamEvent[] = [];
          const results = await executeTools(
            response.message,
            tools,
            toolStrategy,
            toolExecutions,
            (event) => toolEvents.push(event)
          );

          for (const event of toolEvents) {
            yield event;
          }

          allMessages.push(new ToolResultMessage(results));

          continue;
        }

        break;
      }
      resolveGenerator();
    } catch (error) {
      generatorError = error as Error;
      rejectGenerator(error as Error);
      throw error;
    }
  }

  const turnPromise = (async (): Promise<Turn> => {
    await generatorDone;

    if (generatorError) {
      throw generatorError;
    }

    const data = structure ? structuredData : undefined;

    return createTurn(
      allMessages.slice(history.length),
      toolExecutions,
      aggregateUsage(usages),
      cycles,
      data
    );
  })();

  return createStreamResult(generateStream(), turnPromise, abortController);
}

/**
 * Executes tool calls from an assistant message in parallel.
 *
 * Handles the complete tool execution flow including:
 * - Tool lookup and validation
 * - Strategy callbacks (onToolCall, onBeforeCall, onAfterCall, onError)
 * - Approval handlers
 * - Execution tracking and timing
 * - Stream event emission for real-time updates
 *
 * @param message - The assistant message containing tool calls
 * @param tools - Available tools to execute
 * @param toolStrategy - Strategy for controlling tool execution behavior
 * @param executions - Array to collect execution records (mutated in place)
 * @param onEvent - Optional callback for emitting stream events during execution
 * @returns Array of tool results to send back to the model
 */
async function executeTools(
  message: AssistantMessage,
  tools: Tool[],
  toolStrategy: LLMOptions<unknown>['toolStrategy'],
  executions: ToolExecution[],
  onEvent?: (event: StreamEvent) => void
): Promise<ToolResult[]> {
  const toolCalls = message.toolCalls ?? [];
  const results: ToolResult[] = [];

  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const promises = toolCalls.map(async (call, index) => {
    const tool = toolMap.get(call.toolName);
    if (!tool) {
      return {
        toolCallId: call.toolCallId,
        result: `Tool '${call.toolName}' not found`,
        isError: true,
      };
    }

    const startTime = Date.now();

    onEvent?.(toolExecutionStart(call.toolCallId, tool.name, startTime, index));

    let effectiveParams = call.arguments;

    await toolStrategy?.onToolCall?.(tool, effectiveParams);

    if (toolStrategy?.onBeforeCall) {
      const beforeResult = await toolStrategy.onBeforeCall(tool, effectiveParams);
      const isBeforeCallResult = (value: unknown): value is BeforeCallResult =>
        typeof value === 'object' && value !== null && 'proceed' in value;

      if (isBeforeCallResult(beforeResult)) {
        if (!beforeResult.proceed) {
          const endTime = Date.now();
          onEvent?.(toolExecutionEnd(call.toolCallId, tool.name, 'Tool execution skipped', true, endTime, index));
          return {
            toolCallId: call.toolCallId,
            result: 'Tool execution skipped',
            isError: true,
          };
        }
        if (beforeResult.params !== undefined) {
          effectiveParams = beforeResult.params as Record<string, unknown>;
        }
      } else if (!beforeResult) {
        const endTime = Date.now();
        onEvent?.(toolExecutionEnd(call.toolCallId, tool.name, 'Tool execution skipped', true, endTime, index));
        return {
          toolCallId: call.toolCallId,
          result: 'Tool execution skipped',
          isError: true,
        };
      }
    }

    let approved = true;
    if (tool.approval) {
      try {
        approved = await tool.approval(effectiveParams);
      } catch (error) {
        throw error;
      }
    }

    if (!approved) {
      const endTime = Date.now();
      const execution: ToolExecution = {
        toolName: tool.name,
        toolCallId: call.toolCallId,
        arguments: effectiveParams as Record<string, unknown>,
        result: 'Tool execution denied',
        isError: true,
        duration: endTime - startTime,
        approved: false,
      };
      executions.push(execution);

      onEvent?.(toolExecutionEnd(call.toolCallId, tool.name, 'Tool execution denied by approval handler', true, endTime, index));

      return {
        toolCallId: call.toolCallId,
        result: 'Tool execution denied by approval handler',
        isError: true,
      };
    }

    try {
      let result = await tool.run(effectiveParams);
      const endTime = Date.now();

      if (toolStrategy?.onAfterCall) {
        const afterResult = await toolStrategy.onAfterCall(tool, effectiveParams, result);
        const isAfterCallResult = (value: unknown): value is AfterCallResult =>
          typeof value === 'object' && value !== null && 'result' in value;

        if (isAfterCallResult(afterResult)) {
          result = afterResult.result;
        }
      }

      const execution: ToolExecution = {
        toolName: tool.name,
        toolCallId: call.toolCallId,
        arguments: effectiveParams as Record<string, unknown>,
        result,
        isError: false,
        duration: endTime - startTime,
        approved,
      };
      executions.push(execution);

      onEvent?.(toolExecutionEnd(call.toolCallId, tool.name, result, false, endTime, index));

      return {
        toolCallId: call.toolCallId,
        result,
        isError: false,
      };
    } catch (error) {
      const endTime = Date.now();
      await toolStrategy?.onError?.(tool, effectiveParams, error as Error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      const execution: ToolExecution = {
        toolName: tool.name,
        toolCallId: call.toolCallId,
        arguments: effectiveParams as Record<string, unknown>,
        result: errorMessage,
        isError: true,
        duration: endTime - startTime,
        approved,
      };
      executions.push(execution);

      onEvent?.(toolExecutionEnd(call.toolCallId, tool.name, errorMessage, true, endTime, index));

      return {
        toolCallId: call.toolCallId,
        result: errorMessage,
        isError: true,
      };
    }
  });

  results.push(...(await Promise.all(promises)));
  return results;
}

/**
 * Validates that message content is compatible with provider capabilities.
 *
 * Checks user messages for media types (image, video, audio) and throws
 * if the provider does not support the required input modality.
 *
 * @param messages - Messages to validate
 * @param capabilities - Provider's declared capabilities
 * @param providerName - Provider name for error messages
 * @throws {UPPError} When a message contains unsupported media type
 */
function validateMediaCapabilities(
  messages: Message[],
  capabilities: LLMCapabilities,
  providerName: string
): void {
  for (const msg of messages) {
    if (!isUserMessage(msg)) continue;

    for (const block of msg.content) {
      if (block.type === 'image' && !capabilities.imageInput) {
        throw new UPPError(
          `Provider '${providerName}' does not support image input`,
          'INVALID_REQUEST',
          providerName,
          'llm'
        );
      }
      if (block.type === 'video' && !capabilities.videoInput) {
        throw new UPPError(
          `Provider '${providerName}' does not support video input`,
          'INVALID_REQUEST',
          providerName,
          'llm'
        );
      }
      if (block.type === 'audio' && !capabilities.audioInput) {
        throw new UPPError(
          `Provider '${providerName}' does not support audio input`,
          'INVALID_REQUEST',
          providerName,
          'llm'
        );
      }
    }
  }
}
