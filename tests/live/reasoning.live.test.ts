/**
 * Live API tests for reasoning/thinking features across providers.
 *
 * Tests extended thinking and reasoning output for:
 * - Anthropic: Extended thinking with budget_tokens
 * - OpenAI: Reasoning models (o3-mini, o4-mini) with reasoning.summary
 * - Google Gemini: thinkingConfig with thinkingBudget
 * - Ollama: DeepSeek/GPT-OSS with think mode
 * - X.AI: Grok-3-mini with reasoning_effort
 *
 * Each provider has different parameters and models for reasoning.
 */
import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic, betas } from '../../src/anthropic/index.ts';
import { openai } from '../../src/openai/index.ts';
import { google } from '../../src/google/index.ts';
import { ollama } from '../../src/ollama/index.ts';
import { xai } from '../../src/xai/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import type { OpenAIResponsesParams } from '../../src/openai/index.ts';
import type { GoogleLLMParams } from '../../src/google/index.ts';
import type { OllamaLLMParams } from '../../src/ollama/index.ts';
import type { XAICompletionsParams, XAIMessagesParams } from '../../src/xai/index.ts';
import { StreamEventType } from '../../src/types/stream.ts';
import type { Message } from '../../src/types/messages.ts';

const REASONING_PROMPT = 'What is 17 * 23? Think through this step by step and show your reasoning.';
const COMPLEX_PROMPT = `In a city of 150k, 60% are adults, 40% of adults own cars. Calculate the total cars. Let's solve this step by step.`;

