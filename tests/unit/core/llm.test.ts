/**
 * @fileoverview Unit tests for the LLM core module.
 *
 * Tests cover LLM instance creation, header merging, and configuration handling.
 */
import { test, expect, describe } from 'bun:test';
import { llm } from '../../../src/core/llm.ts';
import { createProvider } from '../../../src/core/provider.ts';
import { UPPError } from '../../../src/types/errors.ts';
import type { LLMHandler, LLMRequest, LLMResponse, LLMCapabilities } from '../../../src/types/llm.ts';
import type { TokenUsage } from '../../../src/types/turn.ts';
import type { Tool, ToolCall } from '../../../src/types/tool.ts';
import { AssistantMessage, UserMessage } from '../../../src/types/messages.ts';
import { Thread } from '../../../src/types/thread.ts';
import type { StreamEvent } from '../../../src/types/stream.ts';
import { textDelta } from '../../../src/types/stream.ts';
import type { LLMProvider } from '../../../src/types/provider.ts';
import type { ImageBlock } from '../../../src/types/content.ts';

type MockParams = { temperature?: number };

const defaultUsage = (inputTokens: number, outputTokens: number): TokenUsage => ({
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

function createResponse(message: AssistantMessage, usage: TokenUsage, data?: unknown): LLMResponse {
  return {
    message,
    usage,
    stopReason: 'stop',
    ...(data !== undefined ? { data } : {}),
  };
}

function createMockLLMHandler(options: {
  responses: LLMResponse[];
  streamResponses?: LLMResponse[];
  streamEvents?: StreamEvent[][];
  onRequest?: (request: LLMRequest<MockParams>) => void;
  capabilities?: Partial<LLMCapabilities>;
}): LLMHandler<MockParams> {
  let providerRef: LLMProvider<MockParams> | null = null;
  let completeIndex = 0;
  let streamIndex = 0;

  const capabilities: LLMCapabilities = {
    streaming: true,
    tools: true,
    structuredOutput: true,
    imageInput: false,
    videoInput: false,
    audioInput: false,
    ...options.capabilities,
  };

  return {
    _setProvider(provider: LLMProvider<MockParams>) {
      providerRef = provider;
    },
    bind(modelId: string) {
      if (!providerRef) {
        throw new Error('Provider reference not set for mock handler');
      }

      return {
        modelId,
        capabilities,
        get provider() {
          return providerRef!;
        },
        async complete(request: LLMRequest<MockParams>): Promise<LLMResponse> {
          options.onRequest?.(request);
          const response = options.responses[Math.min(completeIndex, options.responses.length - 1)]!;
          completeIndex += 1;
          return response;
        },
        stream(request: LLMRequest<MockParams>) {
          options.onRequest?.(request);
          const streamResponses = options.streamResponses ?? options.responses;
          const response = streamResponses[Math.min(streamIndex, streamResponses.length - 1)]!;
          const events = options.streamEvents?.[streamIndex] ?? [];
          streamIndex += 1;

          return {
            async *[Symbol.asyncIterator]() {
              for (const event of events) {
                yield event;
              }
            },
            response: Promise.resolve(response),
          };
        },
      };
    },
  };
}

// ============================================
// Anthropic Betas Integration Tests
// ============================================

describe('Anthropic Betas Integration with LLM', () => {
  test('anthropic model with betas creates correct llm instance', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });

    const instance = llm({
      model: modelRef,
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model with betas and explicit headers merges correctly', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });

    const instance = llm({
      model: modelRef,
      config: {
        headers: {
          'x-custom-header': 'test-value',
        },
      },
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model beta header can be overridden by explicit config', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });

    // User can override the beta header if needed
    const instance = llm({
      model: modelRef,
      config: {
        headers: {
          'anthropic-beta': 'different-beta-2025-01-01',
        },
      },
    });

    expect(instance).toBeDefined();
  });

  test('anthropic model with multiple betas works with llm', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs, betas.tokenEfficientTools, betas.codeExecution],
    });

    const instance = llm({
      model: modelRef,
      system: 'You are a helpful assistant.',
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model without betas still creates valid llm instance', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');

    const instance = llm({
      model: modelRef,
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model with empty betas still creates valid llm instance', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', { betas: [] });

    const instance = llm({
      model: modelRef,
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });
});

// ============================================
// LLM Instance Configuration Tests
// ============================================

describe('LLM Instance Configuration', () => {
  test('llm instance has generate and stream methods', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({ model: modelRef });

    expect(typeof instance.generate).toBe('function');
    expect(typeof instance.stream).toBe('function');
  });

  test('llm instance exposes model property', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({ model: modelRef });

    expect(instance.model).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
    expect(instance.model.capabilities).toBeDefined();
  });

  test('llm instance with system prompt is configured correctly', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({
      model: modelRef,
      system: 'You are a helpful assistant.',
    });

    expect(instance).toBeDefined();
  });

  test('llm instance with params is configured correctly', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({
      model: modelRef,
      params: {
        temperature: 0.7,
        max_tokens: 1024,
      },
    });

    expect(instance).toBeDefined();
  });
});

