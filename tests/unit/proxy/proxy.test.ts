import { test, expect, describe } from 'bun:test';
import {
  parseBody,
  toJSON,
  toError,
  bindTools,
  serializeMessage,
  deserializeMessage,
  serializeTurn,
} from '../../../src/proxy/index.ts';
import {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
} from '../../../src/types/messages.ts';
import { createTurn, emptyUsage } from '../../../src/types/turn.ts';

describe('Proxy Serialization Utilities', () => {
  describe('serializeMessage/deserializeMessage', () => {
    test('round trips UserMessage', () => {
      const original = new UserMessage('Hello, world!');
      const json = serializeMessage(original);
      const restored = deserializeMessage(json);

      expect(restored.type).toBe('user');
      expect(restored.text).toBe('Hello, world!');
      expect(restored.id).toBe(original.id);
    });

    test('round trips UserMessage with multimodal content', () => {
      const original = new UserMessage([
        { type: 'text', text: 'Check this out:' },
        {
          type: 'image',
          source: { type: 'url', url: 'https://example.com/image.png' },
          mimeType: 'image/png',
        },
      ]);
      const json = serializeMessage(original);
      const restored = deserializeMessage(json) as UserMessage;

      expect(restored.type).toBe('user');
      expect(restored.content).toHaveLength(2);
      expect(restored.content[0]?.type).toBe('text');
      expect(restored.content[1]?.type).toBe('image');
    });

    test('round trips AssistantMessage', () => {
      const original = new AssistantMessage('Hi there!');
      const json = serializeMessage(original);
      const restored = deserializeMessage(json);

      expect(restored.type).toBe('assistant');
      expect(restored.text).toBe('Hi there!');
    });

    test('round trips AssistantMessage with tool calls', () => {
      const original = new AssistantMessage(
        'Let me check the weather...',
        [
          {
            toolCallId: 'call_123',
            toolName: 'get_weather',
            arguments: { location: 'NYC' },
          },
        ]
      );
      const json = serializeMessage(original);
      const restored = deserializeMessage(json) as AssistantMessage;

      expect(restored.type).toBe('assistant');
      expect(restored.toolCalls).toHaveLength(1);
      expect(restored.toolCalls?.[0]?.toolName).toBe('get_weather');
    });

    test('round trips ToolResultMessage', () => {
      const original = new ToolResultMessage([
        { toolCallId: 'call_123', result: { temperature: 72 } },
        { toolCallId: 'call_456', result: 'Error', isError: true },
      ]);
      const json = serializeMessage(original);
      const restored = deserializeMessage(json) as ToolResultMessage;

      expect(restored.type).toBe('tool_result');
      expect(restored.results).toHaveLength(2);
      expect(restored.results[0]?.toolCallId).toBe('call_123');
      expect(restored.results[1]?.isError).toBe(true);
    });
  });

  describe('serializeTurn', () => {
    test('converts Turn to TurnJSON', () => {
      const turn = createTurn(
        [
          new UserMessage('Hello'),
          new AssistantMessage('Hi there!'),
        ],
        [],
        { inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 },
        1
      );

      const json = serializeTurn(turn);

      expect(json.messages).toHaveLength(2);
      expect(json.messages[0]?.type).toBe('user');
      expect(json.messages[1]?.type).toBe('assistant');
      expect(json.usage.totalTokens).toBe(15);
      expect(json.cycles).toBe(1);
    });

    test('includes tool executions', () => {
      const turn = createTurn(
        [new UserMessage('Q'), new AssistantMessage('A')],
        [
          {
            toolName: 'get_weather',
            toolCallId: 'call_1',
            arguments: { location: 'NYC' },
            result: { temp: 72 },
            isError: false,
            duration: 100,
          },
        ],
        emptyUsage(),
        2
      );

      const json = serializeTurn(turn);

      expect(json.toolExecutions).toHaveLength(1);
      expect(json.toolExecutions[0]?.toolName).toBe('get_weather');
    });

    test('includes structured data', () => {
      const turn = createTurn(
        [new UserMessage('Q'), new AssistantMessage('A')],
        [],
        emptyUsage(),
        1,
        { name: 'Test', value: 42 }
      );

      const json = serializeTurn(turn);

      expect(json.data).toEqual({ name: 'Test', value: 42 });
    });
  });
});

describe('Proxy Server Utilities', () => {
  describe('parseBody', () => {
    test('parses valid request', () => {
      const body = {
        messages: [
          {
            id: 'msg_1',
            type: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            timestamp: new Date().toISOString(),
          },
        ],
        system: 'You are a helpful assistant.',
        params: { temperature: 0.7 },
      };

      const parsed = parseBody(body);

      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0]?.type).toBe('user');
      expect(parsed.messages[0]?.text).toBe('Hello');
      expect(parsed.system).toBe('You are a helpful assistant.');
      expect(parsed.params?.temperature).toBe(0.7);
    });

    test('parses request with tools', () => {
      const body = {
        messages: [
          {
            id: 'msg_1',
            type: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            timestamp: new Date().toISOString(),
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        ],
      };

      const parsed = parseBody(body);

      expect(parsed.tools).toHaveLength(1);
      expect(parsed.tools?.[0]?.name).toBe('get_weather');
    });

    test('parses request with structure schema', () => {
      const body = {
        messages: [
          {
            id: 'msg_1',
            type: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            timestamp: new Date().toISOString(),
          },
        ],
        structure: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
      };

      const parsed = parseBody(body);

      expect(parsed.structure).toBeDefined();
      expect(parsed.structure?.type).toBe('object');
    });

    test('throws on invalid body', () => {
      expect(() => parseBody(null)).toThrow('Request body must be an object');
      expect(() => parseBody('string')).toThrow('Request body must be an object');
    });

    test('throws on missing messages', () => {
      expect(() => parseBody({ system: 'test' })).toThrow('Request body must have a messages array');
    });
  });

  describe('toJSON', () => {
    test('creates Response with serialized Turn', () => {
      const turn = createTurn(
        [
          new UserMessage('Hello'),
          new AssistantMessage('Hi!'),
        ],
        [],
        emptyUsage(),
        1
      );

      const response = toJSON(turn);

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('toError', () => {
    test('creates error Response with default status', () => {
      const response = toError('Something went wrong');

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('creates error Response with custom status', () => {
      const response = toError('Bad request', 400);

      expect(response.status).toBe(400);
    });
  });

  describe('bindTools', () => {
    test('binds implementations to tool schemas', () => {
      const schemas = [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object' as const, properties: {} },
        },
        {
          name: 'search',
          description: 'Search',
          parameters: { type: 'object' as const, properties: {} },
        },
      ];

      const implementations = {
        get_weather: () => ({ temp: 72 }),
        search: () => ({ results: [] }),
      };

      const tools = bindTools(schemas, implementations);

      expect(tools).toHaveLength(2);
      expect(tools[0]?.name).toBe('get_weather');
      expect(tools[0]?.run({})).toEqual({ temp: 72 });
    });

    test('throws on missing implementation', () => {
      const schemas = [
        {
          name: 'unknown_tool',
          description: 'Unknown',
          parameters: { type: 'object' as const, properties: {} },
        },
      ];

      expect(() => bindTools(schemas, {})).toThrow('No implementation for tool: unknown_tool');
    });

    test('returns empty array for undefined tools', () => {
      const tools = bindTools(undefined, {});
      expect(tools).toEqual([]);
    });
  });
});