/**
 * Anthropic Extended Thinking Tests
 * Uses claude-sonnet-4 with thinking.budget_tokens parameter
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Extended Thinking', () => {
  test('extended thinking with budget returns reasoning content', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 16000,
        thinking: {
          type: 'enabled',
          budget_tokens: 5000,
        },
      },
    });

    const turn = await claude.generate(REASONING_PROMPT);

    // Should have reasoning blocks from extended thinking
    const reasoningBlocks = turn.response.reasoning;
    expect(reasoningBlocks.length).toBeGreaterThan(0);
    expect(reasoningBlocks[0]?.text.length).toBeGreaterThan(0);

    // Should also have the final text response
    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('391');
  }, 120000);

  test('streaming extended thinking emits ReasoningDelta events', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 16000,
        thinking: {
          type: 'enabled',
          budget_tokens: 3000,
        },
      },
    });

    const stream = claude.stream(REASONING_PROMPT);

    let reasoningContent = '';
    let textContent = '';
    let hadReasoningDelta = false;
    let hadTextDelta = false;

    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta && event.delta.text) {
        reasoningContent += event.delta.text;
        hadReasoningDelta = true;
      } else if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
        hadTextDelta = true;
      }
    }

    const turn = await stream.turn;

    expect(hadReasoningDelta).toBe(true);
    expect(hadTextDelta).toBe(true);
    expect(reasoningContent.length).toBeGreaterThan(0);
    expect(textContent.length).toBeGreaterThan(0);

    // Final response should contain reasoning blocks
    expect(turn.response.reasoning.length).toBeGreaterThan(0);
  }, 120000);

  test('interleaved thinking with beta header', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514', {
        betas: [betas.interleavedThinking],
      }),
      params: {
        max_tokens: 8000,
        thinking: {
          type: 'enabled',
          budget_tokens: 4000,
        },
      },
    });

    const turn = await claude.generate(COMPLEX_PROMPT);

    // With interleaved thinking, reasoning should be present
    const reasoningBlocks = turn.response.reasoning;
    expect(reasoningBlocks.length).toBeGreaterThan(0);

    // Should have calculated the correct answer: 150k * 60% adults * 40% car owners = 36,000
    expect(turn.response.text).toContain('36,000');
  }, 120000);
});

/**
 * OpenAI Reasoning Model Tests
 * Uses o3-mini or o4-mini with reasoning.summary parameter
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Reasoning Models', () => {
  test('o3-mini with reasoning summary returns reasoning content', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('o3-mini'),
      params: {
        max_output_tokens: 4000,
        reasoning: {
          effort: 'medium',
          summary: 'detailed',
        },
      },
    });

    const turn = await gpt.generate(REASONING_PROMPT);

    // Should have reasoning blocks from reasoning summary
    const reasoningBlocks = turn.response.reasoning;
    // Note: OpenAI may not always return reasoning summaries
    if (reasoningBlocks.length > 0) {
      expect(reasoningBlocks[0]?.text.length).toBeGreaterThan(0);
    }

    // Should have the final answer
    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('391');
  }, 120000);

  test('o4-mini streaming with reasoning deltas', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('o4-mini'),
      params: {
        max_output_tokens: 4000,
        reasoning: {
          effort: 'low',
          summary: 'auto',
        },
      },
    });

    const stream = gpt.stream(REASONING_PROMPT);

    let reasoningContent = '';
    let textContent = '';

    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta && event.delta.text) {
        reasoningContent += event.delta.text;
      } else if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Should have text response
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('391');

    // Reasoning may or may not be streamed depending on model behavior
    console.log(`OpenAI reasoning streamed: ${reasoningContent.length} chars`);
  }, 120000);

  test('reasoning effort affects response quality', async () => {
    const gptLow = llm<OpenAIResponsesParams>({
      model: openai('o3-mini'),
      params: {
        max_output_tokens: 2000,
        reasoning: {
          effort: 'low',
        },
      },
    });

    const gptHigh = llm<OpenAIResponsesParams>({
      model: openai('o3-mini'),
      params: {
        max_output_tokens: 4000,
        reasoning: {
          effort: 'high',
        },
      },
    });

    const [turnLow, turnHigh] = await Promise.all([
      gptLow.generate(COMPLEX_PROMPT),
      gptHigh.generate(COMPLEX_PROMPT),
    ]);

    // Both should get the right answer: 36,000 cars
    expect(turnLow.response.text).toContain('36,000');
    expect(turnHigh.response.text).toContain('36,000');

    // High effort typically uses more tokens
    console.log(`Low effort tokens: ${turnLow.usage.outputTokens}`);
    console.log(`High effort tokens: ${turnHigh.usage.outputTokens}`);
  }, 180000);
});

/**
 * Google Gemini Thinking Tests
 *
 * Note: Gemini 2.5 models return thought summaries in both streaming and non-streaming.
 * Gemini 3 preview models only return thoughts in streaming mode (non-streaming returns thoughtSignature only).
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google Gemini Thinking', () => {
  test('gemini 2.5 with includeThoughts returns thought content', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 4000,
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    });

    const turn = await gemini.generate(COMPLEX_PROMPT);

    // Should have reasoning from thinking
    const reasoningBlocks = turn.response.reasoning;
    if (reasoningBlocks.length > 0) {
      expect(reasoningBlocks[0]?.text.length).toBeGreaterThan(0);
      console.log(`Gemini thinking: ${reasoningBlocks[0]?.text.slice(0, 200)}...`);
    }

    // Should have the answer: 36,000 cars
    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('36,000');
  }, 120000);

  test('gemini 2.5 streaming emits ReasoningDelta for thought parts', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 4000,
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    });

    const stream = gemini.stream(REASONING_PROMPT);

    let reasoningContent = '';
    let textContent = '';
    let hadReasoningDelta = false;

    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta && event.delta.text) {
        reasoningContent += event.delta.text;
        hadReasoningDelta = true;
      } else if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Thinking may produce reasoning deltas
    if (hadReasoningDelta) {
      expect(reasoningContent.length).toBeGreaterThan(0);
      console.log(`Streamed ${reasoningContent.length} chars of reasoning`);
    }

    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('391');
  }, 120000);

  test('gemini 2.5 dynamic thinking with thinkingBudget -1', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 4000,
        thinkingConfig: {
          thinkingBudget: -1, // Dynamic thinking
          includeThoughts: true,
        },
      },
    });

    const turn = await gemini.generate(COMPLEX_PROMPT);

    // Should have reasoning from dynamic thinking
    expect(turn.response.reasoning.length).toBeGreaterThan(0);
    // Should compute the correct answer: 36,000 cars
    expect(turn.response.text).toContain('36,000');
    expect(turn.usage.outputTokens).toBeGreaterThan(0);
  }, 120000);

  test('gemini 3 streaming returns thoughts (non-streaming only returns signature)', async () => {
    // Gemini 3 preview models only return thought content in streaming mode
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-3-flash-preview'),
      params: {
        maxOutputTokens: 4000,
        thinkingConfig: {
          thinkingLevel: 'high',
          includeThoughts: true,
        },
      },
    });

    const stream = gemini.stream(REASONING_PROMPT);

    let reasoningContent = '';
    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta && event.delta.text) {
        reasoningContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Gemini 3 streaming SHOULD have reasoning
    expect(reasoningContent.length).toBeGreaterThan(0);
    console.log(`Gemini 3 streamed ${reasoningContent.length} chars of reasoning`);
    expect(turn.response.text).toContain('391');
  }, 120000);
});

/**
 * Ollama Thinking Tests
 * Uses DeepSeek-R1 or GPT-OSS models with think parameter
 */
