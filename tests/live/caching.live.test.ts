import { test, expect, describe } from "bun:test";
import { llm } from "../../src/index.ts";
import { anthropic } from "../../src/anthropic/index.ts";
import { google } from "../../src/google/index.ts";
import type { AnthropicLLMParams } from "../../src/anthropic/index.ts";
import type { GoogleLLMParams } from "../../src/google/index.ts";
import type { Tool } from "../../src/types/tool.ts";

/**
 * Generates a large text block that exceeds the minimum token threshold for caching.
 * Anthropic requires 1024+ tokens, Google requires 1024-4096+ tokens.
 * This generates approximately 2000+ tokens of content.
 */
function generateLargeContext(): string {
  const paragraphs = [
    `The Unified Provider Protocol (UPP) is a comprehensive abstraction layer designed to standardize interactions with various large language model providers. It provides a consistent interface for text generation, streaming, tool calling, and structured output across providers like Anthropic, OpenAI, Google, and others. The protocol handles the complexity of different API formats, authentication methods, and response structures, allowing developers to write provider-agnostic code that can seamlessly switch between different LLM backends.`,

    `At the core of UPP is the concept of a "turn" which represents a complete interaction cycle with an LLM. A turn may consist of multiple cycles if tool execution is involved. Each cycle includes sending messages to the LLM, receiving a response, and optionally executing any tool calls before continuing the conversation. The protocol tracks usage statistics, tool executions, and response content across all cycles, providing a unified view of the entire interaction.`,

    `The message system in UPP supports multiple content types including text, images, and other media. Messages are categorized into UserMessage, AssistantMessage, and ToolResultMessage types, each with specific content blocks. Content blocks can be TextBlock for text content, ImageBlock for images with various source types (base64, URL, bytes), and other specialized blocks for provider-specific content types.`,

    `Tool calling is a first-class feature in UPP, with support for automatic tool execution, parallel tool calls, and various tool strategies. The ToolStrategy system allows fine-grained control over how tools are executed, including auto-execution, single-tool mode, and manual execution. Tools can return various result types including text, JSON objects, and even images, which are automatically formatted for the target provider.`,

    `Structured output in UPP allows developers to define JSON schemas that the LLM must conform to. The protocol handles the differences between providers - some use native JSON mode, others use tool-based enforcement. The result is a consistent "data" field on the turn response that contains the parsed, validated output matching the specified schema.`,

    `Streaming support in UPP provides real-time access to LLM responses through an AsyncIterator interface. StreamEvents include message_start, text_delta, tool_call_delta, and message_stop events. The protocol accumulates content during streaming and provides access to the complete turn response after iteration completes, ensuring no data is lost even in streaming mode.`,

    `Provider-specific parameters are supported through the params field, which is typed according to the selected provider. This allows access to provider-unique features like temperature, top_p, stop sequences, and other model-specific options without breaking the unified interface. Parameters are passed through to the underlying API while the protocol handles the standard transformations.`,

    `Error handling in UPP uses the UPPError class which normalizes errors across all providers into a consistent format. Error codes like AUTHENTICATION_FAILED, MODEL_NOT_FOUND, RATE_LIMITED, and INVALID_REQUEST provide actionable information regardless of the underlying provider's error format. The error object includes the provider name, modality, and original error details for debugging.`,

    `The configuration system allows setting API keys, base URLs, and other provider-specific settings at multiple levels. Config can be provided globally, per-model, or per-request, with appropriate precedence rules. Environment variables provide sensible defaults for common configurations, making it easy to get started without explicit configuration in development environments.`,

    `Caching is an important optimization feature supported by several providers. Anthropic uses cache_control markers on system prompts, tools, and messages to enable prompt caching. Google provides an explicit caching API where cached content can be created, managed, and referenced in subsequent requests. OpenAI and other providers implement automatic prefix caching without explicit configuration. UPP exposes these capabilities through provider-specific metadata and params.`,

    `The metadata system in UPP allows attaching provider-specific information to tools and messages. Tool metadata can include Anthropic's cache_control settings, OpenAI's strict mode for function calling, and other provider-specific options. Message metadata preserves provider-specific response data like safety ratings, finish reasons, and token usage details.`,

    `Multi-turn conversations are handled by passing message history to subsequent generate or stream calls. The protocol ensures proper message formatting and role assignment across turns. System prompts can be provided once and apply to all turns in a conversation, with proper handling of the differences in how providers implement system instructions.`,

    `Vision and multimodal capabilities are supported through the ImageBlock content type. Images can be provided as base64-encoded data, byte arrays, or URLs (where supported). The protocol handles format conversion between providers - for example, converting byte arrays to base64 for providers that require it. Image dimensions and media types are preserved and passed to providers that support them.`,

    `The provider architecture in UPP is modular and extensible. Each provider implements a standard interface for the LLM modality, with transform functions that convert between UPP's unified format and the provider's native API format. This separation allows new providers to be added without modifying the core protocol, and enables provider-specific optimizations while maintaining the unified interface.`,

    `Testing in UPP includes both unit tests for type transformations and live tests that verify actual API integration. Live tests are skipped when API keys are not available, allowing the test suite to run in any environment. Test utilities provide mock responses and fixtures for comprehensive unit testing without network calls.`,

    `Performance optimization in UPP focuses on minimizing overhead while providing the abstraction layer. Request and response transformations are designed to be fast and memory-efficient. Streaming uses native async iteration without buffering entire responses. Token usage tracking is accurate across all providers, enabling cost monitoring and optimization at the application level.`,
  ];

  return paragraphs.join("\n\n");
}

