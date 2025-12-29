import { generateId } from '../utils/id.ts';
import {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
} from './messages.ts';
import type { MessageType, MessageMetadata } from './messages.ts';
import type { ContentBlock, UserContent, AssistantContent } from './content.ts';
import type { Turn } from './turn.ts';
import type { ToolCall, ToolResult } from './tool.ts';

/**
 * Serialized message format
 */
export interface MessageJSON {
  id: string;
  type: MessageType;
  content: ContentBlock[];
  toolCalls?: ToolCall[];
  results?: ToolResult[];
  metadata?: MessageMetadata;
  timestamp: string;
}

/**
 * Serialized thread format
 */
export interface ThreadJSON {
  id: string;
  messages: MessageJSON[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Thread - A utility class for managing conversation history
 * Users control their own history; Thread is optional
 */
export class Thread {
  /** Unique thread identifier */
  readonly id: string;

  /** Internal message storage */
  private _messages: Message[];

  /** Creation timestamp */
  private _createdAt: Date;

  /** Last update timestamp */
  private _updatedAt: Date;

  /**
   * Create a new thread, optionally with initial messages
   */
  constructor(messages?: Message[]) {
    this.id = generateId();
    this._messages = messages ? [...messages] : [];
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  /** All messages in the thread (readonly) */
  get messages(): readonly Message[] {
    return this._messages;
  }

  /** Number of messages */
  get length(): number {
    return this._messages.length;
  }

  /**
   * Append messages from a turn
   */
  append(turn: Turn): this {
    this._messages.push(...turn.messages);
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Add raw messages
   */
  push(...messages: Message[]): this {
    this._messages.push(...messages);
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Add a user message
   */
  user(content: string | UserContent[]): this {
    this._messages.push(new UserMessage(content));
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Add an assistant message
   */
  assistant(content: string | AssistantContent[]): this {
    this._messages.push(new AssistantMessage(content));
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Get messages by type
   */
  filter(type: MessageType): Message[] {
    return this._messages.filter((m) => m.type === type);
  }

  /**
   * Get the last N messages
   */
  tail(count: number): Message[] {
    return this._messages.slice(-count);
  }

  /**
   * Create a new thread with a subset of messages
   */
  slice(start?: number, end?: number): Thread {
    return new Thread(this._messages.slice(start, end));
  }

  /**
   * Clear all messages
   */
  clear(): this {
    this._messages = [];
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Convert to plain message array
   */
  toMessages(): Message[] {
    return [...this._messages];
  }

  /**
   * Serialize to JSON
   */
  toJSON(): ThreadJSON {
    return {
      id: this.id,
      messages: this._messages.map((m) => this.messageToJSON(m)),
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(json: ThreadJSON): Thread {
    const messages = json.messages.map((m) => Thread.messageFromJSON(m));
    const thread = new Thread(messages);
    // Override the generated id with the serialized one
    (thread as { id: string }).id = json.id;
    thread._createdAt = new Date(json.createdAt);
    thread._updatedAt = new Date(json.updatedAt);
    return thread;
  }

  /**
   * Iterate over messages
   */
  [Symbol.iterator](): Iterator<Message> {
    return this._messages[Symbol.iterator]();
  }

  /**
   * Convert a message to JSON
   */
  private messageToJSON(m: Message): MessageJSON {
    const base: MessageJSON = {
      id: m.id,
      type: m.type,
      content: [],
      metadata: m.metadata,
      timestamp: m.timestamp.toISOString(),
    };

    if (m instanceof UserMessage) {
      base.content = m.content;
    } else if (m instanceof AssistantMessage) {
      base.content = m.content;
      base.toolCalls = m.toolCalls;
    } else if (m instanceof ToolResultMessage) {
      base.results = m.results;
    }

    return base;
  }

  /**
   * Reconstruct a message from JSON
   */
  private static messageFromJSON(json: MessageJSON): Message {
    const options = {
      id: json.id,
      metadata: json.metadata,
    };

    switch (json.type) {
      case 'user':
        return new UserMessage(json.content as UserContent[], options);
      case 'assistant':
        return new AssistantMessage(
          json.content as AssistantContent[],
          json.toolCalls,
          options
        );
      case 'tool_result':
        return new ToolResultMessage(json.results ?? [], options);
      default:
        throw new Error(`Unknown message type: ${json.type}`);
    }
  }
}
