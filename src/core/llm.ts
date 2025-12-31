import type {
  LLMOptions,
  LLMInstance,
  LLMRequest,
  LLMResponse,
  InferenceInput,
  BoundLLMModel,
  LLMCapabilities,
} from '../types/llm.ts';
import type { UserMessage, AssistantMessage } from '../types/messages.ts';
import type { ContentBlock, TextBlock } from '../types/content.ts';
import type { Tool, ToolExecution, ToolResult } from '../types/tool.ts';
import type { Turn, TokenUsage } from '../types/turn.ts';
import type { StreamResult, StreamEvent } from '../types/stream.ts';
import type { Thread } from '../types/thread.ts';
import type { ProviderConfig } from '../types/provider.ts';
import { UPPError } from '../types/errors.ts';
import {
  Message,
  UserMessage as UserMessageClass,
  ToolResultMessage,
  isUserMessage,
  isAssistantMessage,
} from '../types/messages.ts';
import { createTurn, aggregateUsage, emptyUsage } from '../types/turn.ts';
import { createStreamResult } from '../types/stream.ts';
import { generateShortId } from '../utils/id.ts';

/**
 * Default maximum iterations for tool execution
 */
const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Create an LLM instance
 */
export function llm<TParams = unknown>(
  options: LLMOptions<TParams>
): LLMInstance<TParams> {
  const { model: modelRef, config = {}, params, system, tools, toolStrategy, structure } = options;

  // Validate that the provider supports LLM
  const provider = modelRef.provider;
  if (!provider.modalities.llm) {
    throw new UPPError(
      `Provider '${provider.name}' does not support LLM modality`,
      'INVALID_REQUEST',
      provider.name,
      'llm'
    );
  }

  // Bind the model
  const boundModel = provider.modalities.llm.bind(modelRef.modelId) as BoundLLMModel<TParams>;

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
 * Uses instanceof for class instances, with fallback to timestamp check
 * for deserialized/reconstructed Message objects.
 */
function isMessageInstance(value: unknown): value is Message {
  if (value instanceof Message) {
    return true;
  }
  // Fallback for deserialized Messages that aren't class instances:
  // Messages have 'timestamp' (Date), ContentBlocks don't
  if (
    typeof value === 'object' &&
    value !== null &&
    'timestamp' in value &&
    'type' in value &&
    'id' in value
  ) {
    const obj = value as Record<string, unknown>;
    // Message types are 'user', 'assistant', 'tool_result'
    // ContentBlock types are 'text', 'image', 'audio', 'video', 'binary'
    const messageTypes = ['user', 'assistant', 'tool_result'];
    return messageTypes.includes(obj.type as string);
  }
  return false;
}

/**
 * Parse inputs to determine history and new messages
 */
function parseInputs(
  historyOrInput: Message[] | Thread | InferenceInput,
  inputs: InferenceInput[]
): { history: Message[]; messages: Message[] } {
  // Check if it's a Thread first (has 'messages' array property)
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

  // Check if first arg is Message[] (history)
  if (Array.isArray(historyOrInput)) {
    // Empty array is empty history
    if (historyOrInput.length === 0) {
      const newMessages = inputs.map(inputToMessage);
      return { history: [], messages: newMessages };
    }
    const first = historyOrInput[0];
    if (isMessageInstance(first)) {
      // It's history (Message[])
      const newMessages = inputs.map(inputToMessage);
      return { history: historyOrInput as Message[], messages: newMessages };
    }
  }

  // It's input (no history) - could be string, single Message, or ContentBlock
  const allInputs = [historyOrInput as InferenceInput, ...inputs];
  const newMessages = allInputs.map(inputToMessage);
  return { history: [], messages: newMessages };
}

/**
 * Convert an InferenceInput to a Message
 */
function inputToMessage(input: InferenceInput): Message {
  if (typeof input === 'string') {
    return new UserMessageClass(input);
  }

  // It's already a Message
  if ('type' in input && 'id' in input && 'timestamp' in input) {
    return input as Message;
  }

  // It's a ContentBlock - wrap in UserMessage
  const block = input as ContentBlock;
  if (block.type === 'text') {
    return new UserMessageClass((block as TextBlock).text);
  }

  return new UserMessageClass([block as any]);
}

/**
 * Execute a non-streaming generate call with tool loop
 */
async function executeGenerate<TParams>(
  model: BoundLLMModel<TParams>,
  config: ProviderConfig,
  system: string | undefined,
  params: TParams | undefined,
  tools: Tool[] | undefined,
  toolStrategy: LLMOptions<TParams>['toolStrategy'],
  structure: LLMOptions<TParams>['structure'],
  history: Message[],
  newMessages: Message[]
): Promise<Turn> {
  // Validate media capabilities for all input messages
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

  // Track structured data from responses (providers handle extraction)
  let structuredData: unknown;

  // Tool loop
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

    // Track structured data from provider (if present)
    if (response.data !== undefined) {
      structuredData = response.data;
    }

    // Check for tool calls
    if (response.message.hasToolCalls && tools && tools.length > 0) {
      // If provider already extracted structured data, don't try to execute tool calls
      // (some providers use tool calls internally for structured output)
      if (response.data !== undefined) {
        break;
      }

      // Check if we've hit max iterations (subtract 1 because we already incremented)
      if (cycles >= maxIterations) {
        await toolStrategy?.onMaxIterations?.(maxIterations);
        throw new UPPError(
          `Tool execution exceeded maximum iterations (${maxIterations})`,
          'INVALID_REQUEST',
          model.provider.name,
          'llm'
        );
      }

      // Execute tools
      const results = await executeTools(
        response.message,
        tools,
        toolStrategy,
        toolExecutions
      );

      // Add tool results
      allMessages.push(new ToolResultMessage(results));

      continue;
    }

    // No tool calls - we're done
    break;
  }

  // Use structured data from provider if structure was requested
  const data = structure ? structuredData : undefined;

  return createTurn(
    allMessages.slice(history.length), // Only messages from this turn
    toolExecutions,
    aggregateUsage(usages),
    cycles,
    data
  );
}