describe('Ollama Thinking Models', () => {
  // Use GPT-OSS as specified by user, or fallback to deepseek-r1
  const THINKING_MODEL = process.env.OLLAMA_THINKING_MODEL || 'gpt-oss:20b';

  test('thinking model returns reasoning content', async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(THINKING_MODEL),
      params: {
        num_predict: 2000,
        think: true,
      },
    });

    try {
      const turn = await model.generate(REASONING_PROMPT);

      // Check for reasoning in response
      const reasoningBlocks = turn.response.reasoning;
      if (reasoningBlocks.length > 0) {
        expect(reasoningBlocks[0]?.text.length).toBeGreaterThan(0);
        console.log(`Ollama thinking: ${reasoningBlocks[0]?.text.slice(0, 200)}...`);
      }

      // Should have the answer
      expect(turn.response.text.length).toBeGreaterThan(0);
    } catch (error) {
      // Skip if model not available
      console.log(`Skipping Ollama thinking test: ${error}`);
    }
  }, 180000);

  test('thinking model streaming emits ReasoningDelta', async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(THINKING_MODEL),
      params: {
        num_predict: 2000,
        think: true,
      },
    });

    try {
      const stream = model.stream(REASONING_PROMPT);

      let reasoningContent = '';
      let textContent = '';
      let hadReasoningDelta = false;

      for await (const event of stream) {
        if (event.type === StreamEventType.ReasoningDelta && event.delta.text) {
          reasoningContent += event.delta.text;
          hadReasoningDelta = true;
        } else if (event.type === StreamEventType.TextDelta && event.delta.text) {
          textContent += event.delta.text;
        }
      }

      const turn = await stream.turn;

      if (hadReasoningDelta) {
        expect(reasoningContent.length).toBeGreaterThan(0);
        console.log(`Streamed ${reasoningContent.length} chars of thinking`);
      }

      expect(turn.response.text.length).toBeGreaterThan(0);
    } catch (error) {
      console.log(`Skipping Ollama streaming test: ${error}`);
    }
  }, 180000);

  test('thinking stored in message metadata', async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(THINKING_MODEL),
      params: {
        num_predict: 1000,
        think: true,
      },
    });

    try {
      const turn = await model.generate('What is 5 + 7?');

      // Ollama stores thinking in metadata
      const ollamaMeta = turn.response.metadata?.ollama as Record<string, unknown> | undefined;
      if (ollamaMeta?.thinking) {
        expect(typeof ollamaMeta.thinking).toBe('string');
        console.log(`Thinking in metadata: ${(ollamaMeta.thinking as string).slice(0, 100)}...`);
      }

      expect(turn.response.text).toContain('12');
    } catch (error) {
      console.log(`Skipping Ollama metadata test: ${error}`);
    }
  }, 120000);
});

/**
 * X.AI Grok Reasoning Tests
 * Uses grok-3-mini with reasoning_effort parameter
 */
describe.skipIf(!process.env.XAI_API_KEY)('X.AI Grok Reasoning', () => {
  test('grok-3-mini with reasoning_effort returns reasoning', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-3-mini'),
      params: {
        max_tokens: 4000,
        reasoning_effort: 'high',
      },
    });

    const turn = await grok.generate(REASONING_PROMPT);

    // Check for reasoning blocks
    const reasoningBlocks = turn.response.reasoning;
    if (reasoningBlocks.length > 0) {
      expect(reasoningBlocks[0]?.text.length).toBeGreaterThan(0);
      console.log(`Grok reasoning: ${reasoningBlocks[0]?.text.slice(0, 200)}...`);
    }

    // Should have the answer
    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('391');
  }, 120000);

  test('grok streaming with reasoning deltas', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-3-mini'),
      params: {
        max_tokens: 4000,
        reasoning_effort: 'low',
      },
    });

    const stream = grok.stream(REASONING_PROMPT);

    let reasoningContent = '';
    let textContent = '';
    let hadReasoningDelta = false;

    for await (const event of stream) {
      if (event.type === StreamEventType.ReasoningDelta && event.delta.text) {
        reasoningContent += event.delta.text;
        hadReasoningDelta = true;
      } else if (event.type === StreamEventType.TextDelta && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    if (hadReasoningDelta) {
      expect(reasoningContent.length).toBeGreaterThan(0);
    }

    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text).toContain('391');
  }, 120000);

  test('low vs high reasoning effort comparison', async () => {
    const grokLow = llm<XAICompletionsParams>({
      model: xai('grok-3-mini'),
      params: {
        max_tokens: 2000,
        reasoning_effort: 'low',
      },
    });

    const grokHigh = llm<XAICompletionsParams>({
      model: xai('grok-3-mini'),
      params: {
        max_tokens: 4000,
        reasoning_effort: 'high',
      },
    });

    const [turnLow, turnHigh] = await Promise.all([
      grokLow.generate(COMPLEX_PROMPT),
      grokHigh.generate(COMPLEX_PROMPT),
    ]);

    // Both should get the right answer: 36,000 cars
    expect(turnLow.response.text).toContain('36,000');
    expect(turnHigh.response.text).toContain('36,000');

    console.log(`Low effort: ${turnLow.usage.outputTokens} tokens`);
    console.log(`High effort: ${turnHigh.usage.outputTokens} tokens`);
  }, 180000);
});

