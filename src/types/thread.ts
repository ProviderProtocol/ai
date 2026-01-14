/**
 * @fileoverview Thread class for managing conversation history.
 *
 * Provides a utility class for building and manipulating conversation
 * message sequences, with support for serialization and deserialization.
 *
 * @module types/thread
 */

import { generateId } from '../utils/id.ts';
import {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  type MessageJSON,
  type MessageType,
} from './messages.ts';
import type { UserContent, AssistantContent } from './content.ts';
import type { Turn } from './turn.ts';

/**
 * Thread serialized to JSON format.
 * Picks id from Thread, converts dates to strings.
 */
export type ThreadJSON = Pick<Thread, 'id'> & {
  messages: MessageJSON[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Thread - A utility class for managing conversation history.
 *
 * Provides methods for building, manipulating, and persisting
 * conversation message sequences. This class is optional; users
 * can also manage their own `Message[]` arrays directly.
 *
 * @example
 * ```typescript
 * // Create a new thread and add messages
 * const thread = new Thread();
 * thread.user('Hello!');
 * thread.assistant('Hi there! How can I help?');
 *
 * // Use with LLM inference
 * const turn = await instance.generate(thread, 'What is 2+2?');
 * thread.append(turn);
 *
 * // Serialize for storage
 * const json = thread.toJSON();
 * localStorage.setItem('chat', JSON.stringify(json));
 *
 * // Restore from storage
 * const restored = Thread.fromJSON(JSON.parse(localStorage.getItem('chat')));
 * ```
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
   * Creates a new thread instance.
   *
   * @param messages - Optional initial messages to populate the thread
   */
  constructor(messages?: Message[]) {
    this.id = generateId();
    this._messages = messages ? [...messages] : [];
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  /**
   * All messages in the thread (readonly).
   */
  get messages(): readonly Message[] {
    return this._messages;
  }

  /**
   * Number of messages in the thread.
   */
  get length(): number {
    return this._messages.length;
  }

  /**
   * Appends all messages from a Turn to the thread.
   *
   * @param turn - The Turn containing messages to append
   * @returns This thread instance for chaining
   */
  append(turn: Turn): this {
    this._messages.push(...turn.messages);
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Adds raw messages to the thread.
   *
   * @param messages - Messages to add
   * @returns This thread instance for chaining
   */
  push(...messages: Message[]): this {
    this._messages.push(...messages);
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Adds a user message to the thread.
   *
   * @param content - String or array of content blocks
   * @returns This thread instance for chaining
   *
   * @example
   * ```typescript
   * thread.user('Hello, world!');
   * thread.user([
   *   { type: 'text', text: 'Describe this image:' },
   *   { type: 'image', source: { type: 'url', url: '...' }, mimeType: 'image/png' }
   * ]);
   * ```
   */
  user(content: string | UserContent[]): this {
    this._messages.push(new UserMessage(content));
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Adds an assistant message to the thread.
   *
   * @param content - String or array of content blocks
   * @returns This thread instance for chaining
   *
   * @example
   * ```typescript
   * thread.assistant('I can help with that!');
   * ```
   */
  assistant(content: string | AssistantContent[]): this {
    this._messages.push(new AssistantMessage(content));
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Filters messages by type.
   *
   * @param type - The message type to filter by
   * @returns Array of messages matching the type
   *
   * @example
   * ```typescript
   * const userMessages = thread.filter('user');
   * const assistantMessages = thread.filter('assistant');
   * ```
   */
  filter(type: MessageType): Message[] {
    return this._messages.filter((m) => m.type === type);
  }

  /**
   * Returns the last N messages from the thread.
   *
   * @param count - Number of messages to return
   * @returns Array of the last N messages
   *
   * @example
   * ```typescript
   * const recent = thread.tail(5);
   * ```
   */
  tail(count: number): Message[] {
    return this._messages.slice(-count);
  }

  /**
   * Creates a new thread with a subset of messages.
   *
   * @param start - Start index (inclusive)
   * @param end - End index (exclusive)
   * @returns New Thread containing the sliced messages
   *
   * @example
   * ```typescript
   * const subset = thread.slice(0, 10);
   * ```
   */
  slice(start?: number, end?: number): Thread {
    return new Thread(this._messages.slice(start, end));
  }

  /**
   * Removes all messages from the thread.
   *
   * @returns This thread instance for chaining
   */
  clear(): this {
    this._messages = [];
    this._updatedAt = new Date();
    return this;
  }

  /**
   * Converts the thread to a plain message array.
   *
   * @returns Copy of the internal message array
   */
  toMessages(): Message[] {
    return [...this._messages];
  }

  /**
   * Serializes the thread to JSON format.
   *
   * @returns JSON-serializable representation of the thread
   *
   * @example
   * ```typescript
   * const json = thread.toJSON();
   * localStorage.setItem('thread', JSON.stringify(json));
   * ```
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
   * Deserializes a thread from JSON format.
   *
   * @param json - The JSON representation to deserialize
   * @returns Reconstructed Thread instance
   *
   * @example
   * ```typescript
   * const json = JSON.parse(localStorage.getItem('thread'));
   * const thread = Thread.fromJSON(json);
   * ```
   */
  static fromJSON(json: ThreadJSON): Thread {
    const messages = json.messages.map((m) => Thread.messageFromJSON(m));
    const thread = new Thread(messages);
    (thread as { id: string }).id = json.id;
    thread._createdAt = new Date(json.createdAt);
    thread._updatedAt = new Date(json.updatedAt);
    return thread;
  }

  /**
   * Enables iteration over messages with for...of loops.
   *
   * @returns Iterator over the thread's messages
   *
   * @example
   * ```typescript
   * for (const message of thread) {
   *   console.log(message.text);
   * }
   * ```
   */
  [Symbol.iterator](): Iterator<Message> {
    return this._messages[Symbol.iterator]();
  }

  /**
   * Converts a message to JSON format.
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
   * Reconstructs a message from JSON format.
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