// ============================================
// Error Handling Tests
// ============================================

describe('LLM Error Handling', () => {
  test('throws error when provider does not support LLM modality', () => {
    const mockProvider = createProvider({
      name: 'no-llm-provider',
      version: '1.0.0',
      handlers: {},
    });
    const modelRef = mockProvider('test-model');

    expect(() => llm({ model: modelRef })).toThrow(UPPError);
    expect(() => llm({ model: modelRef })).toThrow("does not support LLM modality");
  });
});

// ============================================
// LLM Core Execution Tests
// ============================================

describe('LLM generate execution', () => {
  test('executes tool loop and aggregates usage', async () => {
    const toolCall: ToolCall = {
      toolCallId: 'call-1',
      toolName: 'echo',
      arguments: { message: 'hello' },
    };

    const usage1 = defaultUsage(5, 3);
    const usage2 = defaultUsage(4, 2);

    const handler = createMockLLMHandler({
      responses: [
        createResponse(new AssistantMessage('Use tool', [toolCall]), usage1),
        createResponse(new AssistantMessage('Final response'), usage2),
      ],
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const echoTool: Tool<{ message: string }, string> = {
      name: 'echo',
      description: 'Echo input',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      run: async (params) => `echo:${params.message}`,
    };

    const instance = llm<MockParams>({
      model: provider('mock-model'),
      tools: [echoTool],
    });

    const turn = await instance.generate('Hello');

    expect(turn.cycles).toBe(2);
    expect(turn.toolExecutions).toHaveLength(1);
    expect(turn.toolExecutions[0]!.result).toBe('echo:hello');
    expect(turn.response.text).toContain('Final response');
    expect(turn.messages.some((message) => message.type === 'tool_result')).toBe(true);
    expect(turn.usage.totalTokens).toBe(usage1.totalTokens + usage2.totalTokens);
  });

  test('returns structured data when provided by handler', async () => {
    const handler = createMockLLMHandler({
      responses: [
        createResponse(
          new AssistantMessage('Structured response'),
          defaultUsage(3, 2),
          { answer: 'ok' }
        ),
      ],
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const instance = llm<MockParams>({
      model: provider('mock-model'),
      structure: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    });

    const turn = await instance.generate('Return structured data');

    expect(turn.data).toEqual({ answer: 'ok' });
  });

  test('throws when max tool iterations exceeded', async () => {
    let onMaxIterationsCalled = false;

    const toolCall: ToolCall = {
      toolCallId: 'call-1',
      toolName: 'echo',
      arguments: { message: 'loop' },
    };

    const handler = createMockLLMHandler({
      responses: [createResponse(new AssistantMessage('Again', [toolCall]), defaultUsage(1, 1))],
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const echoTool: Tool<{ message: string }, string> = {
      name: 'echo',
      description: 'Echo input',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      run: async (params) => `echo:${params.message}`,
    };

    const instance = llm<MockParams>({
      model: provider('mock-model'),
      tools: [echoTool],
      toolStrategy: {
        maxIterations: 1,
        onMaxIterations: async () => {
          onMaxIterationsCalled = true;
        },
      },
    });

    try {
      await instance.generate('Trigger loop');
      throw new Error('Expected max iteration error');
    } catch (error) {
      expect(onMaxIterationsCalled).toBe(true);
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('INVALID_REQUEST');
      }
    }
  });

  test('parses Thread and Message[] history inputs', async () => {
    const requests: LLMRequest<MockParams>[] = [];
    const handler = createMockLLMHandler({
      responses: [createResponse(new AssistantMessage('ok'), defaultUsage(1, 1))],
      onRequest: (request) => requests.push(request),
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const instance = llm<MockParams>({ model: provider('mock-model') });

    const thread = new Thread();
    thread.user('History message');

    await instance.generate(thread, 'New message');

    expect(requests[0]?.messages.length).toBeGreaterThanOrEqual(2);
    expect(requests[0]?.messages[0]).toBe(thread.messages[0]);
    expect(requests[0]?.messages[1]).toBeInstanceOf(UserMessage);

    requests.length = 0;
    const history = [new UserMessage('Array history')];
    await instance.generate(history, 'Another message');

    expect(requests[0]?.messages.length).toBeGreaterThanOrEqual(2);
    expect(requests[0]?.messages[0]).toBe(history[0]);
  });

  test('rejects unsupported media inputs', async () => {
    const handler = createMockLLMHandler({
      responses: [createResponse(new AssistantMessage('ok'), defaultUsage(1, 1))],
      capabilities: {
        imageInput: false,
      },
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const imageBlock: ImageBlock = {
      type: 'image',
      source: { type: 'url', url: 'https://example.com/image.png' },
      mimeType: 'image/png',
    };

    const instance = llm<MockParams>({ model: provider('mock-model') });

    await expect(instance.generate(new UserMessage([imageBlock]))).rejects.toThrow(UPPError);
  });

  test('propagates provider errors from complete()', async () => {
    let providerRef: LLMProvider<MockParams> | null = null;
    const handler: LLMHandler<MockParams> = {
      _setProvider(provider) {
        providerRef = provider;
      },
      bind(modelId: string) {
        return {
          modelId,
          capabilities: {
            streaming: true,
            tools: true,
            structuredOutput: true,
            imageInput: false,
            videoInput: false,
            audioInput: false,
          },
          get provider() {
            return providerRef!;
          },
          async complete() {
            throw new Error('boom');
          },
          stream() {
            throw new Error('boom');
          },
        };
      },
    };

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const instance = llm<MockParams>({ model: provider('mock-model') });

    try {
      await instance.generate('trigger error');
      throw new Error('Expected error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toBe('boom');
      }
    }
  });
});

describe('LLM stream execution', () => {
  test('streams events and executes tools', async () => {
    const toolCall: ToolCall = {
      toolCallId: 'call-stream',
      toolName: 'echo',
      arguments: { message: 'stream' },
    };

    const handler = createMockLLMHandler({
      responses: [
        createResponse(new AssistantMessage('Using tool', [toolCall]), defaultUsage(2, 1)),
        createResponse(new AssistantMessage('Done'), defaultUsage(2, 1)),
      ],
      streamEvents: [[textDelta('thinking')], [textDelta('done')]],
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const echoTool: Tool<{ message: string }, string> = {
      name: 'echo',
      description: 'Echo input',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      run: async (params) => `echo:${params.message}`,
    };

    const instance = llm<MockParams>({
      model: provider('mock-model'),
      tools: [echoTool],
    });

    const stream = instance.stream('Start');
    const events: StreamEvent[] = [];

    for await (const event of stream) {
      events.push(event);
    }

    const turn = await stream.turn;

    expect(events.some((event) => event.type === 'text_delta')).toBe(true);
    expect(events.some((event) => event.type === 'tool_execution_start')).toBe(true);
    expect(events.some((event) => event.type === 'tool_execution_end')).toBe(true);
    expect(turn.cycles).toBe(2);
    expect(turn.toolExecutions).toHaveLength(1);
  });

  test('aborts stream and rejects turn', async () => {
    let providerRef: LLMProvider<MockParams> | null = null;
    let capturedSignal: AbortSignal | undefined;

    const handler: LLMHandler<MockParams> = {
      _setProvider(provider) {
        providerRef = provider;
      },
      bind(modelId: string) {
        return {
          modelId,
          capabilities: {
            streaming: true,
            tools: false,
            structuredOutput: false,
            imageInput: false,
            videoInput: false,
            audioInput: false,
          },
          get provider() {
            return providerRef!;
          },
          async complete() {
            return createResponse(new AssistantMessage('done'), defaultUsage(1, 1));
          },
          stream(request: LLMRequest<MockParams>) {
            capturedSignal = request.signal;

            async function* iterator(): AsyncGenerator<StreamEvent, void, unknown> {
              yield textDelta('chunk');
              if (request.signal?.aborted) {
                throw new UPPError(
                  'LLM stream cancelled',
                  'CANCELLED',
                  providerRef?.name ?? 'mock-llm',
                  'llm'
                );
              }
            }

            return {
              [Symbol.asyncIterator]: iterator,
              response: Promise.resolve(
                createResponse(new AssistantMessage('done'), defaultUsage(1, 1))
              ),
            };
          },
        };
      },
    };

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const instance = llm<MockParams>({ model: provider('mock-model') });
    const stream = instance.stream('Hello');
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(first.value.type).toBe('text_delta');
    }

    expect(capturedSignal).toBeDefined();
    stream.abort();
    expect(capturedSignal?.aborted).toBe(true);

    try {
      await iterator.next();
      throw new Error('Expected stream to throw after abort');
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      if (error instanceof UPPError) {
        expect(error.code).toBe('CANCELLED');
        expect(error.modality).toBe('llm');
      }
    }

    await expect(stream.turn).rejects.toBeInstanceOf(UPPError);
  });

  test('early termination rejects turn and aborts request', async () => {
    let capturedSignal: AbortSignal | undefined;

    const handler = createMockLLMHandler({
      responses: [createResponse(new AssistantMessage('done'), defaultUsage(1, 1))],
      streamEvents: [[textDelta('partial'), textDelta('rest')]],
      onRequest: (request) => {
        capturedSignal = request.signal;
      },
    });

    const provider = createProvider<MockParams>({
      name: 'mock-llm',
      version: '1.0.0',
      handlers: { llm: handler },
    });

    const instance = llm<MockParams>({ model: provider('mock-model') });
    const stream = instance.stream('Start');

    for await (const event of stream) {
      expect(event.type).toBe('text_delta');
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
    await expect(stream.turn).rejects.toBeInstanceOf(UPPError);
  });
});
