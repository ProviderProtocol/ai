/**
 * @fileoverview Serialization utilities for proxy transport.
 *
 * Handles converting PP types to/from JSON for HTTP transport.
 * These are pure functions with no side effects.
 *
 * @module providers/proxy/serialization
 */

import {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  type Message,
  type MessageJSON,
} from '../../types/messages.ts';
import type { UserContent, AssistantContent } from '../../types/content.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { Turn, TurnJSON } from '../../types/turn.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import {
  serializeStreamEvent as serializeStreamEventShared,
  deserializeStreamEvent as deserializeStreamEventShared,
} from '../../stream/serialization.ts';

/**
 * Convert a Message to MessageJSON format.
 */
export function serializeMessage(m: Message): MessageJSON {
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
 * Reconstruct a Message from MessageJSON format.
 */
export function deserializeMessage(json: MessageJSON): Message {
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
      throw new UPPError(
        `Unknown message type: ${json.type}`,
        ErrorCode.InvalidResponse,
        'proxy',
        ModalityType.LLM
      );
  }
}

/**
 * Serialize a Turn to JSON-transportable format.
 */
export function serializeTurn(turn: Turn): TurnJSON {
  return {
    messages: turn.messages.map(serializeMessage),
    toolExecutions: turn.toolExecutions,
    usage: turn.usage,
    cycles: turn.cycles,
    data: turn.data,
  };
}

/**
 * Serialize a StreamEvent for JSON transport.
 * Converts Uint8Array data to base64 string.
 */
export function serializeStreamEvent(event: StreamEvent): StreamEvent {
  return serializeStreamEventShared(event);
}

/**
 * Deserialize a StreamEvent from JSON transport.
 * Converts base64 string data back to Uint8Array.
 */
export function deserializeStreamEvent(event: StreamEvent): StreamEvent {
  return deserializeStreamEventShared(event);
}
