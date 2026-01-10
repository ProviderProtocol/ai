import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { vertex, vertexTools, cache } from '../../src/providers/vertex/index.ts';
import type {
  VertexGeminiParams,
  VertexClaudeParams,
  VertexMistralParams,
  VertexMaaSParams,
} from '../../src/providers/vertex/index.ts';
import { UserMessage } from '../../src/types/messages.ts';
import { UPPError } from '../../src/types/errors.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

const DUCK_IMAGE_PATH = join(import.meta.dir, '../assets/duck.png');
let DUCK_IMAGE_BASE64: string;
try {
  DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString('base64');
} catch {
  DUCK_IMAGE_BASE64 = '';
}

/**
 * Auth check for Gemini models - supports either:
 * 1. VERTEX_API_KEY (Express Mode - global endpoint)
 * 2. OAuth (GOOGLE_ACCESS_TOKEN + project)
 */
const hasGeminiAuth = !!(
  process.env.VERTEX_API_KEY ||
  (process.env.GOOGLE_ACCESS_TOKEN &&
    (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT))
);

/**
 * Auth check for partner models (Claude, Mistral, MaaS) - requires OAuth only.
 */
const hasPartnerAuth = !!(
  process.env.GOOGLE_ACCESS_TOKEN &&
  (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT)
);

/**
 * Live API tests for Vertex AI Gemini endpoint.
 * Requires either VERTEX_API_KEY or (GOOGLE_ACCESS_TOKEN + GOOGLE_CLOUD_PROJECT).
 */
describe.skipIf(!hasGeminiAuth)('Vertex AI Gemini Live API', () => {
  test('simple text generation', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
    });

    const turn = await gemini.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      // Higher token limit for thinking models that use tokens for reasoning
      params: { maxOutputTokens: 500 },
    });

    const stream = gemini.stream('Count from 1 to 5.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text.length).toBeGreaterThan(0);
    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  test('multi-turn conversation', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
    });

    const history: any[] = [];

    const turn1 = await gemini.generate(history, 'My name is Alice.');
    history.push(...turn1.messages);

    const turn2 = await gemini.generate(history, 'What is my name?');

    expect(turn2.response.text.toLowerCase()).toContain('alice');
  });

  test('with system prompt', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await gemini.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes('ahoy') ||
      text.includes('matey') ||
      text.includes('arr') ||
      text.includes('pirate') ||
      text.includes('sea') ||
      text.includes('ship')
    ).toBe(true);
  });

  test('tool calling', async () => {
    const getWeather = {
      name: 'getWeather',
      description: 'Get the weather for a location',
      parameters: {
        type: 'object' as const,
        properties: {
          location: { type: 'string' as const, description: 'The city name' },
        },
        required: ['location'],
      },
      run: async (params: { location: string }) => {
        return `The weather in ${params.location} is 72°F and sunny.`;
      },
    };

    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: { maxOutputTokens: 200 },
      tools: [getWeather],
    });

    const turn = await gemini.generate('What is the weather in Tokyo?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toContain('tokyo');
  });

  test.skipIf(!DUCK_IMAGE_BASE64)('vision/multimodal with base64 image', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: { maxOutputTokens: 100 },
    });

    const imageMessage = new UserMessage([
      { type: 'text', text: 'What animal is in this image? Reply with just the animal name.' },
      {
        type: 'image',
        mimeType: 'image/png',
        source: { type: 'base64', data: DUCK_IMAGE_BASE64 },
      },
    ]);

    const turn = await gemini.generate([imageMessage]);

    expect(turn.response.text.toLowerCase()).toMatch(/duck|bird|waterfowl/);
  });
});

/**
 * Live API tests for Vertex AI Claude (partner) endpoint.
 */
