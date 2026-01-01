import { generateId } from '../utils/id.ts';
import type {
  ContentBlock,
  TextBlock,
  ImageBlock,
  AudioBlock,
  VideoBlock,
  UserContent,
  AssistantContent,
} from './content.ts';
import type { ToolCall, ToolResult } from './tool.ts';

/**
 * Message type discriminator
 */
export type MessageType = 'user' | 'assistant' | 'tool_result';

/**
 * Provider-namespaced metadata
 * Each provider uses its own namespace
 */
export interface MessageMetadata {
  [provider: string]: Record<string, unknown> | undefined;
}

/**
 * Options for message construction
 */
export interface MessageOptions {
  id?: string;
  metadata?: MessageMetadata;
}

/**
 * Base message class
 * All messages inherit from this
 */
export abstract class Message {
  /** Unique message identifier */
  readonly id: string;

  /** Timestamp */
  readonly timestamp: Date;

  /** Provider-specific metadata, namespaced by provider */
  readonly metadata?: MessageMetadata;

  /** Message type discriminator */
  abstract readonly type: MessageType;

  /** Raw content - implemented by subclasses */
  protected abstract getContent(): ContentBlock[];

  constructor(options?: MessageOptions) {
    this.id = options?.id ?? generateId();
    this.timestamp = new Date();
    this.metadata = options?.metadata;
  }

  /**
   * Convenience accessor for text content
   * Concatenates all text blocks with '\n\n'
   */
  get text(): string {
    return this.getContent()
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
  }

  /**
   * Convenience accessor for image content blocks
   */
  get images(): ImageBlock[] {
    return this.getContent().filter((block): block is ImageBlock => block.type === 'image');
  }

  /**
   * Convenience accessor for audio content blocks
   */
  get audio(): AudioBlock[] {
    return this.getContent().filter((block): block is AudioBlock => block.type === 'audio');
  }

  /**
   * Convenience accessor for video content blocks
   */
  get video(): VideoBlock[] {
    return this.getContent().filter((block): block is VideoBlock => block.type === 'video');
  }
}

/**
 * User input message
 */
export class UserMessage extends Message {
  readonly type = 'user' as const;
  readonly content: UserContent[];

  /**
   * @param content - String (converted to TextBlock) or array of content blocks
   */
  constructor(content: string | UserContent[], options?: MessageOptions) {
    super(options);
    if (typeof content === 'string') {
      this.content = [{ type: 'text', text: content }];
    } else {
      this.content = content;
    }
  }

  protected getContent(): ContentBlock[] {
    return this.content;
  }
}

/**
 * Assistant response message
 * May contain text, media, and/or tool calls
 */
export class AssistantMessage extends Message {
  readonly type = 'assistant' as const;
  readonly content: AssistantContent[];

  /** Tool calls requested by the model (if any) */
  readonly toolCalls?: ToolCall[];

  /**
   * @param content - String (converted to TextBlock) or array of content blocks
   * @param toolCalls - Tool calls requested by the model
   * @param options - Message ID and metadata
   */
  constructor(
    content: string | AssistantContent[],
    toolCalls?: ToolCall[],
    options?: MessageOptions
  ) {
    super(options);
    if (typeof content === 'string') {
      this.content = [{ type: 'text', text: content }];
    } else {
      this.content = content;
    }
    this.toolCalls = toolCalls;
  }

  protected getContent(): ContentBlock[] {
    return this.content;
  }

  /** Check if this message requests tool execution */
  get hasToolCalls(): boolean {
    return this.toolCalls !== undefined && this.toolCalls.length > 0;
  }
}

/**
 * Result of tool execution (sent back to model)
 */
export class ToolResultMessage extends Message {
  readonly type = 'tool_result' as const;
  readonly results: ToolResult[];

  /**
   * @param results - Array of tool execution results
   * @param options - Message ID and metadata
   */
  constructor(results: ToolResult[], options?: MessageOptions) {
    super(options);
    this.results = results;
  }

  protected getContent(): ContentBlock[] {
    // Tool results don't have traditional content blocks
    // Return text representations of results
    return this.results.map((result) => ({
      type: 'text' as const,
      text:
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result),
    }));
  }
}

/**
 * Type guard for UserMessage
 */
export function isUserMessage(msg: Message): msg is UserMessage {
  return msg.type === 'user';
}

/**
 * Type guard for AssistantMessage
 */
export function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.type === 'assistant';
}

/**
 * Type guard for ToolResultMessage
 */
export function isToolResultMessage(msg: Message): msg is ToolResultMessage {
  return msg.type === 'tool_result';
}
