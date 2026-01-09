/**
 * @fileoverview Message types for conversation history.
 *
 * Defines the message classes used to represent conversation turns
 * between users and assistants, including support for multimodal
 * content and tool calls.
 *
 * @module types/messages
 */

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
 * Message serialized to JSON format.
 * Picks common fields from Message, converts timestamp to string.
 */
export type MessageJSON = Pick<Message, 'id' | 'type' | 'metadata'> & {
  timestamp: string;
  content: ContentBlock[];
  toolCalls?: ToolCall[];
  results?: ToolResult[];
};

/**
 * Message type discriminator.
 *
 * Used to distinguish between different message types in a conversation.
 */
export type MessageType = 'user' | 'assistant' | 'tool_result';

/**
 * Provider-namespaced metadata for messages.
 *
 * Each provider can attach its own metadata under its namespace,
 * preventing conflicts between different providers.
 *
 * @example
 * ```typescript
 * const metadata: MessageMetadata = {
 *   openai: { model: 'gpt-4', finishReason: 'stop' },
 *   anthropic: { model: 'claude-3', stopReason: 'end_turn' }
 * };
 * ```
 */
export interface MessageMetadata {
  [provider: string]: Record<string, unknown> | undefined;
}

/**
 * Options for constructing messages.
 */
export interface MessageOptions {
  /** Custom message ID (auto-generated if not provided) */
  id?: string;

  /** Provider-specific metadata */
  metadata?: MessageMetadata;
}

/**
 * Abstract base class for all message types.
 *
 * Provides common functionality for user, assistant, and tool result
 * messages, including content accessors and metadata handling.
 *
 * @example
 * ```typescript
 * // Access text content from any message
 * const text = message.text;
 *
 * // Access images
 * const images = message.images;
 * ```
 */
export abstract class Message {
  /** Unique message identifier */
  readonly id: string;

  /** Timestamp when the message was created */
  readonly timestamp: Date;

  /** Provider-specific metadata, namespaced by provider name */
  readonly metadata?: MessageMetadata;

  /** Message type discriminator (implemented by subclasses) */
  abstract readonly type: MessageType;

  /**
   * Returns the content blocks for this message.
   * Implemented by subclasses to provide type-specific content.
   */
  protected abstract getContent(): ContentBlock[];

  /**
   * Creates a new message instance.
   *
   * @param options - Optional message ID and metadata
   */
  constructor(options?: MessageOptions) {
    this.id = options?.id ?? generateId();
    this.timestamp = new Date();
    this.metadata = options?.metadata;
  }

  /**
   * Concatenated text content from all text blocks.
   * Blocks are joined with double newlines.
   */
  get text(): string {
    return this.getContent()
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
  }

  /**
   * All image content blocks in this message.
   */
  get images(): ImageBlock[] {
    return this.getContent().filter((block): block is ImageBlock => block.type === 'image');
  }

  /**
   * All audio content blocks in this message.
   */
  get audio(): AudioBlock[] {
    return this.getContent().filter((block): block is AudioBlock => block.type === 'audio');
  }

  /**
   * All video content blocks in this message.
   */
  get video(): VideoBlock[] {
    return this.getContent().filter((block): block is VideoBlock => block.type === 'video');
  }
}

/**
 * User input message.
 *
 * Represents a message from the user, which can contain text and/or
 * multimodal content like images, audio, or video.
 *
 * @example
 * ```typescript
 * // Simple text message
 * const msg = new UserMessage('Hello, world!');
 *
 * // Multimodal message
 * const msg = new UserMessage([
 *   { type: 'text', text: 'What is in this image?' },
 *   { type: 'image', source: { type: 'url', url: '...' }, mimeType: 'image/png' }
 * ]);
 * ```
 */
export class UserMessage extends Message {
  /** Message type discriminator */
  readonly type = 'user' as const;

  /** Content blocks in this message */
  readonly content: UserContent[];

  /**
   * Creates a new user message.
   *
   * @param content - String (converted to TextBlock) or array of content blocks
   * @param options - Optional message ID and metadata
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
 * Assistant response message.
 *
 * Represents a response from the AI assistant, which may contain
 * text, media content, and/or tool call requests.
 *
 * @example
 * ```typescript
 * // Simple text response
 * const msg = new AssistantMessage('Hello! How can I help?');
 *
 * // Response with tool calls
 * const msg = new AssistantMessage(
 *   'Let me check the weather...',
 *   [{ toolCallId: 'call_1', toolName: 'get_weather', arguments: { location: 'NYC' } }]
 * );
 * ```
 */
export class AssistantMessage extends Message {
  /** Message type discriminator */
  readonly type = 'assistant' as const;

  /** Content blocks in this message */
  readonly content: AssistantContent[];

  /** Tool calls requested by the model (if any) */
  readonly toolCalls?: ToolCall[];

  /**
   * Creates a new assistant message.
   *
   * @param content - String (converted to TextBlock) or array of content blocks
   * @param toolCalls - Tool calls requested by the model
   * @param options - Optional message ID and metadata
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

  /**
   * Whether this message contains tool call requests.
   */
  get hasToolCalls(): boolean {
    return this.toolCalls !== undefined && this.toolCalls.length > 0;
  }
}

/**
 * Tool execution result message.
 *
 * Contains the results of executing one or more tool calls,
 * sent back to the model for further processing.
 *
 * @example
 * ```typescript
 * const msg = new ToolResultMessage([
 *   { toolCallId: 'call_1', result: { temperature: 72, conditions: 'sunny' } },
 *   { toolCallId: 'call_2', result: 'File not found', isError: true }
 * ]);
 * ```
 */
export class ToolResultMessage extends Message {
  /** Message type discriminator */
  readonly type = 'tool_result' as const;

  /** Results from tool executions */
  readonly results: ToolResult[];

  /**
   * Creates a new tool result message.
   *
   * @param results - Array of tool execution results
   * @param options - Optional message ID and metadata
   */
  constructor(results: ToolResult[], options?: MessageOptions) {
    super(options);
    this.results = results;
  }

  protected getContent(): ContentBlock[] {
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
 * Type guard for UserMessage.
 *
 * @param msg - The message to check
 * @returns True if the message is a UserMessage
 *
 * @example
 * ```typescript
 * if (isUserMessage(msg)) {
 *   console.log('User said:', msg.text);
 * }
 * ```
 */
export function isUserMessage(msg: Message): msg is UserMessage {
  return msg.type === 'user';
}

/**
 * Type guard for AssistantMessage.
 *
 * @param msg - The message to check
 * @returns True if the message is an AssistantMessage
 *
 * @example
 * ```typescript
 * if (isAssistantMessage(msg)) {
 *   console.log('Assistant said:', msg.text);
 *   if (msg.hasToolCalls) {
 *     console.log('Tool calls:', msg.toolCalls);
 *   }
 * }
 * ```
 */
export function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.type === 'assistant';
}

/**
 * Type guard for ToolResultMessage.
 *
 * @param msg - The message to check
 * @returns True if the message is a ToolResultMessage
 *
 * @example
 * ```typescript
 * if (isToolResultMessage(msg)) {
 *   for (const result of msg.results) {
 *     console.log(`Tool ${result.toolCallId}:`, result.result);
 *   }
 * }
 * ```
 */
export function isToolResultMessage(msg: Message): msg is ToolResultMessage {
  return msg.type === 'tool_result';
}