describe.skipIf(!hasPartnerAuth)('Vertex AI Claude Live API', () => {
  test('simple text generation', async () => {
    const claude = llm<VertexClaudeParams>({
      model: vertex('claude-haiku-4-5', { endpoint: 'claude' }),
      config: { location: 'global' } as Record<string, unknown>,
      params: { max_tokens: 100 },
    });

    const turn = await claude.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const claude = llm<VertexClaudeParams>({
      model: vertex('claude-haiku-4-5', { endpoint: 'claude' }),
      config: { location: 'global' } as Record<string, unknown>,
      params: { max_tokens: 50 },
    });

    const stream = claude.stream('Count from 1 to 5.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text).toContain('1');
    expect(turn.response.text).toContain('1');
  });

  test('with system prompt', async () => {
    const claude = llm<VertexClaudeParams>({
      model: vertex('claude-haiku-4-5', { endpoint: 'claude' }),
      config: { location: 'global' } as Record<string, unknown>,
      params: { max_tokens: 100 },
      system: 'You are a pirate. Always respond like a pirate.',
    });

    const turn = await claude.generate('Hello!');

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes('ahoy') ||
      text.includes('matey') ||
      text.includes('arr') ||
      text.includes('pirate') ||
      text.includes('sea')
    ).toBe(true);
  });

  test('tool calling', async () => {
    const getWeather = {
      name: 'getWeather',
      description: 'Get the weather for a location',
      parameters: {
        type: 'object' as const,
        properties: {
          location: { type: 'string' as const, description: 'The city name' },
        },
        required: ['location'],
      },
      run: async (params: { location: string }) => {
        return `The weather in ${params.location} is 72°F and sunny.`;
      },
    };

    const claude = llm<VertexClaudeParams>({
      model: vertex('claude-haiku-4-5', { endpoint: 'claude' }),
      config: { location: 'global' } as Record<string, unknown>,
      params: { max_tokens: 200 },
      tools: [getWeather],
    });

    const turn = await claude.generate('What is the weather in Paris?');

    expect(turn.toolExecutions.length).toBeGreaterThan(0);
    expect(turn.response.text.toLowerCase()).toContain('paris');
  });
});

/**
 * Live API tests for Vertex AI Mistral (partner) endpoint.
 */
describe.skipIf(!hasPartnerAuth)('Vertex AI Mistral Live API', () => {
  test('simple text generation', async () => {
    const mistral = llm<VertexMistralParams>({
      model: vertex('mistral-medium-3', { endpoint: 'mistral' }),
      params: { max_tokens: 100 },
    });

    const turn = await mistral.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test('streaming text generation', async () => {
    const mistral = llm<VertexMistralParams>({
      model: vertex('mistral-medium-3', { endpoint: 'mistral' }),
      params: { max_tokens: 50 },
    });

    const stream = mistral.stream('Count from 1 to 5.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text).toContain('1');
    expect(turn.response.text).toContain('1');
  });

  test('with system prompt', async () => {
    const mistral = llm<VertexMistralParams>({
      model: vertex('mistral-medium-3', { endpoint: 'mistral' }),
      params: { max_tokens: 100 },
      system: 'You are a helpful assistant. Respond in JSON format.',
    });

    const turn = await mistral.generate('List 3 colors.');

    expect(turn.response.text).toBeDefined();
  });
});

/**
 * Live API tests for Vertex AI MaaS (DeepSeek, gpt-oss) endpoint.
 */
describe.skipIf(!hasPartnerAuth)('Vertex AI MaaS Live API', () => {
  test('DeepSeek R1 simple text generation', async () => {
    const deepseek = llm<VertexMaaSParams>({
      model: vertex('deepseek-ai/deepseek-r1-0528-maas', { endpoint: 'maas' }),
      params: { max_tokens: 200 },
    });

    const turn = await deepseek.generate('What is 2 + 2? Give a short answer.');

    expect(turn.response.text).toContain('4');
    expect(turn.cycles).toBe(1);
  });

  test('DeepSeek R1 streaming', async () => {
    const deepseek = llm<VertexMaaSParams>({
      model: vertex('deepseek-ai/deepseek-r1-0528-maas', { endpoint: 'maas' }),
      params: { max_tokens: 100 },
    });

    const stream = deepseek.stream('Say hello briefly.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text.toLowerCase()).toContain('hello');
    expect(turn.response.text.toLowerCase()).toContain('hello');
  });

  test('gpt-oss-120b simple text generation', async () => {
    const gptOss = llm<VertexMaaSParams>({
      model: vertex('openai/gpt-oss-120b-maas', { endpoint: 'maas' }),
      params: { max_tokens: 100 },
    });

    const turn = await gptOss.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain('hello');
    expect(turn.cycles).toBe(1);
  });

  test('gpt-oss-120b streaming', async () => {
    const gptOss = llm<VertexMaaSParams>({
      model: vertex('openai/gpt-oss-120b-maas', { endpoint: 'maas' }),
      params: { max_tokens: 50 },
    });

    const stream = gptOss.stream('Count from 1 to 3.');

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Either streaming or final response should have content
    expect(text.length > 0 || turn.response.text.length > 0).toBe(true);
  });
});

/**
 * Live API tests for Vertex AI Gemini built-in tools.
 */
describe.skipIf(!hasGeminiAuth)('Vertex AI Gemini Built-in Tools', () => {
  test('Google Search grounding', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: {
        maxOutputTokens: 200,
        builtInTools: [vertexTools.googleSearch()],
      },
    });

    const turn = await gemini.generate('What is the current price of Bitcoin in USD?');

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.cycles).toBe(1);
  });

  test('Code execution tool', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: {
        maxOutputTokens: 500,
        builtInTools: [vertexTools.codeExecution()],
      },
    });

    const turn = await gemini.generate('Calculate the factorial of 10 using Python code.');

    // Accept either format: 3628800 or 3,628,800
    expect(turn.response.text.replace(/,/g, '')).toContain('3628800');
    expect(turn.cycles).toBe(1);
  });

  test('Google Search with excluded domains', async () => {
    const gemini = llm<VertexGeminiParams>({
      model: vertex('gemini-3-flash-preview'),
      params: {
        maxOutputTokens: 200,
        builtInTools: [
          vertexTools.googleSearch({ excludeDomains: ['wikipedia.org'] }),
        ],
      },
    });

    const turn = await gemini.generate('What is the capital of France?');

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.cycles).toBe(1);
  });
});

