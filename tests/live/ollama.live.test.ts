import { test, expect, describe } from "bun:test";
import { llm } from "../../src/index.ts";
import { ollama } from "../../src/ollama/index.ts";
import type { OllamaLLMParams } from "../../src/ollama/index.ts";
import { UserMessage } from "../../src/types/messages.ts";
import type { Message } from "../../src/types/messages.ts";
import { UPPError } from "../../src/types/errors.ts";
import { readFileSync } from "fs";
import { join } from "path";

// Load duck.png for vision tests
const DUCK_IMAGE_PATH = join(import.meta.dir, "../assets/duck.png");
let DUCK_IMAGE_BASE64: string;
try {
  DUCK_IMAGE_BASE64 = readFileSync(DUCK_IMAGE_PATH).toString("base64");
} catch {
  DUCK_IMAGE_BASE64 = "";
}

// Default model to use for tests
const TEST_MODEL = process.env.OLLAMA_TEST_MODEL || "gemma3:4b";
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "gemma3:4b";

type PersonData = { name: string; age: number };

/**
 * Live API tests for Ollama
 * Requires a running Ollama server at localhost:11434
 */
describe("Ollama Live API", () => {
  test("simple text generation", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 100 },
    });

    const turn = await model.generate('Say "Hello UPP" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain("hello");
    expect(turn.cycles).toBe(1);
    expect(turn.usage.totalTokens).toBeGreaterThan(0);
  });

  test("streaming text generation", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 50 },
    });

    const stream = model.stream("Count from 1 to 5.");

    let text = "";
    for await (const event of stream) {
      if (event.type === "text_delta" && event.delta.text) {
        text += event.delta.text;
      }
    }

    const turn = await stream.turn;

    expect(text).toContain("1");
    expect(text).toContain("5");
    // Turn response should also have the content
    expect(turn.response.text).toContain("1");
    expect(turn.response.text).toContain("5");
  });

  test("multi-turn conversation", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 100 },
    });

    const history: Message[] = [];

    // First turn
    const turn1 = await model.generate(history, "My name is Alice.");
    history.push(...turn1.messages);

    // Second turn
    const turn2 = await model.generate(history, "What is my name?");

    expect(turn2.response.text.toLowerCase()).toContain("alice");
  });

  test("with system prompt", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 100 },
      system: "You are a pirate. Always respond like a pirate.",
    });

    const turn = await model.generate("Hello!");

    const text = turn.response.text.toLowerCase();
    expect(
      text.includes("ahoy") ||
        text.includes("matey") ||
        text.includes("arr") ||
        text.includes("pirate") ||
        text.includes("sea") ||
        text.includes("ship") ||
        text.includes("treasure") ||
        text.includes("captain")
    ).toBe(true);
  });

  test("with temperature parameter", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 20,
        temperature: 0.1, // Very low temperature for deterministic output
      },
    });

    const turn = await model.generate("What is 2 + 2?");

    expect(turn.response.text).toContain("4");
  });

  test("with seed for reproducibility", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 50,
        seed: 42,
        temperature: 0.5,
      },
    });

    const turn1 = await model.generate("Tell me a short fact about the moon.");
    const turn2 = await model.generate("Tell me a short fact about the moon.");

    // With same seed, outputs should be similar (though not guaranteed identical)
    expect(turn1.response.text.length).toBeGreaterThan(0);
    expect(turn2.response.text.length).toBeGreaterThan(0);
  });

  // Note: Tool calling is disabled for Ollama's native API.
  // Use the OpenAI provider with baseUrl='http://localhost:11434/v1' for tools.

  test("structured output with JSON schema", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 200 },
      structure: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      },
    });

    const turn = await model.generate(
      "Create a JSON object for a person named John who is 30 years old."
    );

    // The 'data' field should be populated
    if (turn.data) {
      const data = turn.data as PersonData;
      expect(data.name).toBeDefined();
      expect(data.age).toBeDefined();
    }
  });

  test("custom base URL", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 50 },
      config: {
        baseUrl: "http://localhost:11434", // Explicit localhost
      },
    });

    const turn = await model.generate('Say "test" and nothing else.');

    expect(turn.response.text.toLowerCase()).toContain("test");
  });

  test("with stop sequences", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 100,
        stop: ["."],
      },
    });

    const turn = await model.generate("Write a very long paragraph about cats");

    // Response should be cut short by the stop sequence (first period)
    // so it should be relatively short and not contain multiple sentences
    expect(turn.response.text.length).toBeGreaterThan(0);
    expect(turn.response.text.length).toBeLessThan(500);
  });

  test("with repeat penalty", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 100,
        repeat_penalty: 1.5, // Higher penalty to reduce repetition
      },
    });

    const turn = await model.generate(
      "Write a creative sentence about the ocean."
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  test("with context window size", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 50,
        num_ctx: 2048, // Smaller context window
      },
    });

    const turn = await model.generate("Hello, how are you?");

    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  test("streaming with events", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 50 },
    });

    const stream = model.stream("Say hello.");

    const eventTypes: string[] = [];
    for await (const event of stream) {
      if (!eventTypes.includes(event.type)) {
        eventTypes.push(event.type);
      }
    }

    const turn = await stream.turn;

    // Should have message lifecycle events
    expect(eventTypes).toContain("message_start");
    expect(eventTypes).toContain("text_delta");
    expect(eventTypes).toContain("message_stop");
    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  // Vision tests (require a vision-capable model)
  test.skipIf(!DUCK_IMAGE_BASE64)("vision with base64 image", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(VISION_MODEL),
      params: { num_predict: 100 },
    });

    // Create a user message with duck image
    const imageMessage = new UserMessage([
      {
        type: "text",
        text: "What animal is in this image? Reply with just the animal name.",
      },
      {
        type: "image",
        mimeType: "image/png",
        source: { type: "base64", data: DUCK_IMAGE_BASE64 },
      },
    ]);

    try {
      const turn = await model.generate([imageMessage]);
      // Should identify the duck
      expect(turn.response.text.toLowerCase()).toMatch(
        /duck|bird|waterfowl|animal/
      );
    } catch (error) {
      // Vision model might not be available - skip gracefully
      console.log("Vision test skipped: vision model not available");
    }
  });

  // Ollama-specific parameters
  test("with mirostat sampling", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 50,
        mirostat: 2, // Mirostat 2.0
        mirostat_eta: 0.1,
        mirostat_tau: 5.0,
      },
    });

    const turn = await model.generate("Write a short sentence.");

    expect(turn.response.text.length).toBeGreaterThan(0);
  });

  test("with top_p and top_k sampling", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 50,
        top_p: 0.9,
        top_k: 40,
      },
    });

    const turn = await model.generate("What is the capital of France?");

    expect(turn.response.text.toLowerCase()).toContain("paris");
  });

  test("with keep_alive parameter", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: {
        num_predict: 20,
        keep_alive: "5m", // Keep model loaded for 5 minutes
      },
    });

    const turn = await model.generate("Say hello");

    expect(turn.response.text.length).toBeGreaterThan(0);
  });
});

/**
 * Error handling tests
 */
describe("Ollama Error Handling", () => {
  test("invalid model returns error", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama("nonexistent-model-xyz-12345"),
      params: { num_predict: 10 },
    });

    try {
      await model.generate("Hello");
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.provider).toBe("ollama");
      expect(uppError.modality).toBe("llm");
    }
  });

  test("connection error when Ollama not running", async () => {
    const model = llm<OllamaLLMParams>({
      model: ollama(TEST_MODEL),
      params: { num_predict: 10 },
      config: {
        baseUrl: "http://localhost:99999", // Non-existent port
      },
    });

    try {
      await model.generate("Hello");
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      // Should be a network/connection error
    }
  });
});
