import { test, expect, describe } from "bun:test";
import { llm } from "../../src/index.ts";
import { anthropic } from "../../src/anthropic/index.ts";
import { openai } from "../../src/openai/index.ts";
import { google } from "../../src/google/index.ts";
import { openrouter } from "../../src/openrouter/index.ts";
import { xai } from "../../src/xai/index.ts";
import type { AnthropicLLMParams } from "../../src/anthropic/index.ts";
import type { OpenAICompletionsParams } from "../../src/openai/index.ts";
import type { GoogleLLMParams } from "../../src/google/index.ts";
import type { OpenRouterCompletionsParams } from "../../src/openrouter/index.ts";
import type { XAICompletionsParams } from "../../src/xai/index.ts";

/**
 * Live API tests for custom header passthrough
 *
 * These tests verify that custom headers are properly passed to provider APIs.
 * Since we can't directly inspect server-received headers, we verify:
 * 1. Custom headers don't break API calls
 * 2. Provider-specific headers are accepted (e.g., anthropic-beta)
 * 3. Streaming works with custom headers
 */

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("Anthropic Headers", () => {
  test("accepts custom headers without breaking request", async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic("claude-3-5-haiku-latest"),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "X-Custom-Test": "test-value",
        },
      },
    });

    const turn = await claude.generate('Say "headers work" and nothing else.');
    expect(turn.response.text.toLowerCase()).toContain("headers");
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test("accepts anthropic-beta header for extended cache TTL", async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic("claude-3-5-haiku-latest"),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "anthropic-beta": "extended-cache-ttl-2025-04-11",
        },
      },
    });

    const turn = await claude.generate('Say "beta enabled" and nothing else.');
    expect(turn.response.text.toLowerCase()).toContain("beta");
  });

  test("streaming works with custom headers", async () => {
    const claude = llm<AnthropicLLMParams>({
      model: anthropic("claude-3-5-haiku-latest"),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "anthropic-beta": "extended-cache-ttl-2025-04-11",
        },
      },
    });

    const stream = claude.stream("Count from 1 to 3.");

    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
      }
    }

    expect(text).toContain("1");
    expect(text).toContain("3");
  });
});

describe.skipIf(!process.env.OPENAI_API_KEY)("OpenAI Headers", () => {
  test("accepts custom headers without breaking request", async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai("gpt-4o-mini", { api: "completions" }),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "X-Custom-Test": "test-value",
        },
      },
    });

    const turn = await gpt.generate('Say "headers work" and nothing else.');
    expect(turn.response.text.toLowerCase()).toContain("headers");
  });

  test("accepts OpenAI-specific headers", async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai("gpt-4o-mini", { api: "completions" }),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "X-Client-Request-Id": "test-trace-id-12345",
        },
      },
    });

    const turn = await gpt.generate('Say "trace enabled" and nothing else.');
    expect(turn.response.text.toLowerCase()).toContain("trace");
  });

  test("streaming works with custom headers", async () => {
    const gpt = llm<OpenAICompletionsParams>({
      model: openai("gpt-4o-mini", { api: "completions" }),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "X-Client-Request-Id": "test-trace-id-stream",
        },
      },
    });

    const stream = gpt.stream("Count from 1 to 3.");

    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
      }
    }

    expect(text).toContain("1");
    expect(text).toContain("3");
  });
});

describe.skipIf(!process.env.GOOGLE_API_KEY)("Google Headers", () => {
  test("accepts custom headers without breaking request", async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google("gemini-2.0-flash"),
      params: { maxOutputTokens: 50 },
      config: {
        headers: {
          "x-goog-api-client": "upp-test/1.0.0",
        },
      },
    });

    const turn = await gemini.generate('Say "headers work" and nothing else.');
    expect(turn.response.text.toLowerCase()).toContain("headers");
  });

  test("streaming works with custom headers", async () => {
    const gemini = llm<GoogleLLMParams>({
      model: google("gemini-2.0-flash"),
      params: { maxOutputTokens: 50 },
      config: {
        headers: {
          "x-goog-api-client": "upp-test/1.0.0",
        },
      },
    });

    const stream = gemini.stream("Count from 1 to 3.");

    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
      }
    }

    expect(text).toContain("1");
    expect(text).toContain("3");
  });
});

describe.skipIf(!process.env.OPENROUTER_API_KEY)("OpenRouter Headers", () => {
  test("accepts attribution headers", async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter("openai/gpt-4o-mini", { api: "completions" }),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "HTTP-Referer": "https://upp-test.example.com",
          "X-Title": "UPP Header Test",
        },
      },
    });

    const turn = await model.generate(
      'Say "attribution works" and nothing else.',
    );
    expect(turn.response.text.toLowerCase()).toContain("attribution");
  });

  test("streaming works with attribution headers", async () => {
    const model = llm<OpenRouterCompletionsParams>({
      model: openrouter("openai/gpt-4o-mini", { api: "completions" }),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "HTTP-Referer": "https://upp-test.example.com",
          "X-Title": "UPP Header Test",
        },
      },
    });

    const stream = model.stream("Count from 1 to 3.");

    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
      }
    }

    expect(text).toContain("1");
    expect(text).toContain("3");
  });
});

describe.skipIf(!process.env.XAI_API_KEY)("xAI Headers", () => {
  test("accepts custom headers without breaking request", async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai("grok-3-mini-fast"),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "X-Client-Request-Id": "xai-test-trace-id",
        },
      },
    });

    const turn = await grok.generate('Say "headers work" and nothing else.');
    expect(turn.response.text.toLowerCase()).toContain("headers");
  });

  test("streaming works with custom headers", async () => {
    const grok = llm<XAICompletionsParams>({
      model: xai("grok-3-mini-fast"),
      params: { max_tokens: 50 },
      config: {
        headers: {
          "X-Client-Request-Id": "xai-test-trace-stream",
        },
      },
    });

    const stream = grok.stream("Count from 1 to 3.");

    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
      }
    }

    expect(text).toContain("1");
    expect(text).toContain("3");
  });
});
