import { test, expect, describe } from 'bun:test';
import { llm, Document, Audio, Video, Image } from '../../src/index.ts';
import { moonshot } from '../../src/moonshot/index.ts';
import type { MoonshotLLMParams } from '../../src/moonshot/index.ts';
import { UserMessage, type Message } from '../../src/types/messages.ts';
import type { ContentBlock } from '../../src/types/content.ts';
import { UPPError, ErrorCode } from '../../src/types/errors.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import { safeEvaluateExpression } from '../helpers/math.ts';
import { join } from 'path';

const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
const VIDEO_PATH = join(import.meta.dir, '../assets/BigBuckBunny_320x180.mp4');
const PDF_PATH = join(import.meta.dir, '../assets/helloworld.pdf');
const AUDIO_PATH = join(import.meta.dir, '../assets/helloworld.mp3');

type CityData = { city: string; population: number; isCapital: boolean };

const hasMoonshotKey = !!process.env.MOONSHOT_API_KEY || !!process.env.KIMI_API_KEY;

/**
 * Live API tests for Moonshot Chat Completions API
 * Requires MOONSHOT_API_KEY or KIMI_API_KEY environment variable
 *
 * Note: kimi-k2.5 has thinking mode enabled by default which:
 * - Only allows temperature=1
 * - Uses many tokens for reasoning before responding
 * - Requires reasoning_content in multi-turn assistant messages
 *
 * Most tests use thinking: { type: 'disabled' } for simplicity.
 */
describe.skipIf(!hasMoonshotKey)('Moonshot API Live', () => {
  test('simple text generation', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 100,
        thinking: { type: 'disabled' },
      },
    });

    const turn = await model.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 100,
        thinking: { type: 'disabled' },
      },
    });

    const stream = model.stream('Say "hello world" and nothing else.');

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text.toLowerCase()).toContain('hello');
    expect(turn.response.text.toLowerCase()).toContain('hello');
  });

  test('multi-turn conversation', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 100,
        thinking: { type: 'disabled' },
      },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await model.generate(history, 'My name is Bob.');
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await model.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('bob');
  });

  test('with system prompt', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 100,
        thinking: { type: 'disabled' },
      },
      system: 'You are a helpful assistant. Always be polite.',
    });

    const turn = await model.generate('What is 2+2?');

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('4');
  });

  test('tool calling', async () => {
    const calculate = {
      name: 'calculate',
      description: 'Calculate a mathematical expression. You MUST use this tool for any math.',
      parameters: {
        type: 'object' as const,
        properties: {
          expression: { type: 'string' as const, description: 'The math expression to evaluate' },
        },
        required: ['expression'],
      },
      run: async (params: { expression: string }) => {
        const result = safeEvaluateExpression(params.expression);
        return result === null ? 'Error evaluating expression' : `Result: ${result}`;
      },
    };

    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
      },
      tools: [calculate],
    });

    const turn = await model.generate('Use the calculate tool to compute 15 + 27. Do not answer without using the tool.');

    const hasToolCalls = turn.toolExecutions.length > 0;
    const hasCorrectAnswer = turn.response.text.includes('42');
    expect(hasToolCalls || hasCorrectAnswer).toBe(true);
  });

  test('streaming with tool execution', async () => {
    const calculator = {
      name: 'multiply',
      description: 'Multiply two numbers',
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

    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
      },
      tools: [calculator],
    });

    const stream = model.stream('What is 6 times 7? Use the multiply tool.');

    const events: string[] = [];
    let hasToolCallDelta = false;

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === StreamEventType.ToolCallDelta) {
        hasToolCallDelta = true;
      }
    }

    const turn = await stream.turn;

    expect(hasToolCallDelta || turn.toolExecutions.length > 0).toBe(true);
    expect(turn.response.text).toContain('42');
  });

  test('structured output with JSON mode', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 200,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
      },
    });

    const turn = await model.generate(
      'Return a JSON object with fields "name" (string) and "age" (number) for a person named John who is 30.'
    );

    const text = turn.response.text.trim();
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe('John');
    expect(parsed.age).toBe(30);
  });

  test('protocol-level structured output (schema enforcement)', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        thinking: { type: 'disabled' },
      },
      structure: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          population: { type: 'number' },
          isCapital: { type: 'boolean' },
        },
        required: ['city', 'population', 'isCapital'],
      },
    });

    const turn = await model.generate('Tell me about Paris, France.');

    expect(turn.data).toBeDefined();
    const data = turn.data as CityData;
    expect(data.city).toContain('Paris');
    expect(typeof data.population).toBe('number');
  });

  test('parallel tool execution', async () => {
    const getWeather = {
      name: 'getWeather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object' as const,
        properties: { city: { type: 'string' as const } },
        required: ['city'],
      },
      run: async (params: { city: string }) => `${params.city}: 75°F`,
    };

    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        thinking: { type: 'disabled' },
      },
      tools: [getWeather],
    });

    const turn = await model.generate('What is the weather in Tokyo and San Francisco? Use the tool for both cities.');

    const cities = turn.toolExecutions
      .map((execution) => {
        const city = execution.arguments.city;
        return typeof city === 'string' ? city.toLowerCase() : undefined;
      })
      .filter((city): city is string => city !== undefined);
    expect(cities.some(c => c.includes('tokyo'))).toBe(true);
    expect(cities.some(c => c.includes('san francisco') || c.includes('francisco'))).toBe(true);
    expect(turn.toolExecutions.length).toBeGreaterThanOrEqual(2);

    const text = turn.response.text.toLowerCase();
    expect(text.includes('tokyo') || text.includes('75')).toBe(true);
  });

  test('streaming basic', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 100,
        thinking: { type: 'disabled' },
      },
    });

    const stream = model.stream('What is the capital of France? Answer in one word.');

    let text = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;
    expect(text.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toContain('paris');
  });
});

