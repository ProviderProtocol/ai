/**
 * @fileoverview Turn types for inference results.
 *
 * A Turn represents the complete result of one inference call, including
 * all messages produced during tool execution loops, token usage, and
 * optional structured output data.
 *
 * @module types/turn
 */

import type { Message, AssistantMessage } from './messages.ts';
import type { ToolExecution } from './tool.ts';

/**
 * Token usage information for an inference request.
 *
 * Tracks input and output tokens across all inference cycles,
 * with optional per-cycle breakdown and cache metrics.
 *
 * @example
 * ```typescript
 * const usage: TokenUsage = {
 *   inputTokens: 150,
 *   outputTokens: 50,
 *   totalTokens: 200,
 *   cacheReadTokens: 100,
 *   cacheWriteTokens: 50,
 *   cycles: [
 *     { inputTokens: 100, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 50 },
 *     { inputTokens: 50, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 0 }
 *   ]
 * };
 * ```
 */
export interface TokenUsage {
  /** Total input tokens across all cycles */
  inputTokens: number;

  /** Total output tokens across all cycles */
  outputTokens: number;

  /** Sum of input and output tokens */
  totalTokens: number;

  /**
   * Tokens read from cache (cache hits).
   * Returns 0 for providers that don't support or report cache metrics.
   */
  cacheReadTokens: number;

  /**
   * Tokens written to cache (cache misses that were cached).
   * Only Anthropic reports this metric; returns 0 for other providers.
   */
  cacheWriteTokens: number;

  /** Per-cycle token breakdown (if multiple cycles occurred) */
  cycles?: Array<{
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }>;
}

/**
 * A Turn represents the complete result of one inference call.
 *
 * Includes all messages produced during tool execution loops,
 * the final assistant response, token usage, and optional
 * structured output data.
 *
 * @typeParam TData - Type of the structured output data
 *
 * @example
 * ```typescript
 * const turn = await instance.generate('Hello');
 * console.log(turn.response.text);
 * console.log(`Used ${turn.usage.totalTokens} tokens in ${turn.cycles} cycles`);
 *
 * // With structured output
 * interface WeatherData { temperature: number; conditions: string; }
 * const turn = await instance.generate<WeatherData>('Get weather');
 * console.log(turn.data?.temperature);
 * ```
 */
export interface Turn<TData = unknown> {
  /**
   * All messages produced during this inference, in chronological order.
   * Includes UserMessage, AssistantMessage (may include toolCalls), and ToolResultMessage.
   */
  readonly messages: Message[];

  /** The final assistant response (last AssistantMessage in the turn) */
  readonly response: AssistantMessage;

  /** Tool executions that occurred during this turn */
  readonly toolExecutions: ToolExecution[];

  /** Aggregate token usage for the entire turn */
  readonly usage: TokenUsage;

  /** Total number of inference cycles (1 + number of tool rounds) */
  readonly cycles: number;

  /**
   * Structured output data (if a structure schema was provided).
   * Type is inferred from the schema when using TypeScript.
   */
  readonly data?: TData;
}

/**
 * Creates a Turn from accumulated inference data.
 *
 * @typeParam TData - Type of the structured output data
 * @param messages - All messages produced during the inference
 * @param toolExecutions - Record of all tool executions
 * @param usage - Aggregate token usage
 * @param cycles - Number of inference cycles
 * @param data - Optional structured output data
 * @returns A complete Turn object
 * @throws Error if no assistant message is found in the messages
 *
 * @example
 * ```typescript
 * const turn = createTurn(
 *   [userMsg, assistantMsg],
 *   [],
 *   { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
 *   1
 * );
 * ```
 */
export function createTurn<TData = unknown>(
  messages: Message[],
  toolExecutions: ToolExecution[],
  usage: TokenUsage,
  cycles: number,
  data?: TData
): Turn<TData> {
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
 * Creates an empty TokenUsage object.
 *
 * @returns A TokenUsage with all values set to zero
 *
 * @example
 * ```typescript
 * const usage = emptyUsage();
 * // { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cycles: [] }
 * ```
 */
export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cycles: [],
  };
}

/**
 * Aggregates token usage from multiple inference cycles.
 *
 * @param usages - Array of TokenUsage objects to aggregate
 * @returns Combined TokenUsage with per-cycle breakdown
 *
 * @example
 * ```typescript
 * const cycle1 = { inputTokens: 100, outputTokens: 30, totalTokens: 130, cacheReadTokens: 50, cacheWriteTokens: 0 };
 * const cycle2 = { inputTokens: 150, outputTokens: 40, totalTokens: 190, cacheReadTokens: 100, cacheWriteTokens: 0 };
 * const total = aggregateUsage([cycle1, cycle2]);
 * // { inputTokens: 250, outputTokens: 70, totalTokens: 320, cacheReadTokens: 150, cacheWriteTokens: 0, cycles: [...] }
 * ```
 */
export function aggregateUsage(usages: TokenUsage[]): TokenUsage {
  const cycles: TokenUsage['cycles'] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  for (const usage of usages) {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    cacheReadTokens += usage.cacheReadTokens;
    cacheWriteTokens += usage.cacheWriteTokens;
    cycles.push({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    });
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cycles,
  };
}
