import type { JSONSchema } from './schema.ts';

/**
 * Tool call requested by the model
 */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Result of tool execution
 */
export interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

/**
 * Tool definition
 */
export interface Tool<TParams = unknown, TResult = unknown> {
  /** Tool name (must be unique within a llm() instance) */
  name: string;

  /** Human-readable description for the model */
  description: string;

  /** JSON Schema defining parameters */
  parameters: JSONSchema;

  /** Tool execution function */
  run(params: TParams): TResult | Promise<TResult>;

  /** Optional approval handler for sensitive operations */
  approval?(params: TParams): boolean | Promise<boolean>;
}

/**
 * Strategy for tool execution
 */
export interface ToolUseStrategy {
  /** Maximum tool execution rounds (default: 10) */
  maxIterations?: number;

  /** Called when the model requests a tool call */
  onToolCall?(tool: Tool, params: unknown): void | Promise<void>;

  /** Called before tool execution, return false to skip */
  onBeforeCall?(tool: Tool, params: unknown): boolean | Promise<boolean>;

  /** Called after tool execution */
  onAfterCall?(tool: Tool, params: unknown, result: unknown): void | Promise<void>;

  /** Called on tool execution error */
  onError?(tool: Tool, params: unknown, error: Error): void | Promise<void>;

  /** Called when max iterations reached */
  onMaxIterations?(iterations: number): void | Promise<void>;
}

/**
 * Record of a tool execution
 */
export interface ToolExecution {
  /** The tool that was called */
  toolName: string;

  /** Tool call ID */
  toolCallId: string;

  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;

  /** Result returned by the tool */
  result: unknown;

  /** Whether the tool execution resulted in an error */
  isError: boolean;

  /** Execution duration in milliseconds */
  duration: number;

  /** Whether approval was required and granted */
  approved?: boolean;
}