/**
 * Media Input Tests for Moonshot (Kimi K2.5)
 *
 * Moonshot supports:
 * - Image input: Native vision via MoonViT encoder
 * - Video input: Experimental support
 *
 * NOT supported:
 * - Document input
 * - Audio input
 */
describe.skipIf(!hasMoonshotKey)('Moonshot Media Inputs', () => {
  describe('image input', () => {
    test('image analysis with Image helper', async () => {
      const image = await Image.fromPath(DUCK_IMAGE_PATH);

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 200,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What animal is shown in this image? Answer briefly.' },
        image.toBlock(),
      ]);

      const turn = await model.generate([message]);

      const text = turn.response.text.toLowerCase();
      expect(text).toMatch(/duck|bird|waterfowl/);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);
    }, 30000);

    test('streaming with image input', async () => {
      const image = await Image.fromPath(DUCK_IMAGE_PATH);

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 200,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'Describe what you see in this image in one sentence.' },
        image.toBlock(),
      ]);

      const stream = model.stream([message]);

      let textChunks = 0;
      for await (const event of stream) {
        if (event.type === StreamEventType.TextDelta) {
          textChunks++;
        }
      }

      const turn = await stream.turn;

      expect(textChunks).toBeGreaterThan(0);
      expect(turn.response.text.length).toBeGreaterThan(0);
    }, 30000);

    test('image with base64 encoding', async () => {
      // Simple 1x1 red pixel PNG
      const redPixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      const image = Image.fromBase64(redPixelBase64, 'image/png');

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 100,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What color is this tiny image? Answer with just the color.' },
        image.toBlock(),
      ]);

      const turn = await model.generate([message]);

      expect(turn.response.text.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('video input (experimental)', () => {
    test('video content analysis with Video helper', async () => {
      const video = await Video.fromPath(VIDEO_PATH);

      // Check video size - Moonshot may have limits for inline video
      const sizeMB = video.size / (1024 * 1024);
      if (sizeMB > 20) {
        console.log(`Skipping: video is ${sizeMB.toFixed(1)}MB (may exceed inline limit)`);
        return;
      }

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 300,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What is shown in this video? Describe briefly.' },
        video.toBlock(),
      ]);

      const turn = await model.generate([message]);

      const text = turn.response.text.toLowerCase();
      expect(text).toMatch(/bunny|rabbit|animal|cartoon|animated|character/);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);
    }, 120000);

    test('streaming with video input', async () => {
      const video = await Video.fromPath(VIDEO_PATH);

      const sizeMB = video.size / (1024 * 1024);
      if (sizeMB > 20) {
        console.log(`Skipping: video is ${sizeMB.toFixed(1)}MB (may exceed inline limit)`);
        return;
      }

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 200,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What type of content is this video? One sentence.' },
        video.toBlock(),
      ]);

      const stream = model.stream([message]);

      let textChunks = 0;
      for await (const event of stream) {
        if (event.type === StreamEventType.TextDelta) {
          textChunks++;
        }
      }

      const turn = await stream.turn;

      expect(textChunks).toBeGreaterThan(0);
      expect(turn.response.text.length).toBeGreaterThan(0);
    }, 120000);
  });

  describe('unsupported inline modalities', () => {
    /**
     * Moonshot supports documents via their /v1/files API (upload -> extract -> reference),
     * but NOT inline document blocks in chat completions like Google Gemini.
     * This test verifies we throw an appropriate error for inline document blocks.
     */
    test('inline document blocks throw UPPError', async () => {
      const doc = await Document.fromPath(PDF_PATH);

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 100,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What is in this document?' },
        doc.toBlock(),
      ]);

      try {
        await model.generate([message]);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UPPError);
        const uppError = error as UPPError;
        expect(uppError.code).toBe(ErrorCode.InvalidRequest);
        expect(uppError.message.toLowerCase()).toContain('document');
      }
    });

    test('audio input throws UPPError', async () => {
      const audio = await Audio.fromPath(AUDIO_PATH);

      const model = llm<MoonshotLLMParams>({
        model: moonshot('kimi-k2.5'),
        params: {
          max_tokens: 100,
          thinking: { type: 'disabled' },
        },
      });

      const message = new UserMessage([
        { type: 'text', text: 'What is in this audio?' },
        audio.toBlock(),
      ]);

      try {
        await model.generate([message]);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UPPError);
        const uppError = error as UPPError;
        expect(uppError.code).toBe(ErrorCode.InvalidRequest);
        expect(uppError.message.toLowerCase()).toContain('audio');
      }
    });
  });
});