/**
 * Execute a streaming generate call with tool loop
 */
function executeStream<TParams>(
  model: BoundLLMModel<TParams>,
  config: ProviderConfig,
  system: string | undefined,
  params: TParams | undefined,
  tools: Tool[] | undefined,
  toolStrategy: LLMOptions<TParams>['toolStrategy'],
  structure: LLMOptions<TParams>['structure'],
  history: Message[],
  newMessages: Message[]
): StreamResult {
  // Validate media capabilities for all input messages
  validateMediaCapabilities(
    [...history, ...newMessages],
    model.capabilities,
    model.provider.name
  );

  const abortController = new AbortController();

  // Shared state between generator and turn promise
  const allMessages: Message[] = [...history, ...newMessages];
  const toolExecutions: ToolExecution[] = [];
  const usages: TokenUsage[] = [];
  let cycles = 0;
  let generatorError: Error | null = null;
  let structuredData: unknown; // Providers extract this

  // Deferred to signal when generator completes
  let resolveGenerator: () => void;
  let rejectGenerator: (error: Error) => void;
  const generatorDone = new Promise<void>((resolve, reject) => {
    resolveGenerator = resolve;
    rejectGenerator = reject;
  });

  const maxIterations = toolStrategy?.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // Create the async generator - this is the ONLY place that calls the API
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

        // Forward stream events
        for await (const event of streamResult) {
          yield event;
        }

        // Get the response
        const response = await streamResult.response;
        usages.push(response.usage);
        allMessages.push(response.message);

        // Track structured data from provider (if present)
        if (response.data !== undefined) {
          structuredData = response.data;
        }

        // Check for tool calls
        if (response.message.hasToolCalls && tools && tools.length > 0) {
          // If provider already extracted structured data, don't try to execute tool calls
          // (some providers use tool calls internally for structured output)
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

          // Execute tools
          const results = await executeTools(
            response.message,
            tools,
            toolStrategy,
            toolExecutions
          );

          // Add tool results
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

  // Turn promise waits for the generator to complete, then builds the Turn
  const turnPromise = (async (): Promise<Turn> => {
    await generatorDone;

    if (generatorError) {
      throw generatorError;
    }

    // Use structured data from provider if structure was requested
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
 * Execute tools from an assistant message
 */
async function executeTools(
  message: AssistantMessage,
  tools: Tool[],
  toolStrategy: LLMOptions<unknown>['toolStrategy'],
  executions: ToolExecution[]
): Promise<ToolResult[]> {
  const toolCalls = message.toolCalls ?? [];
  const results: ToolResult[] = [];

  // Build tool map
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Execute tools (in parallel)
  const promises = toolCalls.map(async (call) => {
    const tool = toolMap.get(call.toolName);
    if (!tool) {
      return {
        toolCallId: call.toolCallId,
        result: `Tool '${call.toolName}' not found`,
        isError: true,
      };
    }

    const startTime = Date.now();

    // Notify strategy
    await toolStrategy?.onToolCall?.(tool, call.arguments);

    // Check before call
    if (toolStrategy?.onBeforeCall) {
      const shouldRun = await toolStrategy.onBeforeCall(tool, call.arguments);
      if (!shouldRun) {
        return {
          toolCallId: call.toolCallId,
          result: 'Tool execution skipped',
          isError: true,
        };
      }
    }

    // Check approval
    let approved = true;
    if (tool.approval) {
      try {
        approved = await tool.approval(call.arguments);
      } catch (error) {
        // Approval threw - propagate
        throw error;
      }
    }

    if (!approved) {
      const execution: ToolExecution = {
        toolName: tool.name,
        toolCallId: call.toolCallId,
        arguments: call.arguments,
        result: 'Tool execution denied',
        isError: true,
        duration: Date.now() - startTime,
        approved: false,
      };
      executions.push(execution);

      return {
        toolCallId: call.toolCallId,
        result: 'Tool execution denied by approval handler',
        isError: true,
      };
    }

    // Execute tool
    try {
      const result = await tool.run(call.arguments);

      await toolStrategy?.onAfterCall?.(tool, call.arguments, result);

      const execution: ToolExecution = {
        toolName: tool.name,
        toolCallId: call.toolCallId,
        arguments: call.arguments,
        result,
        isError: false,
        duration: Date.now() - startTime,
        approved,
      };
      executions.push(execution);

      return {
        toolCallId: call.toolCallId,
        result,
        isError: false,
      };
    } catch (error) {
      await toolStrategy?.onError?.(tool, call.arguments, error as Error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      const execution: ToolExecution = {
        toolName: tool.name,
        toolCallId: call.toolCallId,
        arguments: call.arguments,
        result: errorMessage,
        isError: true,
        duration: Date.now() - startTime,
        approved,
      };
      executions.push(execution);

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
 * Check if messages contain media that requires specific capabilities
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