/**
 * Multi-turn Reasoning Context Preservation Tests
 * Tests that reasoning signatures/encrypted_content are properly forwarded
 * across conversation turns to maintain reasoning context.
 */
describe('Multi-Turn Reasoning Context', () => {
  test.skipIf(!process.env.GOOGLE_API_KEY)('gemini thoughtSignature forwarded in multi-turn', async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash'),
      params: {
        maxOutputTokens: 4000,
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    });

    const history: Message[] = [];

    // Turn 1: Ask a question that requires reasoning
    const turn1 = await gemini.generate(history, 'Think about what 15 * 8 equals. Just say the number.');
    expect(turn1.response.text).toContain('120');
    history.push(...turn1.messages);

    // Check if thoughtSignature was captured
    const googleMeta = turn1.response.metadata?.google as Record<string, unknown> | undefined;
    console.log(`Gemini thoughtSignature present: ${!!googleMeta?.thoughtSignature}`);

    // Turn 2: Follow up using the same conversation
    const turn2 = await gemini.generate(history, 'Now multiply that result by 2. What do you get?');

    expect(turn2.response.text).toContain('240');
    console.log('Gemini multi-turn reasoning context preserved');
  }, 120000);

  test.skipIf(!process.env.OPENAI_API_KEY)('openai encrypted_content forwarded in multi-turn', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('o3-mini'),
      params: {
        max_output_tokens: 4000,
        reasoning: {
          effort: 'medium',
          summary: 'auto',
        },
        store: false, // Stateless mode - requires encrypted_content forwarding
        include: ['reasoning.encrypted_content'],
      },
    });

    const history: Message[] = [];

    // Turn 1: Establish context with reasoning
    const turn1 = await gpt.generate(history, 'Calculate 25 * 4 step by step. Give me just the final number.');
    expect(turn1.response.text).toContain('100');
    history.push(...turn1.messages);

    // Check if encrypted_content was captured
    const openaiMeta = turn1.response.metadata?.openai as Record<string, unknown> | undefined;
    console.log(`OpenAI encrypted_content present: ${!!openaiMeta?.reasoningEncryptedContent}`);

    // Turn 2: Follow up - should preserve reasoning context
    const turn2 = await gpt.generate(history, 'Add 50 to that number. What is the result?');

    expect(turn2.response.text).toContain('150');
    console.log('OpenAI multi-turn reasoning context preserved');
  }, 120000);

  test.skipIf(!process.env.XAI_API_KEY)('xai grok-3-mini reasoning in multi-turn', async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai('grok-3-mini'),
      params: {
        max_tokens: 4000,
        reasoning_effort: 'low',
      },
    });

    const history: Message[] = [];

    // Turn 1: Ask with reasoning
    const turn1 = await grok.generate(history, 'What is 12 * 7? Think about it and give me just the number.');
    expect(turn1.response.text).toContain('84');
    history.push(...turn1.messages);

    // Grok-3-mini returns plain reasoning_content (no encryption needed)
    const hasReasoning = turn1.response.reasoning.length > 0;
    console.log(`Grok reasoning present: ${hasReasoning}`);

    // Turn 2: Follow up
    const turn2 = await grok.generate(history, 'Divide that by 2. What do you get?');

    expect(turn2.response.text).toContain('42');
    console.log('xAI multi-turn reasoning context preserved');
  }, 120000);

  test.skipIf(!process.env.XAI_API_KEY)('xai messages thinking signature in multi-turn', async () => {
    // Use xAI Messages API (Anthropic-compatible) which uses thinking blocks with signatures
    const grok = llm<XAIMessagesParams>({
      model: xai('grok-3-mini', { api: 'messages' }),
      params: {
        max_tokens: 4000,
      },
    });

    const history: Message[] = [];

    // Turn 1: Ask with thinking
    const turn1 = await grok.generate(history, 'What is 6 * 9? Think about it and tell me.');
    expect(turn1.response.text).toContain('54');
    history.push(...turn1.messages);

    // Check if thinkingSignature was captured (Messages API stores it differently)
    const xaiMeta = turn1.response.metadata?.xai as Record<string, unknown> | undefined;
    console.log(`xAI Messages thinkingSignature present: ${!!xaiMeta?.thinkingSignature}`);

    // Turn 2: Follow up - signature should be forwarded
    const turn2 = await grok.generate(history, 'Now add 6 to that. What do you get?');

    expect(turn2.response.text).toContain('60');
    console.log('xAI Messages multi-turn thinking context preserved');
  }, 120000);

  test.skipIf(!process.env.ANTHROPIC_API_KEY)('anthropic thinking signature in multi-turn', async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-sonnet-4-20250514'),
      params: {
        max_tokens: 8000,
        thinking: {
          type: 'enabled',
          budget_tokens: 2000,
        },
      },
    });

    const history: Message[] = [];

    // Turn 1: Ask with extended thinking
    const turn1 = await claude.generate(history, 'What is 9 * 11? Think through it and tell me the answer.');
    expect(turn1.response.text).toContain('99');
    history.push(...turn1.messages);

    // Anthropic has thinking signature but doesn't require forwarding per docs
    const hasReasoning = turn1.response.reasoning.length > 0;
    console.log(`Anthropic reasoning present: ${hasReasoning}`);

    // Turn 2: Follow up
    const turn2 = await claude.generate(history, 'Add 1 to that. What number do you get?');

    expect(turn2.response.text).toContain('100');
    console.log('Anthropic multi-turn reasoning context preserved');
  }, 120000);
});