/**
 * Thinking mode tests for Moonshot (Kimi K2.5)
 * These tests use more tokens since thinking mode needs space to reason.
 *
 * Note: When thinking is enabled and assistant messages have tool_calls,
 * the reasoning_content MUST be forwarded back to the API.
 */
describe.skipIf(!hasMoonshotKey)('Moonshot Thinking Mode', () => {
  test('multi-turn with thinking mode', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 400,
        // Thinking enabled by default
      },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await model.generate(history, 'My favorite color is blue.');
    history.push(...turn1.messages);

    // Verify reasoning content was captured
    const metadata1 = turn1.response.metadata as { moonshot?: { reasoning_content?: string } } | undefined;
    const hasReasoning = !!metadata1?.moonshot?.reasoning_content || turn1.response.content.some(b => b.type === 'reasoning');
    expect(hasReasoning).toBe(true);

    // Second turn - should work with reasoning content forwarded
    const turn2 = await model.generate(history, 'What is my favorite color?');

    expect(turn2.response.text.toLowerCase()).toContain('blue');
  }, 60000);

  test('tool calling with thinking mode', async () => {
    const calculator = {
      name: 'calculate',
      description: 'Calculate a math expression',
      parameters: {
        type: 'object' as const,
        properties: {
          expression: { type: 'string' as const, description: 'Math expression' },
        },
        required: ['expression'],
      },
      run: async (params: { expression: string }) => {
        const result = safeEvaluateExpression(params.expression);
        return result === null ? 'Error' : String(result);
      },
    };

    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        // Thinking enabled by default
      },
      tools: [calculator],
    });

    // This tests that reasoning_content is properly forwarded
    // when the assistant message with tool_calls is sent back
    const turn = await model.generate('What is 25 * 4? Use the calculate tool.');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('100');
  }, 60000);

  test('thinking mode with reasoning content', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 500,
        // Default: thinking enabled, temperature must be 1
      },
    });

    const turn = await model.generate('What is 17 * 23?');

    expect(turn.response.text).toContain('391');
    // Check for reasoning content in metadata
    const metadata = turn.response.metadata as { moonshot?: { reasoning_content?: string } } | undefined;
    if (metadata?.moonshot?.reasoning_content) {
      expect(metadata.moonshot.reasoning_content.length).toBeGreaterThan(0);
    }
    // Or check for reasoning blocks in content
    const hasReasoningBlocks = turn.response.content.some(
      (block: ContentBlock) => block.type === 'reasoning'
    );
    // At least one form of reasoning should be present
    expect(!!metadata?.moonshot?.reasoning_content || hasReasoningBlocks).toBe(true);
  }, 30000);

  test('instant mode (thinking disabled)', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 100,
        temperature: 0.6,
        thinking: { type: 'disabled' },
      },
    });

    const turn = await model.generate('Say hello.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming with reasoning deltas', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 400,
        // Thinking enabled by default
      },
    });

    const stream = model.stream('What is 12 + 15?');

    let hasReasoningDelta = false;
    let hasTextDelta = false;

    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta) {
        hasReasoningDelta = true;
      }
      if (event.type === StreamEventType.TextDelta) {
        hasTextDelta = true;
      }
    }

    const turn = await stream.turn;

    expect(turn.response.text).toContain('27');
    // With thinking mode, we should get reasoning deltas
    expect(hasReasoningDelta).toBe(true);
  }, 30000);
});

