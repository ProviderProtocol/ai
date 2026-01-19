import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { openai } from '../../src/openai/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import { xai } from '../../src/xai/index.ts';
import { openrouter } from '../../src/openrouter/index.ts';
import { google } from '../../src/google/index.ts';
import { ollama } from '../../src/ollama/index.ts';
import type { OpenAICompletionsParams, OpenAIResponsesParams } from '../../src/openai/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import type { XAICompletionsParams, XAIResponsesParams, XAIMessagesParams } from '../../src/xai/index.ts';
import type { OpenRouterCompletionsParams, OpenRouterResponsesParams } from '../../src/openrouter/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import type { OllamaLLMParams } from '../../src/ollama/index.ts';
import { StreamEventType } from '../../src/types/stream.ts';

/**
 * Live API tests for partial JSON streaming across all providers.
 *
 * Tests two key features:
 * 1. Tool Call Streaming: ToolCallDelta events include `parsed` field with incrementally parsed arguments
 * 2. Structured Output Streaming: ObjectDelta events with `parsed` field for structured responses
 */

const multiplyTool = {
  name: 'multiply',
  description: 'Multiply two numbers together',
  parameters: {
    type: 'object' as const,
    properties: {
      a: { type: 'number' as const, description: 'First number' },
      b: { type: 'number' as const, description: 'Second number' },
    },
    required: ['a', 'b'],
  },
  run: async (params: { a: number; b: number }) => {
    return `The product is ${params.a * params.b}`;
  },
};

const cityStructure = {
  type: 'object' as const,
  properties: {
    city: { type: 'string' as const },
    country: { type: 'string' as const },
    population: { type: 'number' as const },
  },
  required: ['city', 'country', 'population'],
};

type CityData = { city: string; country: string; population: number };

// ============================================
// OpenAI Completions API
// ============================================
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Completions - Partial JSON Streaming', () => {
  test('tool call streaming includes parsed arguments', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-4.1-mini', { api: 'completions' }),
      params: { max_tokens: 200 },
      tools: [multiplyTool],
    });

    const stream = gpt.stream('What is 7 times 8? Use the multiply tool.');

    let sawToolCallDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        sawToolCallDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawToolCallDelta).toBe(true);
    expect(lastParsed).toBeDefined();
    expect(typeof lastParsed).toBe('object');
    expect(turn.response.text).toContain('56');
  });

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-4.1-mini', { api: 'completions' }),
      params: { max_tokens: 200 },
      structure: cityStructure,
    });

    const stream = gpt.stream('Tell me about Tokyo, Japan.');

    let sawObjectDelta = false;
    let lastParsed: unknown;
    let objectDeltaCount = 0;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        objectDeltaCount++;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(objectDeltaCount).toBeGreaterThan(0);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Tokyo');
    expect(data.country).toContain('Japan');
    expect(typeof data.population).toBe('number');
  });
});

// ============================================
// OpenAI Responses API
// ============================================
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Responses - Partial JSON Streaming', () => {
  test('tool call streaming includes parsed arguments', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-4.1-mini', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [multiplyTool],
    });

    const stream = gpt.stream('What is 9 times 6? Use the multiply tool.');

    let sawToolCallDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        sawToolCallDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawToolCallDelta).toBe(true);
    expect(lastParsed).toBeDefined();
    expect(turn.response.text).toContain('54');
  });

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-4.1-mini', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      structure: cityStructure,
    });

    const stream = gpt.stream('Tell me about Paris, France.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Paris');
  });
});

// ============================================
// Anthropic
// ============================================
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic - Partial JSON Streaming', () => {
  test('tool call streaming includes parsed arguments', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: { max_tokens: 200 },
      tools: [multiplyTool],
    });

    const stream = claude.stream('What is 5 times 12? Use the multiply tool.');

    let sawToolCallDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        sawToolCallDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawToolCallDelta).toBe(true);
    expect(lastParsed).toBeDefined();
    expect(turn.response.text).toContain('60');
  });

  // Note: Anthropic uses tool-based structured output (not native JSON mode),
  // so it emits ToolCallDelta for structured output, not ObjectDelta.
  // The `data` field is still populated correctly on the turn.
  test('structured output produces valid data on turn', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: { max_tokens: 200 },
      structure: cityStructure,
    });

    const turn = await claude.generate('Tell me about London, UK.');

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('London');
    expect(data.country).toBeDefined();
    expect(typeof data.population).toBe('number');
  });
});