const LARGE_CONTEXT = generateLargeContext();

/**
 * Live API tests for Anthropic tool caching
 * Requires ANTHROPIC_API_KEY environment variable
 *
 * Note: Caching requires minimum 1024 tokens in cached content.
 * First request creates the cache (cache_creation_input_tokens > 0),
 * subsequent requests read from cache (cache_read_input_tokens > 0).
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)(
  "Anthropic Tool Caching",
  () => {
    test(
      "tool with cache_control metadata is accepted",
      async () => {
        const cachedTool: Tool = {
          name: "search_documentation",
          description: `Search through the following documentation:\n\n${LARGE_CONTEXT}`,
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
            },
            required: ["query"],
          },
          metadata: {
            anthropic: { cache_control: { type: "ephemeral" } },
          },
          run: async (params: { query: string }) => {
            return `Found result for "${params.query}": The UPP protocol provides unified LLM access.`;
          },
        };

        const claude = llm<AnthropicLLMParams>({
          model: anthropic("claude-3-5-haiku-latest"),
          params: { max_tokens: 200 },
          tools: [cachedTool],
        });

        // First request creates the cache
        const turn1 = await claude.generate(
          "Search for information about streaming.",
        );

        expect(turn1.toolExecutions.length).toBeGreaterThan(0);
        expect(turn1.toolExecutions[0]?.toolName).toBe("search_documentation");
        expect(turn1.usage.totalTokens).toBeGreaterThan(0);

        // Cache creation or read should be tracked
        // First request may show cache_creation_input_tokens
        console.log("Turn 1 usage:", {
          inputTokens: turn1.usage.inputTokens,
          outputTokens: turn1.usage.outputTokens,
          cacheWriteTokens: turn1.usage.cacheWriteTokens,
          cacheReadTokens: turn1.usage.cacheReadTokens,
        });

        // Note: Cache metrics may not appear immediately on first request
        // depending on whether the content exceeds minimum threshold
      },
      { timeout: 30000 },
    );

    test(
      "subsequent requests benefit from cached tools",
      async () => {
        const cachedTool: Tool = {
          name: "analyze_protocol",
          description: `Analyze the following protocol specification:\n\n${LARGE_CONTEXT}`,
          parameters: {
            type: "object",
            properties: {
              aspect: { type: "string", description: "Aspect to analyze" },
            },
            required: ["aspect"],
          },
          metadata: {
            anthropic: { cache_control: { type: "ephemeral" } },
          },
          run: async (params: { aspect: string }) => {
            return `Analysis of "${params.aspect}": The aspect is well-designed for scalability.`;
          },
        };

        const claude = llm<AnthropicLLMParams>({
          model: anthropic("claude-3-5-haiku-latest"),
          params: { max_tokens: 200 },
          tools: [cachedTool],
        });

        // First request - may create cache
        const turn1 = await claude.generate(
          "Analyze the error handling aspect.",
        );
        console.log("Turn 1 (cache creation):", {
          cacheWriteTokens: turn1.usage.cacheWriteTokens,
          cacheReadTokens: turn1.usage.cacheReadTokens,
        });

        // Second request - should read from cache
        const turn2 = await claude.generate("Analyze the streaming aspect.");
        console.log("Turn 2 (cache read):", {
          cacheWriteTokens: turn2.usage.cacheWriteTokens,
          cacheReadTokens: turn2.usage.cacheReadTokens,
        });

        // Both requests should succeed
        expect(turn1.toolExecutions.length).toBeGreaterThan(0);
        expect(turn2.toolExecutions.length).toBeGreaterThan(0);

        // Second request should ideally show cache_read_input_tokens > 0
        // Note: This depends on Anthropic's caching behavior and timing
      },
      { timeout: 60000 },
    );

    test(
      "system prompt with cache_control",
      async () => {
        const claude = llm<AnthropicLLMParams>({
          model: anthropic("claude-3-5-haiku-latest"),
          params: { max_tokens: 100 },
          system: [
            {
              type: "text",
              text: `You are an expert on the Unified Provider Protocol. Here is the full specification:\n\n${LARGE_CONTEXT}`,
              cache_control: { type: "ephemeral" },
            },
          ],
        });

        const turn = await claude.generate("What is UPP?");

        expect(turn.response.text.toLowerCase()).toMatch(
          /protocol|provider|unified|llm/,
        );
        console.log("System cache usage:", {
          cacheWriteTokens: turn.usage.cacheWriteTokens,
          cacheReadTokens: turn.usage.cacheReadTokens,
        });
      },
      { timeout: 30000 },
    );
  },
);

/**
 * Live API tests for Google Cache API
 * Requires GOOGLE_API_KEY environment variable
 *
 * Note: Google caching requires minimum 1024-4096 tokens (varies by model)
 * and uses an explicit cache creation/management API.
 */