/**
 * Error handling tests for Moonshot API
 */
describe.skipIf(!hasMoonshotKey)('Moonshot API Error Handling', () => {
  test('invalid API key returns UPPError', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 10,
        thinking: { type: 'disabled' },
      },
      config: { apiKey: 'invalid-key-12345' },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe(ErrorCode.AuthenticationFailed);
      expect(uppError.provider).toBe('moonshot');
      expect(uppError.modality).toBe('llm');
    }
  });

  test('invalid model returns UPPError', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('nonexistent-model-xyz'),
      params: {
        max_tokens: 10,
        thinking: { type: 'disabled' },
      },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect([ErrorCode.ModelNotFound, ErrorCode.InvalidRequest] as ErrorCode[]).toContain(uppError.code);
      expect(uppError.provider).toBe('moonshot');
    }
  });
});

/**
 * Temperature tests for Moonshot (Kimi K2.5)
 *
 * Note: kimi-k2.5 has strict temperature requirements:
 * - Thinking enabled: only temperature=1 is allowed
 * - Thinking disabled: only temperature=0.6 is allowed
 */
describe.skipIf(!hasMoonshotKey)('Moonshot Temperature Constraints', () => {
  test('thinking mode allows temperature 1', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 300,
        temperature: 1,
        // Thinking enabled by default
      },
    });

    const turn = await model.generate('What is 1+1?');
    expect(turn.response.text).toBeDefined();
    expect(turn.response.text).toContain('2');
  }, 20000);

  test('instant mode allows temperature 0.6', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 50,
        temperature: 0.6,
        thinking: { type: 'disabled' },
      },
    });

    const turn = await model.generate('What is 2+2? Answer with just the number.');
    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  test('invalid temperature returns error', async () => {
    const model = llm<MoonshotLLMParams>({
      model: moonshot('kimi-k2.5'),
      params: {
        max_tokens: 50,
        temperature: 0.5,
        thinking: { type: 'disabled' },
      },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe(ErrorCode.InvalidRequest);
      expect(uppError.message).toContain('temperature');
    }
  });
});