// ============================================
// xAI Completions
// ============================================
describe.skipIf(!process.env.XAI_API_KEY)('xAI Completions - Partial JSON Streaming', () => {
  test('tool call streaming includes parsed arguments', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-3-mini-fast', { api: 'completions' }),
      params: { max_tokens: 200 },
      tools: [multiplyTool],
    });

    const stream = grok.stream('What is 4 times 11? Use the multiply tool.');

    let sawToolCallDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        sawToolCallDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawToolCallDelta).toBe(true);
    expect(lastParsed).toBeDefined();
    expect(turn.response.text).toContain('44');
  }, 30000);

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-3-mini-fast', { api: 'completions' }),
      params: { max_tokens: 200 },
      structure: cityStructure,
    });

    const stream = grok.stream('Tell me about Berlin, Germany.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Berlin');
  }, 30000);
});

// ============================================
// xAI Responses
// ============================================
describe.skipIf(!process.env.XAI_API_KEY)('xAI Responses - Partial JSON Streaming', () => {
  // Note: xAI Responses API may send complete tool calls rather than incremental deltas
  test('tool execution works correctly', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-3-mini-fast', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [multiplyTool],
    });

    const turn = await grok.generate('What is 8 times 9? Use the multiply tool.');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('72');
  }, 30000);

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const grok = llm<XAIResponsesParams>({
      model: xai('grok-3-mini-fast', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      structure: cityStructure,
    });

    const stream = grok.stream('Tell me about Sydney, Australia.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Sydney');
  }, 30000);
});

// ============================================
// xAI Messages (Anthropic-compatible)
// ============================================
describe.skipIf(!process.env.XAI_API_KEY)('xAI Messages - Partial JSON Streaming', () => {
  test('tool call streaming includes parsed arguments', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-3-mini-fast', { api: 'messages' }),
      params: { max_tokens: 200 },
      tools: [multiplyTool],
    });

    const stream = grok.stream('What is 6 times 6? Use the multiply tool.');

    let sawToolCallDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        sawToolCallDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawToolCallDelta).toBe(true);
    expect(lastParsed).toBeDefined();
    expect(turn.response.text).toContain('36');
  }, 30000);

  // Note: xAI Messages uses Anthropic-style tool-based structured output
  test('structured output produces valid data on turn', async () => {
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-3-mini-fast', { api: 'messages' }),
      params: { max_tokens: 200 },
      structure: cityStructure,
    });

    const turn = await grok.generate('Tell me about Rome, Italy.');

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Rome');
  }, 30000);
});

// ============================================
// OpenRouter Completions
// ============================================
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Completions - Partial JSON Streaming', () => {
  test('tool call streaming includes parsed arguments', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter('openai/gpt-4.1-mini', { api: 'completions' }),
      params: { max_tokens: 200 },
      tools: [multiplyTool],
    });

    const stream = model.stream('What is 3 times 15? Use the multiply tool.');

    let sawToolCallDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta) {
        sawToolCallDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawToolCallDelta).toBe(true);
    expect(lastParsed).toBeDefined();
    expect(turn.response.text).toContain('45');
  });

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter('openai/gpt-4.1-mini', { api: 'completions' }),
      params: { max_tokens: 200 },
      structure: cityStructure,
    });

    const stream = model.stream('Tell me about Madrid, Spain.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Madrid');
  });
});

// ============================================
// OpenRouter Responses
// ============================================
describe.skipIf(!process.env.OPENROUTER_API_KEY)('OpenRouter Responses - Partial JSON Streaming', () => {
  // Note: OpenRouter Responses API may send complete tool calls
  test('tool execution works correctly', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter('openai/gpt-4.1-mini', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      tools: [multiplyTool],
    });

    const turn = await model.generate('What is 12 times 12? Use the multiply tool.');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('144');
  });

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const model = llm<OpenRouterResponsesParams>({
      model: openrouter('openai/gpt-4.1-mini', { api: 'responses' }),
      params: { max_output_tokens: 200 },
      structure: cityStructure,
    });

    const stream = model.stream('Tell me about Amsterdam, Netherlands.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Amsterdam');
  });
});

// ============================================
// Google Gemini
// ============================================
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Gemini - Partial JSON Streaming', () => {
  // Note: Google sends complete tool calls, not incremental deltas
  // So we only test structured output ObjectDelta

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.0-flash'),
      params: { maxOutputTokens: 200 },
      structure: cityStructure,
    });

    const stream = gemini.stream('Tell me about Cairo, Egypt.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Cairo');
  });
});

// ============================================
// Ollama (requires local Ollama server at localhost:11434)
// ============================================
const OLLAMA_TEST_MODEL = process.env.OLLAMA_TEST_MODEL || 'gemma3:4b';

