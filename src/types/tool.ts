/**
 * @fileoverview Tool types for LLM function calling.
 *
 * Defines the interfaces for registering tools with LLMs, handling
 * tool calls from the model, and managing tool execution strategies.
 *
 * @module types/tool
 */

import type { JSONSchema } from './schema.ts';

/**
 * Provider-namespaced metadata for tools.
 *
 * Each provider can attach its own metadata under its namespace,
 * enabling provider-specific features like caching, strict mode, etc.
 *
 * @example
 * ```typescript
 * const metadata: ToolMetadata = {
 *   anthropic: { cache_control: { type: 'ephemeral' } },
 *   openrouter: { cache_control: { type: 'ephemeral', ttl: '1h' } }
 * };
 * ```
 */
export interface ToolMetadata {
  [provider: string]: Record<string, unknown> | undefined;
}

/**
 * Tool call requested by the model.
 *
 * Represents a single function call request from the LLM, including
 * the tool name and parsed arguments.
 *
 * @example
 * ```typescript
 * const toolCall: ToolCall = {
 *   toolCallId: 'call_abc123',
 *   toolName: 'get_weather',
 *   arguments: { location: 'San Francisco', units: 'celsius' }
 * };
 * ```
 */
export interface ToolCall {
  /** Unique identifier for this tool call, used to match results */
  toolCallId: string;

  /** Name of the tool being called */
  toolName: string;

  /** Parsed arguments for the tool call */
  arguments: Record<string, unknown>;
}

/**
 * Result of tool execution.
 *
 * Returned after executing a tool, containing the result data
 * and whether an error occurred.
 *
 * @example
 * ```typescript
 * const result: ToolResult = {
 *   toolCallId: 'call_abc123',
 *   result: { temperature: 72, conditions: 'sunny' }
 * };
 *
 * // Error result
 * const errorResult: ToolResult = {
 *   toolCallId: 'call_abc123',
 *   result: 'Location not found',
 *   isError: true
 * };
 * ```
 */
export interface ToolResult {
  /** The tool call ID this result corresponds to */
  toolCallId: string;

  /** The result data (can be any serializable value) */
  result: unknown;

  /** Whether the tool execution resulted in an error */
  isError?: boolean;
}

/**
 * Tool definition for LLM function calling.
 *
 * Defines a tool that can be called by the LLM, including its
 * name, description, parameter schema, and execution function.
 *
 * @typeParam TParams - The type of parameters the tool accepts
 * @typeParam TResult - The type of result the tool returns
 *
 * @example
 * ```typescript
 * const weatherTool: Tool<{ location: string }, WeatherData> = {
 *   name: 'get_weather',
 *   description: 'Get current weather for a location',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       location: { type: 'string', description: 'City name' }
 *     },
 *     required: ['location']
 *   },
 *   run: async (params) => {
 *     return fetchWeather(params.location);
 *   }
 * };
 * ```
 */
export interface Tool<TParams = unknown, TResult = unknown> {
  /** Tool name (must be unique within an llm() instance) */
  name: string;

  /** Human-readable description for the model to understand when to use this tool */
  description: string;

  /** JSON Schema defining the tool's parameters */
  parameters: JSONSchema;

  /**
   * Provider-specific metadata, namespaced by provider name.
   *
   * Used for provider-specific features like prompt caching:
   * @example
   * ```typescript
   * const tool: Tool = {
   *   name: 'search_docs',
   *   description: 'Search documentation',
   *   parameters: {...},
   *   run: async (params) => {...},
   *   metadata: {
   *     anthropic: { cache_control: { type: 'ephemeral' } }
   *   }
   * };
   * ```
   */
  metadata?: ToolMetadata;

  /**
   * Executes the tool with the provided parameters.
   *
   * @param params - The parameters passed by the model
   * @returns The tool result, synchronously or as a Promise
   */
  run(params: TParams): TResult | Promise<TResult>;

  /**
   * Optional approval handler for sensitive operations.
   *
   * If provided, this function is called before the tool executes.
   * Return false to prevent execution.
   *
   * @param params - The parameters the tool would be called with
   * @returns Whether to approve the execution
   */
  approval?(params: TParams): boolean | Promise<boolean>;
}