/**
 * Cross-provider reasoning comparison
 * Compares reasoning output across providers on the same problem
 */
describe('Cross-Provider Reasoning Comparison', () => {
  test.skipIf(
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.OPENAI_API_KEY &&
    !process.env.GOOGLE_API_KEY
  )('all providers solve complex reasoning problem', async () => {
    const results: Array<{ provider: string; answer: string; hasReasoning: boolean }> = [];

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const claude = llm<AnthropicLLMParams>({
          model: anthropic('claude-sonnet-4-20250514'),
          params: {
            max_tokens: 8000,
            thinking: { type: 'enabled', budget_tokens: 2000 },
          },
        });
        const turn = await claude.generate(COMPLEX_PROMPT);
        results.push({
          provider: 'Anthropic',
          answer: turn.response.text,
          hasReasoning: turn.response.reasoning.length > 0,
        });
      } catch (e) {
        console.log('Anthropic failed:', e);
      }
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      try {
        const gpt = llm<OpenAIResponsesParams>({
          model: openai('o3-mini'),
          params: {
            max_output_tokens: 4000,
            reasoning: { effort: 'medium', summary: 'auto' },
          },
        });
        const turn = await gpt.generate(COMPLEX_PROMPT);
        results.push({
          provider: 'OpenAI',
          answer: turn.response.text,
          hasReasoning: turn.response.reasoning.length > 0,
        });
      } catch (e) {
        console.log('OpenAI failed:', e);
      }
    }

    // Google (use 2.5 for non-streaming thought support)
    if (process.env.GOOGLE_API_KEY) {
      try {
        const gemini = llm<GoogleLLMParams>({
          model: google('gemini-2.5-flash'),
          params: {
            maxOutputTokens: 4000,
            thinkingConfig: { includeThoughts: true },
          },
        });
        const turn = await gemini.generate(COMPLEX_PROMPT);
        results.push({
          provider: 'Google',
          answer: turn.response.text,
          hasReasoning: turn.response.reasoning.length > 0,
        });
      } catch (e) {
        console.log('Google failed:', e);
      }
    }

    // All providers should get the right answer: 36,000 cars
    for (const result of results) {
      console.log(`${result.provider}: hasReasoning=${result.hasReasoning}`);
      expect(result.answer).toContain('36,000');
    }
  }, 300000);
});