describe('Ollama - Partial JSON Streaming', () => {
  // Note: Ollama sends complete tool calls, not incremental deltas
  // So we only test structured output ObjectDelta

  test('structured output streaming emits ObjectDelta with parsed', async () => {
    const local = llm<OllamaLLMParams>({
      model: ollama(OLLAMA_TEST_MODEL),
      params: { num_predict: 200 },
      structure: cityStructure,
    });

    const stream = local.stream('Tell me about Mumbai, India.');

    let sawObjectDelta = false;
    let lastParsed: unknown;

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta) {
        sawObjectDelta = true;
        if (event.delta.parsed !== undefined) {
          lastParsed = event.delta.parsed;
        }
      }
    }

    const turn = await stream.turn;

    expect(sawObjectDelta).toBe(true);
    expect(lastParsed).toBeDefined();

    const data = turn.data as CityData;
    expect(data.city).toContain('Mumbai');
  }, 60000); // Longer timeout for local models
});

// ============================================
// Integration: Verify parsed evolves during streaming
// ============================================
describe.skipIf(!process.env.OPENAI_API_KEY)('Partial JSON Evolution', () => {
  test('parsed object evolves as more JSON streams in', async () => {
    // Use flat schema (no nested objects) to avoid OpenAI strict mode complexity
    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-4.1-mini', { api: 'completions' }),
      params: { max_tokens: 300 },
      structure: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          city: { type: 'string' },
          country: { type: 'string' },
          occupation: { type: 'string' },
        },
        required: ['name', 'age', 'city', 'country', 'occupation'],
      },
    });

    const stream = gpt.stream(
      'Generate a person profile: Alice, 28 years old, software engineer, lives in Seattle, USA.'
    );

    const parsedSnapshots: unknown[] = [];

    for await (const event of stream) {
      if (event.type === StreamEventType.ObjectDelta && event.delta.parsed !== undefined) {
        parsedSnapshots.push(structuredClone(event.delta.parsed));
      }
    }

    // Should have multiple snapshots showing evolution
    expect(parsedSnapshots.length).toBeGreaterThan(1);

    // Earlier snapshots should have fewer fields than later ones
    const firstParsed = parsedSnapshots[0] as Record<string, unknown>;
    const lastParsed = parsedSnapshots[parsedSnapshots.length - 1] as Record<string, unknown>;

    // Last parsed should have all the fields
    expect(lastParsed.name).toBeDefined();
    expect(lastParsed.age).toBeDefined();
    expect(lastParsed.city).toBeDefined();

    // First parsed might be incomplete (fewer keys)
    const firstKeys = Object.keys(firstParsed).length;
    const lastKeys = Object.keys(lastParsed).length;
    expect(lastKeys).toBeGreaterThanOrEqual(firstKeys);

    const turn = await stream.turn;
    expect(turn.data).toBeDefined();
  });

  test('tool call parsed arguments evolve during streaming', async () => {
    // Use flat schema for tool parameters
    const calculatorTool = {
      name: 'calculate',
      description: 'Perform a calculation',
      parameters: {
        type: 'object' as const,
        properties: {
          operation: { type: 'string' as const, description: 'Operation: add, subtract, multiply, divide' },
          a: { type: 'number' as const, description: 'First operand' },
          b: { type: 'number' as const, description: 'Second operand' },
        },
        required: ['operation', 'a', 'b'] as string[],
      },
      run: async (params: { operation: string; a: number; b: number }) => {
        switch (params.operation) {
          case 'add':
            return params.a + params.b;
          case 'multiply':
            return params.a * params.b;
          default:
            return params.a + params.b;
        }
      },
    };

    const gpt = llm<OpenAICompletionsParams>({
      model: openai('gpt-4.1-mini', { api: 'completions' }),
      params: { max_tokens: 300 },
      tools: [calculatorTool],
    });

    const stream = gpt.stream('Calculate 47 multiplied by 83. Use the calculate tool.');

    const parsedSnapshots: unknown[] = [];

    for await (const event of stream) {
      if (event.type === StreamEventType.ToolCallDelta && event.delta.parsed !== undefined) {
        parsedSnapshots.push(structuredClone(event.delta.parsed));
      }
    }

    // Should have captured evolution of parsed arguments
    expect(parsedSnapshots.length).toBeGreaterThan(0);

    // Last snapshot should have the complete arguments
    const lastParsed = parsedSnapshots[parsedSnapshots.length - 1] as Record<string, unknown>;
    expect(lastParsed.a).toBeDefined();
    expect(lastParsed.b).toBeDefined();

    await stream.turn;
  });
});