/**
 * Result from onBeforeCall hook indicating whether to proceed and optionally transformed params.
 */
export interface BeforeCallResult {
  /** Whether to proceed with tool execution */
  proceed: boolean;
  /** Transformed parameters to use instead of the original (optional) */
  params?: unknown;
}

/**
 * Result from onAfterCall hook optionally containing a transformed result.
 */
export interface AfterCallResult {
  /** Transformed result to use instead of the original */
  result: unknown;
}

/**
 * Strategy for controlling tool execution behavior.
 *
 * Provides hooks for monitoring, controlling, and transforming the tool execution
 * loop during LLM inference.
 *
 * @example
 * ```typescript
 * const strategy: ToolUseStrategy = {
 *   maxIterations: 5,
 *   onToolCall: (tool, params) => {
 *     console.log(`Calling ${tool.name} with`, params);
 *   },
 *   // Transform input parameters
 *   onBeforeCall: (tool, params) => {
 *     if (tool.name === 'search') {
 *       return { proceed: true, params: { ...params, limit: 10 } };
 *     }
 *     return true;
 *   },
 *   // Transform output results
 *   onAfterCall: (tool, params, result) => {
 *     if (tool.name === 'fetch_data') {
 *       return { result: sanitize(result) };
 *     }
 *   },
 *   onMaxIterations: (iterations) => {
 *     console.warn(`Reached max iterations: ${iterations}`);
 *   }
 * };
 * ```
 */
export interface ToolUseStrategy {
  /** Maximum number of tool execution rounds (default: 10) */
  maxIterations?: number;

  /**
   * Called when the model requests a tool call.
   *
   * @param tool - The tool being called
   * @param params - The parameters for the call
   */
  onToolCall?(tool: Tool, params: unknown): void | Promise<void>;

  /**
   * Called before tool execution. Can skip execution or transform parameters.
   *
   * @param tool - The tool about to be executed
   * @param params - The parameters for the call
   * @returns One of:
   *   - `false` to skip execution
   *   - `true` to proceed with original params
   *   - `BeforeCallResult` object to control execution and optionally transform params
   */
  onBeforeCall?(tool: Tool, params: unknown): boolean | BeforeCallResult | Promise<boolean | BeforeCallResult>;

  /**
   * Called after tool execution completes. Can transform the result.
   *
   * @param tool - The tool that was executed
   * @param params - The parameters that were used
   * @param result - The result from the tool
   * @returns Void to use original result, or `AfterCallResult` to transform it
   */
  onAfterCall?(tool: Tool, params: unknown, result: unknown): void | AfterCallResult | Promise<void | AfterCallResult>;

  /**
   * Called when a tool execution throws an error.
   *
   * @param tool - The tool that failed
   * @param params - The parameters that were used
   * @param error - The error that was thrown
   */
  onError?(tool: Tool, params: unknown, error: Error): void | Promise<void>;

  /**
   * Called when the maximum iteration limit is reached.
   *
   * @param iterations - The number of iterations that were performed
   */
  onMaxIterations?(iterations: number): void | Promise<void>;
}

/**
 * Record of a completed tool execution.
 *
 * Contains all information about a tool call that was executed,
 * including timing and result data.
 *
 * @example
 * ```typescript
 * const execution: ToolExecution = {
 *   toolName: 'get_weather',
 *   toolCallId: 'call_abc123',
 *   arguments: { location: 'San Francisco' },
 *   result: { temperature: 72 },
 *   isError: false,
 *   duration: 150,
 *   approved: true
 * };
 * ```
 */
export interface ToolExecution {
  /** Name of the tool that was called */
  toolName: string;

  /** Unique identifier for this tool call */
  toolCallId: string;

  /** Arguments that were passed to the tool */
  arguments: Record<string, unknown>;

  /** Result returned by the tool */
  result: unknown;

  /** Whether the tool execution resulted in an error */
  isError: boolean;

  /** Execution duration in milliseconds */
  duration: number;

  /** Whether approval was required and granted (undefined if no approval handler) */
  approved?: boolean;
}
