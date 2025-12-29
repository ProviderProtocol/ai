import type { Message, AssistantMessage } from './messages.ts';
import type { ToolExecution } from './tool.ts';

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Input tokens across all cycles */
  inputTokens: number;

  /** Output tokens across all cycles */
  outputTokens: number;

  /** Total tokens */
  totalTokens: number;

  /** Per-cycle breakdown (if available) */
  cycles?: Array<{
    inputTokens: number;
    outputTokens: number;
  }>;
}

/**
 * A Turn represents the complete result of one inference call,
 * including all messages produced during tool execution loops.
 */
export interface Turn<TData = unknown> {
  /**
   * All messages produced during this inference, in chronological order.
   * Types: UserMessage, AssistantMessage (may include toolCalls), ToolResultMessage
   */
  readonly messages: Message[];

  /** The final assistant response (convenience accessor) */
  readonly response: AssistantMessage;

  /** Tool executions that occurred during this turn */
  readonly toolExecutions: ToolExecution[];

  /** Aggregate token usage for the entire turn */
  readonly usage: TokenUsage;

  /** Total number of inference cycles (1 + number of tool rounds) */
  readonly cycles: number;

  /**
   * Structured output data (if structure was provided).
   * Type is inferred from the schema when using TypeScript.
   */
  readonly data?: TData;
}

/**
 * Create a Turn from accumulated data
 */
export function createTurn<TData = unknown>(
  messages: Message[],
  toolExecutions: ToolExecution[],
  usage: TokenUsage,
  cycles: number,
  data?: TData
): Turn<TData> {
  // Find the last assistant message as the response
  const response = messages
    .filter((m): m is AssistantMessage => m.type === 'assistant')
    .pop();

  if (!response) {
    throw new Error('Turn must contain at least one assistant message');
  }

  return {
    messages,
    response,
    toolExecutions,
    usage,
    cycles,
    data,
  };
}

/**
 * Create empty token usage
 */
export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cycles: [],
  };
}

/**
 * Aggregate token usage from multiple cycles
 */
export function aggregateUsage(usages: TokenUsage[]): TokenUsage {
  const cycles: TokenUsage['cycles'] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const usage of usages) {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    cycles.push({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cycles,
  };
}