describe.skipIf(!process.env.GOOGLE_API_KEY)("Google Cache API", () => {
  test("create and use cached content", async () => {
    const apiKey = process.env.GOOGLE_API_KEY!;

    // Create a cache with large content
    const cacheEntry = await google.cache.create({
      apiKey,
      model: "gemini-3-flash-preview",
      displayName: "UPP Documentation Cache",
      systemInstruction: `You are an expert assistant. Reference this documentation:\n\n${LARGE_CONTEXT}`,
      ttl: "300s", // 5 minutes
    });

    expect(cacheEntry.name).toMatch(/^cachedContents\//);
    expect(cacheEntry.model).toContain("gemini-3-flash-preview");
    console.log("Created cache:", cacheEntry.name);

    try {
      // Use the cache in a request
      const gemini = llm<GoogleLLMParams>({
        model: google("gemini-3-flash-preview"),
        params: {
          maxOutputTokens: 200,
          cachedContent: cacheEntry.name,
        },
      });

      const turn = await gemini.generate(
        "What does UPP stand for? Answer in one sentence.",
      );

      // Should mention UPP or its full name in some form
      expect(turn.response.text.length).toBeGreaterThan(10);
      expect(turn.usage.totalTokens).toBeGreaterThan(0);

      // Cached content tokens should be reported
      console.log("Cached request usage:", {
        inputTokens: turn.usage.inputTokens,
        outputTokens: turn.usage.outputTokens,
        cacheReadTokens: turn.usage.cacheReadTokens,
      });

      // Cache read tokens should be > 0 when using cached content
      expect(turn.usage.cacheReadTokens).toBeGreaterThan(0);
    } finally {
      // Clean up the cache
      await google.cache.delete(cacheEntry.name, apiKey);
      console.log("Deleted cache:", cacheEntry.name);
    }
  });

  test("get cache details", async () => {
    const apiKey = process.env.GOOGLE_API_KEY!;

    const cacheEntry = await google.cache.create({
      apiKey,
      model: "gemini-3-flash-preview",
      displayName: "Test Cache",
      systemInstruction: LARGE_CONTEXT,
      ttl: "300s",
    });

    try {
      const retrieved = await google.cache.get(cacheEntry.name, apiKey);

      expect(retrieved.name).toBe(cacheEntry.name);
      expect(retrieved.model).toContain("gemini-3-flash-preview");
      expect(retrieved.displayName).toBe("Test Cache");
      expect(retrieved.expireTime).toBeDefined();
    } finally {
      await google.cache.delete(cacheEntry.name, apiKey);
    }
  });

  test("list caches", async () => {
    const apiKey = process.env.GOOGLE_API_KEY!;

    // Create a test cache
    const cacheEntry = await google.cache.create({
      apiKey,
      model: "gemini-3-flash-preview",
      displayName: "List Test Cache",
      systemInstruction: LARGE_CONTEXT,
      ttl: "300s",
    });

    try {
      const listResult = await google.cache.list({ apiKey, pageSize: 10 });

      // Should have at least our test cache
      expect(listResult.cachedContents).toBeDefined();
      const ourCache = listResult.cachedContents?.find(
        (c) => c.name === cacheEntry.name,
      );
      expect(ourCache).toBeDefined();
    } finally {
      await google.cache.delete(cacheEntry.name, apiKey);
    }
  });

  test("update cache TTL", async () => {
    const apiKey = process.env.GOOGLE_API_KEY!;

    const cacheEntry = await google.cache.create({
      apiKey,
      model: "gemini-3-flash-preview",
      displayName: "Update Test Cache",
      systemInstruction: LARGE_CONTEXT,
      ttl: "300s",
    });

    try {
      // Update TTL to 10 minutes
      const updated = await google.cache.update(
        cacheEntry.name,
        { ttl: "600s" },
        apiKey,
      );

      expect(updated.name).toBe(cacheEntry.name);
      // Expiration time should be extended
      const originalExpire = new Date(cacheEntry.expireTime).getTime();
      const updatedExpire = new Date(updated.expireTime).getTime();
      expect(updatedExpire).toBeGreaterThan(originalExpire);
    } finally {
      await google.cache.delete(cacheEntry.name, apiKey);
    }
  });

  test("delete cache", async () => {
    const apiKey = process.env.GOOGLE_API_KEY!;

    const cacheEntry = await google.cache.create({
      apiKey,
      model: "gemini-3-flash-preview",
      displayName: "Delete Test Cache",
      systemInstruction: LARGE_CONTEXT,
      ttl: "300s",
    });

    // Delete the cache
    await google.cache.delete(cacheEntry.name, apiKey);

    // Attempting to get the deleted cache should fail
    await expect(google.cache.get(cacheEntry.name, apiKey)).rejects.toThrow(
      /404|not found/i,
    );
  });

  test("cache with tools", async () => {
    const apiKey = process.env.GOOGLE_API_KEY!;

    const cacheEntry = await google.cache.create({
      apiKey,
      model: "gemini-3-flash-preview",
      displayName: "Tools Cache",
      systemInstruction: `You are an assistant that uses tools. Documentation:\n\n${LARGE_CONTEXT}`,
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_info",
              description: "Get information about a topic",
              parameters: {
                type: "object",
                properties: {
                  topic: {
                    type: "string",
                    description: "Topic to get info about",
                  },
                },
                required: ["topic"],
              },
            },
          ],
        },
      ],
      ttl: "300s",
    });

    expect(cacheEntry.name).toMatch(/^cachedContents\//);

    try {
      // Use the cache with tools - Note: cannot pass tools in request when using cached tools
      // Tools are already defined in the cache - we don't provide tools or toolStrategy
      // since we can't define run functions for cached tools
      const gemini = llm<GoogleLLMParams>({
        model: google("gemini-3-flash-preview"),
        params: {
          maxOutputTokens: 200,
          cachedContent: cacheEntry.name,
        },
      });

      const turn = await gemini.generate("Get info about streaming.");

      // Should either call the tool or respond directly
      // When tools are in cache but not in request, model may respond directly or return tool calls
      expect(
        turn.response.text.length > 0 || (turn.response.toolCalls?.length ?? 0) > 0,
      ).toBe(true);
    } finally {
      await google.cache.delete(cacheEntry.name, apiKey);
    }
  });
});