/**
 * Live API tests for Vertex AI Gemini caching.
 * Requires OAuth authentication.
 *
 * Note: Caching requires the Vertex AI API to be enabled and uses the v1beta1 endpoint.
 */
describe.skipIf(!hasPartnerAuth)('Vertex AI Gemini Caching', () => {
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN!;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT!;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  test('list caches (verifies API access)', async () => {
    const result = await cache.list({
      accessToken,
      projectId,
      location,
      pageSize: 5,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.cachedContents) || result.cachedContents === undefined).toBe(true);
  });

  test('create and delete cache', async () => {
    // Minimum 1024 tokens required for caching
    const largeSystemInstruction = 'You are a helpful assistant specialized in testing software applications. '.repeat(150);
    const cacheEntry = await cache.create({
      accessToken,
      projectId,
      location,
      model: 'gemini-3-flash-preview',
      displayName: 'UPP Test Cache',
      systemInstruction: largeSystemInstruction,
      ttl: '300s',
    });

    expect(cacheEntry.name).toBeDefined();
    expect(cacheEntry.name).toContain('cachedContents');
    expect(cacheEntry.displayName).toBe('UPP Test Cache');

    await cache.delete(cacheEntry.name, {
      accessToken,
      projectId,
      location,
    });
  });

  test('cache with contents', async () => {
    const cacheEntry = await cache.create({
      accessToken,
      projectId,
      location,
      model: 'gemini-3-flash-preview',
      displayName: 'UPP Content Cache Test',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'This is a large document that would benefit from caching. '.repeat(100) }],
        },
      ],
      ttl: '300s',
    });

    expect(cacheEntry.name).toBeDefined();
    expect(cacheEntry.usageMetadata?.totalTokenCount).toBeGreaterThan(0);

    await cache.delete(cacheEntry.name, {
      accessToken,
      projectId,
      location,
    });
  });
});

/**
 * Live API tests for Vertex AI Claude caching (cache_control).
 */
describe.skipIf(!hasPartnerAuth)('Vertex AI Claude Cache Control', () => {
  test('tracks cache tokens in response', async () => {
    const largeSystemPrompt = 'You are a helpful assistant. This is a large system prompt that would benefit from caching. '.repeat(50);
    const claude = llm<VertexClaudeParams>({
      model: vertex('claude-haiku-4-5', { endpoint: 'claude' }),
      config: { location: 'global' } as Record<string, unknown>,
      params: { max_tokens: 100 },
      system: largeSystemPrompt,
    });

    const turn = await claude.generate('Hello, how are you?');

    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
    expect(turn.usage.cacheReadTokens).toBeDefined();
    expect(turn.usage.cacheWriteTokens).toBeDefined();
  });
});

/**
 * Error handling tests.
 * Note: These tests only work with OAuth auth (not API key auth).
 */
describe.skipIf(!hasPartnerAuth)('Vertex AI Error Handling', () => {
  test('invalid model returns UPPError', async () => {
    const model = llm<VertexGeminiParams>({
      model: vertex('nonexistent-model-xyz'),
      params: { maxOutputTokens: 10 },
    });

    try {
      await model.generate('Hello');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.provider).toBe('vertex');
    }
  });

  test('missing project ID throws UPPError', async () => {
    const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
    const originalGcloud = process.env.GCLOUD_PROJECT;
    const originalApiKey = process.env.VERTEX_API_KEY;

    try {
      // Remove both project ID and API key to force the error
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;
      delete process.env.VERTEX_API_KEY;

      const model = llm<VertexGeminiParams>({
        model: vertex('gemini-3-flash-preview'),
        params: { maxOutputTokens: 10 },
      });

      try {
        await model.generate('Hello');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UPPError);
        const uppError = error as UPPError;
        expect(uppError.code).toBe('INVALID_REQUEST');
        expect(uppError.message).toContain('project ID');
      }
    } finally {
      if (originalProject) process.env.GOOGLE_CLOUD_PROJECT = originalProject;
      if (originalGcloud) process.env.GCLOUD_PROJECT = originalGcloud;
      if (originalApiKey) process.env.VERTEX_API_KEY = originalApiKey;
    }
  });
});
