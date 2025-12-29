# UPP-1.1: Unified Provider Protocol Specification

**Version:** 1.1.0-draft
**Status:** Draft
**Authors:** UPP Working Group

---

## Abstract

UPP (Unified Provider Protocol) is a first-generation standard for simplifying AI inference and enabling multi-provider interoperability. The protocol defines uniform interfaces for interacting with Large Language Models, Embedding Models, Image Generation Models, and other AI inference APIs through modality-specific, consistent developer experiences.

UPP provides separate entry points for each modality—`llm()`, `embedding()`, `image()`—while sharing common provider infrastructure, configuration patterns, and design principles.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [Core Concepts](#3-core-concepts)
4. [Provider Protocol](#4-provider-protocol)
5. [llm() Interface](#5-llm-interface)
6. [Messages](#6-messages)
7. [Turns](#7-turns)
8. [Threads](#8-threads)
9. [Streaming](#9-streaming)
10. [Tools](#10-tools)
11. [Structured Outputs](#11-structured-outputs)
12. [embedding() Interface](#12-embedding-interface)
13. [image() Interface](#13-image-interface)
14. [Type Definitions](#14-type-definitions)
15. [Provider Implementation Guide](#15-provider-implementation-guide)
16. [Conformance](#16-conformance)

---

## 1. Introduction

### 1.1 Purpose

Modern AI development requires interacting with multiple providers (Anthropic, OpenAI, Google, Stability, Voyage, etc.), each with distinct APIs, authentication schemes, and response formats. UPP-1.1 establishes a standard protocol that:

- Provides modality-specific interfaces (`llm`, `embedding`, `image`)
- Enables provider switching without application code changes
- Maintains provider-native configuration to avoid abstraction leakage
- Shares common infrastructure (auth, retry, HTTP) across modalities
- Supports text, image, audio, video, embeddings, and future modalities

### 1.2 Scope

This specification covers:

- The `llm()` function interface (chat/completion)
- The `embedding()` function interface (vector embeddings)
- The `image()` function interface (image generation)
- Provider adapter requirements for each modality
- Shared infrastructure (ProviderConfig, KeyStrategy, error handling)
- Message, Turn, and Thread data structures (LLM-specific)
- Streaming response handling
- Tool definition and execution

### 1.3 Terminology

| Term | Definition |
|------|------------|
| **Provider** | A vendor-specific adapter exposing one or more modality interfaces |
| **Modality** | A distinct AI capability: LLM, embedding, image generation, etc. |
| **BoundModel** | A model instance bound to a specific provider and model ID |
| **Message** | A single message in an LLM conversation (user, assistant, or tool result) |
| **Turn** | The complete result of one LLM inference call, containing all messages produced |
| **StreamEvent** | A streaming event (lifecycle or content delta) |
| **Thread** | A utility class for managing LLM conversation history |
| **Embedding** | A vector representation of text or other content |
| **UPP** | Unified Provider Protocol |

### 1.4 Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

### 1.5 Modality Overview

| Entry Point | Purpose | Example Models |
|-------------|---------|----------------|
| `llm()` | Chat, completion, reasoning | Claude, GPT-4, Gemini |
| `embedding()` | Vector embeddings | text-embedding-3, Voyage, Cohere |
| `image()` | Image generation/editing | DALL-E, Stable Diffusion, Imagen |

Future modalities may include:
- `audio()` - Speech-to-text, text-to-speech
- `video()` - Video generation

---

## 2. Design Principles

### 2.1 Provider Transparency

Configuration passes through to providers unchanged. UPP does not impose its own defaults or transform model parameters. When no config is supplied, provider defaults apply.

**Rationale:** Developers should reference provider documentation directly. UPP avoids "morphic magic" that obscures what's actually sent to the API.

### 2.2 Explicit Over Magic

UPP favors explicit APIs over implicit behavior:

- Separate entry points per modality—no modal switches or runtime detection
- `generate()` for complete responses, `stream()` for streaming—no await/non-await magic
- Users manage their own conversation history—no hidden state mutation
- System prompts declared at configuration, not buried in message arrays

### 2.3 Modality-Specific Interfaces

Each modality gets a purpose-built interface optimized for its use case:

- **LLM**: Conversational with messages, turns, streaming, tools
- **Embedding**: Batch-oriented, returns vectors, no conversation
- **Image**: Prompt-based, returns images, supports editing/variation

Forcing all modalities through a single interface creates awkward abstractions.

### 2.4 Shared Infrastructure

While interfaces differ, providers share common infrastructure:

- `ProviderConfig` (apiKey, baseUrl, timeout, retry)
- `KeyStrategy` (RoundRobin, Weighted, Dynamic)
- Error handling (`UPPError`, `ErrorCode`)
- HTTP utilities (SSE parsing, request building)

### 2.5 Progressive Complexity

Simple use cases require minimal code. Advanced features (tools, custom strategies, provider config) are opt-in.

### 2.6 Interoperability Where Possible

UPP enables provider switching for common operations. However, provider-specific features may not translate. The protocol does not guarantee feature parity—it guarantees interface consistency.

### 2.7 HTTP-First Provider Implementation

UPP **strongly recommends** that providers wrap vendor REST APIs directly using native HTTP primitives (e.g., `fetch`) rather than depending on first-party vendor SDKs.

**Rationale:**

- **Minimal dependencies:** Avoid pulling in large SDK packages and their transitive dependencies
- **Full control:** Direct HTTP access allows providers to manage request/response transformation, streaming, retries, and timeouts without SDK abstractions interfering
- **Consistency:** All providers follow the same HTTP-based pattern
- **Transparency:** Developers can inspect exactly what's sent over the wire
- **Bundle size:** Critical for edge deployments and browser environments

Providers MAY use vendor SDKs if there's a compelling reason, but this should be the exception.

---

## 3. Core Concepts

### 3.1 The Unified Provider Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Code                             │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
    │    llm()    │     │   embedding()    │     │   image()   │
    │             │     │              │     │             │
    └─────────────┘     └──────────────┘     └─────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                  Provider Adapters                           │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
    │  │anthropic │  │  openai  │  │  google  │  │stability │     │
    │  │  (LLM)   │  │(LLM,Emb, │  │(LLM,Emb, │  │ (Image)  │     │
    │  │          │  │  Image)  │  │  Image)  │  │          │     │
    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Vendor APIs                               │
    │         (Anthropic, OpenAI, Google, Stability, etc.)        │
    └─────────────────────────────────────────────────────────────┘
```

### 3.2 Import Patterns

UPP exports both a namespace object and individual functions, giving developers flexibility in import style:

```ts
// @providerprotocol/ai/index.ts
export const llm = (...) => { ... };
export const embedding = (...) => { ... };
export const image = (...) => { ... };

export const ai = { llm, embedding, image };
```

**Namespace style (recommended for clarity):**

```ts
import { ai } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';

const claude = ai.llm({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'You are a helpful assistant.',
});

const embedder = ai.embedding({
  model: anthropic('voyage-3'),
});
```

**Direct import style (shorter, user accepts collision risk):**

```ts
import { llm, embedding } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const gpt = llm({ model: openai('gpt-4o') });
const embedder = embedding({ model: openai('text-embedding-3-small') });
```

**Mix and match:**

```ts
import { ai, llm } from '@providerprotocol/ai';

// Use direct import for frequently-used functions
const claude = llm({ ... });

// Use namespace for less common modalities
const imageGen = ai.image({ ... });
```

### 3.3 Provider Structure

A provider exports a single factory function that returns a `ModelReference`. The same factory works with any modality—the model ID determines which handler is used:

```ts
import { openai } from '@providerprotocol/ai/openai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { stability } from '@providerprotocol/ai/stability';

// Same openai() factory works with all modalities
llm({ model: openai('gpt-4o') });
embedding({ model: openai('text-embedding-3-small') });
image({ model: openai('dall-e-3') });

// Providers that only support one modality still use the same pattern
llm({ model: anthropic('claude-sonnet-4-20250514') });
image({ model: stability('stable-diffusion-xl-1024-v1-0') });
```

Internally, each provider combines modality handlers:

```ts
// @providerprotocol/ai/openai/index.ts
import { createLLMHandler } from './llm';
import { createEmbeddingHandler } from './embed';
import { createImageHandler } from './image';

export const openai = createProvider({
  name: 'openai',
  modalities: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
    image: createImageHandler(),
  },
});
```

### 3.4 Data Flow

#### LLM Data Flow

1. Developer calls `llm()` with a provider-bound model
2. Developer calls `generate()` or `stream()` with message history and new input
3. Provider transforms input to vendor-specific format
4. Provider handles tool execution loop (if tools configured)
5. Provider returns a `Turn` containing all messages from this inference
6. Developer appends turn messages to their history for future calls

#### Embedding Data Flow

1. Developer calls `embedding()` with a provider-bound model to create an embedder instance
2. Developer calls `embed()` or `embedBatch()` on the embedder with text/content
3. Provider transforms input to vendor-specific format
4. Provider returns `Embedding` or `EmbeddingBatch` with vectors
5. Developer uses vectors for search, clustering, etc.

#### Image Data Flow

1. Developer calls `image()` with a provider-bound model
2. Developer calls `generate()`, `edit()`, or `vary()` with prompt/images
3. Provider transforms input to vendor-specific format
4. Provider returns `ImageResult` with generated images
5. Developer saves or displays images

### 3.5 Separation of Concerns

UPP separates configuration into distinct layers:

| Layer | Purpose | Shared Across Modalities |
|-------|---------|--------------------------|
| **Provider Config** | Infrastructure/connection settings | Yes |
| **Model Params** | Model behavior parameters | No (modality-specific) |
| **Modality Options** | Interface-specific settings | No |

```ts
import { openai } from '@providerprotocol/ai/openai';

// Provider config is shared
const config: ProviderConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
};

// Same openai() factory, different modalities
const llm = llm({
  model: openai('gpt-4o'),
  config,
  params: { temperature: 0.7, max_tokens: 4096 },  // LLM params
  system: 'You are a helpful assistant.',
  tools: [getWeather],
});

const embedder = embedding({
  model: openai('text-embedding-3-large'),
  config,
  params: { dimensions: 1536 },  // Embedding params
});

const imageGen = image({
  model: openai('dall-e-3'),
  config,
  params: { size: '1024x1024', quality: 'hd' },  // Image params
});
```

---

## 4. Provider Protocol

### 4.1 Shared Provider Infrastructure

All providers share common configuration and error handling:

```ts
interface ProviderConfig {
  /**
   * API key - string, async function, or key strategy
   * @example 'sk-xxx'
   * @example () => fetchKeyFromVault()
   * @example new RoundRobinKeys(['sk-1', 'sk-2'])
   */
  apiKey?: string | (() => string | Promise<string>) | KeyStrategy;

  /** Override the base API URL (for proxies, local models) */
  baseUrl?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Custom fetch implementation (for logging, caching, custom TLS) */
  fetch?: typeof fetch;

  /** API version override */
  apiVersion?: string;

  /** Retry strategy for handling failures and rate limits */
  retryStrategy?: RetryStrategy;
}
```

#### Provider-Specific Options

`ProviderConfig` defines common infrastructure settings shared across all providers. However, some providers may offer additional options for vendor-specific operational choices—for example, selecting between different API variants.

These options are passed to the **provider factory function**, not to `ProviderConfig`:

```ts
// Provider factory signature with optional options
function openai(modelId: string, options?: OpenAIProviderOptions): ModelReference;

interface OpenAIProviderOptions {
  /**
   * Which API to use:
   * - 'responses': Modern Responses API (default, recommended)
   * - 'completions': Legacy Chat Completions API
   */
  api?: 'responses' | 'completions';
}
```

Usage:

```ts
// Use the modern Responses API (default)
const gpt = llm({
  model: openai('gpt-4o'),
});

// Explicitly use the legacy Completions API
const gptLegacy = llm({
  model: openai('gpt-4o', { api: 'completions' }),
});
```

Provider options should be:
- **Rare**: Most providers need no options beyond the model ID
- **Well-documented**: Clearly explain when and why each option is needed
- **Defaulted sensibly**: The provider should work without any options

Note: Fundamentally different deployment targets (e.g., Google Vertex AI vs standard Gemini API) should be implemented as **separate providers** rather than options on a single provider.

### 4.2 Key Strategies

UPP provides built-in key strategies for API key management:

```ts
interface KeyStrategy {
  /** Get the next API key to use */
  getKey(): string | Promise<string>;
}

/** Round-robin through a list of API keys */
class RoundRobinKeys implements KeyStrategy {
  constructor(keys: string[]);
  getKey(): string;
}

/** Weighted random selection */
class WeightedKeys implements KeyStrategy {
  constructor(keys: Array<{ key: string; weight: number }>);
  getKey(): string;
}

/** Dynamic key selection based on custom logic */
class DynamicKey implements KeyStrategy {
  constructor(selector: () => string | Promise<string>);
  getKey(): Promise<string>;
}
```

### 4.3 Retry Strategies

```ts
interface RetryStrategy {
  /**
   * Called when a request fails with a retryable error.
   * @param error - The error that occurred
   * @param attempt - The attempt number (1 = first retry)
   * @returns Delay in ms before retrying, or null to stop retrying
   */
  onRetry(error: UPPError, attempt: number): number | null | Promise<number | null>;

  /**
   * Called before each request. Can be used to implement pre-emptive rate limiting.
   * Returns delay in ms to wait before making the request, or 0 to proceed immediately.
   */
  beforeRequest?(): number | Promise<number>;

  /**
   * Reset the strategy state (e.g., after a successful request)
   */
  reset?(): void;
}
```

Reference implementations (`ExponentialBackoff`, `LinearBackoff`, `NoRetry`, `TokenBucket`, `RetryAfterStrategy`) are provided by the UPP library. Custom strategies can be implemented by conforming to the `RetryStrategy` interface.

```ts
// Custom strategy example
class MyCustomStrategy implements RetryStrategy {
  onRetry(error: UPPError, attempt: number): number | null {
    if (attempt >= 5) return null;
    return error.code === 'RATE_LIMITED' ? 5000 : 1000;
  }
}
```

### 4.4 Error Handling

All modalities normalize errors to `UPPError`:

```ts
class UPPError extends Error {
  readonly code: ErrorCode;
  readonly provider: string;
  readonly modality: Modality;
  readonly statusCode?: number;
  readonly cause?: Error;
}

type ErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'      // Response failed validation (e.g., structured output)
  | 'CONTENT_FILTERED'      // Content policy violation
  | 'QUOTA_EXCEEDED'        // Usage limits
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED';

type Modality = 'llm' | 'embedding' | 'image' | 'audio' | 'video';
```

### 4.5 Provider and ModelReference

A provider is a factory function that returns a `ModelReference`. The `use*` functions resolve the appropriate handler based on the modality:

```ts
/**
 * A reference to a model, created by a provider factory.
 * Can be used with any use* function that the provider supports.
 */
interface ModelReference {
  /** The model identifier */
  readonly modelId: string;

  /** The provider that created this reference */
  readonly provider: Provider;
}

/**
 * A provider factory function with metadata and modality handlers.
 */
interface Provider<TOptions = unknown> {
  /** Create a model reference, optionally with provider-specific options */
  (modelId: string, options?: TOptions): ModelReference;

  /** Provider name */
  readonly name: string;

  /** Provider version */
  readonly version: string;

  /** Supported modalities */
  readonly modalities: {
    llm?: LLMHandler;
    embedding?: EmbeddingHandler;
    image?: ImageHandler;
  };
}

/**
 * Handler for LLM operations (used internally by llm())
 */
interface LLMHandler<TParams = unknown> {
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundLLMModel<TParams>;
}

/**
 * Handler for embedding operations (used internally by embedding())
 */
interface EmbeddingHandler<TParams = unknown> {
  /** Supported input types */
  readonly supportedInputs: ('text' | 'image')[];
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundEmbeddingModel<TParams>;
}

/**
 * Handler for image operations (used internally by image())
 */
interface ImageHandler<TParams = unknown> {
  /** Bind model ID to create executable model */
  bind(modelId: string): BoundImageModel<TParams>;
}

/**
 * Type aliases for provider references in bound models.
 * These are the Provider type constrained to having a specific modality handler.
 */
type LLMProvider<TParams = unknown> = Provider & {
  readonly modalities: { llm: LLMHandler<TParams> };
};

type EmbeddingProvider<TParams = unknown> = Provider & {
  readonly modalities: { embedding: EmbeddingHandler<TParams> };
};

type ImageProvider<TParams = unknown> = Provider & {
  readonly modalities: { image: ImageHandler<TParams> };
};
```

### 4.6 Provider Registration

Providers are imported from their respective modules:

```ts
import { openai } from '@providerprotocol/ai/openai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { google } from '@providerprotocol/ai/google';
import { stability } from '@providerprotocol/ai/stability';
import { voyage } from '@providerprotocol/ai/voyage';

// All use the same pattern - single factory per provider
llm({ model: openai('gpt-4o') });
llm({ model: anthropic('claude-sonnet-4-20250514') });
llm({ model: google('gemini-pro') });

embedding({ model: openai('text-embedding-3-small') });
embedding({ model: google('text-embedding-004') });
embedding({ model: voyage('voyage-3') });

image({ model: openai('dall-e-3') });
image({ model: google('imagen-3.0-generate-001') });
image({ model: stability('stable-diffusion-xl-1024-v1-0') });
```

When a `use*` function receives a `ModelReference`, it:
1. Checks if the provider supports that modality
2. Throws `UPPError` with code `INVALID_REQUEST` if not supported
3. Binds the model ID to create the executable model

---

## 5. llm() Interface

### 5.1 Function Signature

```ts
function llm<TParams = unknown>(options: LLMOptions<TParams>): LLMInstance<TParams>;
```

### 5.2 Options

```ts
interface LLMOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: ModelReference;

  /** Provider infrastructure configuration (optional - uses env vars if omitted) */
  config?: ProviderConfig;

  /** Model-specific parameters (temperature, max_tokens, etc.) */
  params?: TParams;

  /** System prompt for all inferences */
  system?: string;

  /** Tools available to the model */
  tools?: Tool[];

  /** Tool execution strategy */
  toolStrategy?: ToolUseStrategy;

  /** Structured output schema (JSON Schema) */
  structure?: JSONSchema;
}
```

### 5.3 LLMInstance

```ts
interface LLMInstance<TParams = unknown> {
  /**
   * Execute inference and return complete Turn
   *
   * @overload No history - single input
   * generate(input: InferenceInput): Promise<Turn>
   *
   * @overload No history - multiple inputs
   * generate(...inputs: InferenceInput[]): Promise<Turn>
   *
   * @overload With history
   * generate(history: Message[] | Thread, ...inputs: InferenceInput[]): Promise<Turn>
   */
  generate(
    historyOrInput: Message[] | Thread | InferenceInput,
    ...input: InferenceInput[]
  ): Promise<Turn>;

  /**
   * Execute streaming inference
   *
   * @overload No history - single input
   * stream(input: InferenceInput): StreamResult
   *
   * @overload No history - multiple inputs
   * stream(...inputs: InferenceInput[]): StreamResult
   *
   * @overload With history
   * stream(history: Message[] | Thread, ...inputs: InferenceInput[]): StreamResult
   */
  stream(
    historyOrInput: Message[] | Thread | InferenceInput,
    ...input: InferenceInput[]
  ): StreamResult;

  /** The bound model */
  readonly model: BoundLLMModel<TParams>;

  /** Current system prompt */
  readonly system: string | undefined;

  /** Current parameters */
  readonly params: TParams | undefined;
}

type InferenceInput = string | Message | ContentBlock;
```

**History Detection:**

llm() determines if the first argument is history or input:
- `Message[]` or `Thread` → history
- `string`, `Message`, or `ContentBlock` → input (no history)

```ts
// No history - one-shot inference
await claude.generate('What is 2+2?');

// No history - multiple inputs
await claude.generate('Look at this:', image);

// With history
await claude.generate(history, 'Follow-up question');
await claude.generate(thread, 'Continue the conversation');
```

### 5.4 BoundLLMModel

```ts
interface BoundLLMModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Execute a single non-streaming inference request */
  complete(request: LLMRequest<TParams>): Promise<LLMResponse>;

  /** Execute a single streaming inference request */
  stream(request: LLMRequest<TParams>): LLMStreamResult;
}

/**
 * Request passed from llm() core to providers.
 * Note: config is required here because llm() core resolves defaults
 * before passing to providers. LLMOptions.config is optional for callers.
 */
interface LLMRequest<TParams = unknown> {
  /** All messages for this request (history + new input) */
  messages: Message[];

  /** System prompt */
  system?: string;

  /** Model-specific parameters (passed through unchanged) */
  params?: TParams;

  /** Tools available for this request */
  tools?: Tool[];

  /** Structured output schema (if requested) */
  structure?: JSONSchema;

  /** Provider infrastructure config (resolved by llm() core) */
  config: ProviderConfig;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/** Raw provider response (single cycle, no tool loop) */
interface LLMResponse {
  message: AssistantMessage;
  usage: TokenUsage;
  stopReason: string;
}

/** Raw provider stream result */
interface LLMStreamResult extends AsyncIterable<StreamEvent> {
  readonly response: Promise<LLMResponse>;
}
```

### 5.5 Basic Usage

```ts
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';

const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  system: 'You are a helpful assistant.',
});

// Simple one-shot inference (no history needed)
const turn = await claude.generate('What is the capital of France?');
console.log(turn.response.text); // "The capital of France is Paris."
```

### 5.6 Full Configuration

```ts
import { llm,RoundRobinKeys, ExponentialBackoff } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import type { AnthropicLLMParams } from '@providerprotocol/ai/anthropic';

const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: {
    apiKey: new RoundRobinKeys([
      process.env.ANTHROPIC_KEY_1!,
      process.env.ANTHROPIC_KEY_2!,
    ]),
    baseUrl: 'https://my-proxy.example.com',
    timeout: 30000,
    retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
  },
  params: {
    max_tokens: 4096,
    temperature: 0.7,
  } as AnthropicLLMParams,
  system: 'You are a friendly AI assistant.',
});
```

### 5.7 Tool Execution Loop

llm() core manages the tool execution loop. Providers only handle single request/response cycles.

**Loop Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│  llm.generate(history, input)                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Convert input to UserMessage                            │
│  2. Append to messages array                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  provider.complete()     │◄────────────────┐
              │  (single request)        │                 │
              └─────────────────────────┘                  │
                            │                              │
                            ▼                              │
              ┌─────────────────────────┐                  │
              │  response.hasToolCalls? │──── No ────┐     │
              │                         │            │     │
              └─────────────────────────┘            │     │
                            │                        │     │
                           Yes                       │     │
                            │                        │     │
                            ▼                        │     │
              ┌─────────────────────────┐            │     │
              │  iterations <           │── No ──►  Error  │
              │  maxIterations?         │                  │
              └─────────────────────────┘                  │
                            │                              │
                           Yes                             │
                            │                              │
                            ▼                              │
              ┌─────────────────────────┐                  │
              │  Execute tools          │                  │
              │  (parallel if multiple) │                  │
              └─────────────────────────┘                  │
                            │                              │
                            ▼                              │
              ┌─────────────────────────┐                  │
              │  Append AssistantMsg    │                  │
              │  (with toolCalls)       │                  │
              │  Append ToolResultMsg   │                  │
              │  to messages            │──────────────────┘
              └─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Build Turn from        │
              │  accumulated messages   │
              └─────────────────────────┘
                            │
                            ▼
                        Return Turn
```

**Implementation Notes:**

1. Each cycle increments `Turn.cycles`
2. Token usage is aggregated across all cycles
3. All messages (user, tool calls, tool results, final response) are collected in `Turn.messages`
4. If `maxIterations` is reached, `onMaxIterations` callback fires and an error is thrown
5. Tool execution order follows provider/model behavior (parallel if model returns multiple calls)

### 5.8 Conversation Flow

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'You are a helpful assistant.',
});

// User manages their own history
const history: Message[] = [];

// First turn
const turn1 = await claude.generate(history, 'My name is Alice.');
history.push(...turn1.messages);

// Second turn (history preserved)
const turn2 = await claude.generate(history, 'What is my name?');
history.push(...turn2.messages);

console.log(turn2.response.text); // "Your name is Alice."
```

### 5.9 Provider Responsibilities

#### 5.9.1 Request Transformation

The provider MUST transform UPP structures to vendor format:

- Convert `Message` subclasses to vendor message format
- Handle system prompt according to vendor requirements (top-level param vs message)
- Convert `Tool` definitions from JSON Schema to vendor tool format
- Convert binary data (images, audio) to vendor-required encoding (e.g., base64)
- Transform structured output schema to vendor format (if supported)

UPP provides standard mutators for common transformations:

```ts
import { toBase64, toDataUrl } from '@providerprotocol/ai/mutators';
```

#### 5.9.2 Response Transformation

The provider MUST transform vendor responses to UPP structures:

- Map vendor response to `AssistantMessage` (which may include `toolCalls`)
- Map streaming chunks to `StreamEvent` with appropriate event metadata
- Preserve vendor-specific metadata in `Message.metadata` under the provider's namespace

**Note:** The provider returns a single `LLMResponse`. llm() core handles constructing the full `Turn` including tool loops.

#### 5.9.3 Metadata Handling

Providers MUST handle their own metadata namespace in `Message.metadata`:

**Extracting metadata from responses:**
```ts
// Google provider extracting thought_signature
const message = new AssistantMessage(content, toolCalls, {
  metadata: {
    google: {
      thought_signature: vendorResponse.thought_signature,
    },
  },
});
```

**Including metadata in requests:**
```ts
// When sending messages back to the API, providers extract their namespace
function transformToVendor(message: Message) {
  const googleMeta = message.metadata?.google;
  return {
    role: message.type,
    content: transformContent(message.content),
    // Include provider-specific fields
    ...(googleMeta?.thought_signature && {
      thought_signature: googleMeta.thought_signature,
    }),
  };
}
```

Providers SHOULD preserve unknown metadata fields during round-trips to support future API additions.

#### 5.9.4 System Prompt Handling

The provider MUST handle system prompts according to vendor requirements:

| Provider | System Prompt Handling |
|----------|----------------------|
| Anthropic | Top-level `system` parameter |
| OpenAI | Message with `role: 'system'` |
| Google | `systemInstruction` field |

llm() accepts system prompts at the options level and providers transform accordingly.

#### 5.9.5 Structured Output Handling

If `structure` is provided, the provider MUST:

1. Transform the JSON Schema to vendor-specific format (if different)
2. Enable structured output mode on the API request
3. If the vendor doesn't support native structured outputs, the provider is responsible for parsing and validating the response against the schema

#### 5.9.6 Error Handling

The provider MUST normalize errors to `UPPError`:

```ts
class UPPError extends Error {
  readonly code: ErrorCode;
  readonly provider: string;
  readonly modality: Modality;
  readonly statusCode?: number;
  readonly cause?: Error;

  constructor(
    message: string,
    code: ErrorCode,
    provider: string,
    modality: Modality,
    statusCode?: number,
    cause?: Error
  ) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.modality = modality;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}
```

---

## 6. Messages

### 6.1 Message Hierarchy

Messages are represented as a class hierarchy, allowing type-safe handling and provider-specific transformations:

```ts
/**
 * Base message class - all messages inherit from this
 */
abstract class Message {
  /** Unique message identifier */
  readonly id: string;

  /** Timestamp */
  readonly timestamp: Date;

  /**
   * Provider-specific metadata, namespaced by provider.
   * Providers are responsible for transforming their metadata to/from API format.
   *
   * @example
   * {
   *   google: { thought_signature: 'abc123...' },
   *   openai: { reasoning_encrypted: '...' },
   *   anthropic: { cache_control: { type: 'ephemeral' } }
   * }
   */
  readonly metadata?: MessageMetadata;

  /** Message type discriminator */
  abstract readonly type: MessageType;

  /**
   * Convenience accessor for text content
   * Concatenates all text blocks with '\n\n'
   */
  readonly text: string;
}

/**
 * Provider-namespaced metadata.
 * Each provider defines its own metadata shape.
 */
interface MessageMetadata {
  /** Extensible: each provider uses its own namespace */
  [provider: string]: Record<string, unknown> | undefined;
}

type MessageType =
  | 'user'
  | 'assistant'
  | 'tool_result';
```

### 6.2 Message Subclasses

```ts
/** Options for message construction */
interface MessageOptions {
  id?: string;
  metadata?: MessageMetadata;
}

/**
 * User input message
 */
class UserMessage extends Message {
  readonly type = 'user';
  readonly content: UserContent[];

  /**
   * @param content - String (converted to TextBlock) or array of content blocks
   */
  constructor(content: string | UserContent[], options?: MessageOptions);
}

type UserContent = TextBlock | ImageBlock | AudioBlock | VideoBlock | BinaryBlock;

/**
 * Assistant response message
 * May contain text, media, and/or tool calls
 */
class AssistantMessage extends Message {
  readonly type = 'assistant';
  readonly content: AssistantContent[];

  /** Tool calls requested by the model (if any) */
  readonly toolCalls?: ToolCall[];

  /**
   * @param content - String (converted to TextBlock) or array of content blocks
   * @param toolCalls - Tool calls requested by the model
   * @param options - Message ID and metadata
   */
  constructor(
    content: string | AssistantContent[],
    toolCalls?: ToolCall[],
    options?: MessageOptions
  );

  /** Check if this message requests tool execution */
  get hasToolCalls(): boolean {
    return this.toolCalls !== undefined && this.toolCalls.length > 0;
  }
}

type AssistantContent = TextBlock | ImageBlock | AudioBlock | VideoBlock;

interface ToolCall {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Result of tool execution (sent back to model)
 */
class ToolResultMessage extends Message {
  readonly type = 'tool_result';
  readonly results: ToolResult[];

  /**
   * @param results - Array of tool execution results
   * @param options - Message ID and metadata
   */
  constructor(results: ToolResult[], options?: MessageOptions);
}

interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}
```

**Note:** Models can return both text AND tool calls in a single response (e.g., "I'll check the weather for you." + tool call). `AssistantMessage` handles both cases - check `hasToolCalls` to determine if tool execution is needed.

### 6.3 Content Blocks

Content blocks represent discrete pieces of content within messages:

```ts
type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | BinaryBlock;

interface TextBlock {
  type: 'text';
  text: string;
}

interface ImageBlock {
  type: 'image';
  source: ImageSource;
  mimeType: string;
  width?: number;
  height?: number;
}

type ImageSource =
  | { type: 'base64'; data: string }
  | { type: 'url'; url: string }
  | { type: 'bytes'; data: Uint8Array };

interface AudioBlock {
  type: 'audio';
  data: Uint8Array;
  mimeType: string;
  duration?: number;
}

interface VideoBlock {
  type: 'video';
  data: Uint8Array;
  mimeType: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface BinaryBlock {
  type: 'binary';
  data: Uint8Array;
  mimeType: string;
  metadata?: Record<string, unknown>;
}
```

### 6.4 Message Construction

```ts
// Text user message
const userMsg = new UserMessage('Hello, world!');

// User message with image
const imageMsg = new UserMessage([
  await Image.fromPath('diagram.png'),
  'Please explain this diagram',
]);

// User message with URL-based image
const urlImageMsg = new UserMessage([
  Image.fromUrl('https://example.com/image.png'),
  'What is this?',
]);

// Assistant message (text only)
const assistantMsg = new AssistantMessage('I can help with that!');

// Assistant message with tool calls (typically created by provider)
const assistantWithTools = new AssistantMessage(
  [{ type: 'text', text: "I'll check the weather for you." }],
  [{ toolCallId: 'call_123', toolName: 'getWeather', arguments: { location: 'Tokyo' } }]
);

// Tool result message (created by llm() core after tool execution)
const toolResultMsg = new ToolResultMessage([
  { toolCallId: 'call_123', result: '72°F, sunny' }
]);
```

### 6.5 Image Type

```ts
interface Image {
  readonly source: ImageSource;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;

  /** Check if this image has data loaded (false for URL sources) */
  readonly hasData: boolean;

  /** Convert to base64 string (throws if source is URL) */
  toBase64(): string;

  /** Convert to data URL (throws if source is URL) */
  toDataUrl(): string;

  /** Get raw bytes (throws if source is URL) */
  toBytes(): Uint8Array;
}

/** Static factory methods for creating Image instances */
namespace Image {
  /** Create from file path (reads file into memory) */
  function fromPath(path: string): Promise<Image>;

  /** Create from URL reference (does not fetch - providers handle URL conversion) */
  function fromUrl(url: string, mimeType?: string): Image;

  /** Create from raw bytes */
  function fromBytes(data: Uint8Array, mimeType: string): Image;

  /** Create from base64 string */
  function fromBase64(base64: string, mimeType: string): Image;
}
```

### 6.6 Type Guards

UPP provides type guards for message handling:

```ts
function isUserMessage(msg: Message): msg is UserMessage;
function isAssistantMessage(msg: Message): msg is AssistantMessage;
function isToolResultMessage(msg: Message): msg is ToolResultMessage;

// Usage
for (const msg of turn.messages) {
  if (isAssistantMessage(msg)) {
    console.log('Response:', msg.text);
    if (msg.hasToolCalls) {
      console.log('Tool calls:', msg.toolCalls);
    }
  } else if (isToolResultMessage(msg)) {
    console.log('Tool results:', msg.results);
  }
}
```

---

## 7. Turns

### 7.1 Turn Structure

A `Turn` represents the complete result of one inference call, including all messages produced during tool execution loops.

```ts
interface Turn<TData = unknown> {
  /**
   * All messages produced during this inference, in chronological order.
   * Types: UserMessage, AssistantMessage (may include toolCalls), ToolResultMessage
   */
  readonly messages: Message[];

  /** The final assistant response (convenience accessor) */
  readonly response: AssistantMessage;

  /** Tool executions that occurred during this turn */
  readonly toolExecutions: ToolExecution[];

  /** Aggregate token usage for the entire turn */
  readonly usage: TokenUsage;

  /** Total number of inference cycles (1 + number of tool rounds) */
  readonly cycles: number;

  /**
   * Structured output data (if structure was provided).
   * Type is inferred from the schema when using TypeScript.
   */
  readonly data?: TData;
}

interface ToolExecution {
  /** The tool that was called */
  toolName: string;

  /** Tool call ID */
  toolCallId: string;

  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;

  /** Result returned by the tool */
  result: unknown;

  /** Whether the tool execution resulted in an error */
  isError: boolean;

  /** Execution duration in milliseconds */
  duration: number;

  /** Whether approval was required and granted */
  approved?: boolean;
}

interface TokenUsage {
  /** Input tokens across all cycles */
  inputTokens: number;

  /** Output tokens across all cycles */
  outputTokens: number;

  /** Total tokens */
  totalTokens: number;

  /** Per-cycle breakdown (if available) */
  cycles?: Array<{
    inputTokens: number;
    outputTokens: number;
  }>;
}
```

### 7.2 Turn Usage

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'You are a helpful assistant.',
  tools: [getWeather],
});

const history: Message[] = [];

// This turn might involve tool calls
const turn = await claude.generate(history, 'What is the weather in Tokyo?');

// Turn contains ALL messages from this inference:
// 1. UserMessage: "What is the weather in Tokyo?"
// 2. AssistantMessage: { toolCalls: [{ toolName: 'getWeather', arguments: { location: 'Tokyo' } }] }
// 3. ToolResultMessage: [{ result: '72°F, sunny' }]
// 4. AssistantMessage: "The weather in Tokyo is 72°F and sunny!"

console.log(turn.messages.length); // 4
console.log(turn.response.text);   // "The weather in Tokyo is 72°F and sunny!"
console.log(turn.toolExecutions);  // [{ toolName: 'getWeather', ... }]
console.log(turn.cycles);          // 2 (initial + after tool)

// Append all messages to history for next turn
history.push(...turn.messages);
```

### 7.3 Turn Without Tool Calls

When no tools are called, the turn contains just the user input and assistant response:

```ts
const turn = await claude.generate('Hello!');

console.log(turn.messages.length);      // 2
console.log(turn.messages[0].type);     // 'user'
console.log(turn.messages[1].type);     // 'assistant'
console.log(turn.response.text);        // "Hello! How can I help you today?"
console.log(turn.response.hasToolCalls); // false
console.log(turn.toolExecutions);       // []
console.log(turn.cycles);               // 1
```

---

## 8. Threads

### 8.1 Thread as Utility

`Thread` is an **optional** utility class for managing conversation history. UPP does not manage threads internally—users control their own history.

```ts
class Thread {
  /** Create a new thread, optionally with initial messages */
  constructor(messages?: Message[]);

  /** Unique thread identifier */
  readonly id: string;

  /** All messages in the thread */
  readonly messages: readonly Message[];

  /** Number of messages */
  readonly length: number;

  /** Append messages from a turn */
  append(turn: Turn): this;

  /** Add raw messages */
  push(...messages: Message[]): this;

  /** Add a user message */
  user(content: string | ContentBlock[]): this;

  /** Add an assistant message */
  assistant(content: string | ContentBlock[]): this;

  /** Get messages by type */
  filter(type: MessageType): Message[];

  /** Get the last N messages */
  tail(count: number): Message[];

  /** Create a new thread with a subset of messages */
  slice(start?: number, end?: number): Thread;

  /** Clear all messages */
  clear(): this;

  /** Convert to plain message array */
  toMessages(): Message[];

  /** Serialize to JSON */
  toJSON(): ThreadJSON;

  /** Deserialize from JSON */
  static fromJSON(json: ThreadJSON): Thread;

  /** Iterate over messages */
  [Symbol.iterator](): Iterator<Message>;
}
```

### 8.2 Thread Usage

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'You are a helpful assistant.',
});

// Using Thread utility
const thread = new Thread();

const turn1 = await claude.generate(thread, 'My name is Bob.');
thread.append(turn1);

const turn2 = await claude.generate(thread, 'What did I just tell you?');
thread.append(turn2);

console.log(turn2.response.text); // "You told me your name is Bob."
console.log(thread.length);       // 4 messages

// Serialize for storage
const json = thread.toJSON();
localStorage.setItem('conversation', JSON.stringify(json));

// Restore later
const restored = Thread.fromJSON(JSON.parse(localStorage.getItem('conversation')!));
```

### 8.3 Using Raw Arrays

Threads are optional—you can use plain arrays:

```ts
const messages: Message[] = [];

const turn = await claude.generate(messages, 'Hello!');
messages.push(...turn.messages);
```

### 8.4 Thread Serialization

```ts
interface ThreadJSON {
  id: string;
  messages: MessageJSON[];
  createdAt: string;
  updatedAt: string;
}

interface MessageJSON {
  id: string;
  type: MessageType;
  content: ContentBlock[];
  toolCalls?: ToolCall[];
  results?: ToolResult[];
  metadata?: MessageMetadata;
  timestamp: string;
}
```

---

## 9. Streaming

### 9.1 StreamResult

Streaming returns a `StreamResult` that is both an async iterable and provides access to the final `Turn`:

```ts
interface StreamResult extends AsyncIterable<StreamEvent> {
  /**
   * Get the complete Turn after streaming finishes.
   * Resolves when the stream completes.
   */
  readonly turn: Promise<Turn>;

  /** Abort the stream */
  abort(): void;
}
```

### 9.2 StreamEvent

During streaming, providers emit `StreamEvent` objects:

```ts
interface StreamEvent {
  /** Event type */
  type: StreamEventType;

  /** Index of the content block this event belongs to */
  index: number;

  /** Event data (type-specific) */
  delta: EventDelta;
}

type StreamEventType =
  | 'text_delta'           // Partial text token
  | 'reasoning_delta'      // Reasoning/thinking token
  | 'image_delta'          // Partial image data
  | 'audio_delta'          // Partial audio data
  | 'video_delta'          // Partial video data
  | 'tool_call_delta'      // Partial tool call
  | 'message_start'        // Stream started
  | 'message_stop'         // Stream complete
  | 'content_block_start'  // New content block started
  | 'content_block_stop';  // Content block complete

interface EventDelta {
  text?: string;
  data?: Uint8Array;
  toolCallId?: string;
  toolName?: string;
  argumentsJson?: string;
}
```

### 9.3 Streaming Usage

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'You are a helpful assistant.',
});

const history: Message[] = [];

// Stream the response
const stream = claude.stream(history, 'Write a haiku about programming.');

for await (const event of stream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta.text ?? '');
  }
}

// Get the complete turn after streaming
const turn = await stream.turn;
history.push(...turn.messages);
```

### 9.4 Streaming with Tools

When tools are involved, streaming may pause while tools execute:

```ts
const stream = claude.stream(history, 'What is the weather in Paris?');

for await (const event of stream) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.delta.text ?? '');
      break;
    case 'tool_call_delta':
      // Tool call being streamed
      console.log('[tool]', event.delta.toolName);
      break;
    case 'message_stop':
      // A message completed (might be tool call, will continue after tool runs)
      break;
  }
}

const turn = await stream.turn;
console.log('Tool executions:', turn.toolExecutions);
```

### 9.5 Aborting Streams

```ts
const stream = claude.stream(history, 'Write a very long story...');

setTimeout(() => {
  stream.abort(); // Cancel after 5 seconds
}, 5000);

try {
  for await (const event of stream) {
    process.stdout.write(event.delta.text ?? '');
  }
} catch (error) {
  if (error instanceof UPPError && error.code === 'CANCELLED') {
    console.log('Stream was cancelled');
  }
}
```

**Abort behavior with tools:** When a stream is aborted during a tool execution loop, the abort signal propagates to any in-flight tool execution. The current tool's `run` function receives the abort via `AbortSignal` (if it accepts one). Pending tool calls that haven't started execution are skipped. The overall generation throws a `CANCELLED` error.

### 9.6 Streaming Event Order

A typical streaming sequence:

```
message_start
  content_block_start (index: 0)
    text_delta "Hello"
    text_delta " world"
    text_delta "!"
  content_block_stop (index: 0)
message_stop
```

With tool calls:

```
message_start
  content_block_start (index: 0)
    text_delta "Let me check..."
  content_block_stop (index: 0)
  content_block_start (index: 1)
    tool_call_delta { toolName: "getWeather" }
    tool_call_delta { argumentsJson: '{"loc' }
    tool_call_delta { argumentsJson: 'ation":"Paris"}' }
  content_block_stop (index: 1)
message_stop
[tool execution happens here]
message_start
  content_block_start (index: 0)
    text_delta "The weather is..."
  content_block_stop (index: 0)
message_stop
```

---

## 10. Tools

### 10.1 Tool Definition

Tools use **JSON Schema** for parameter definitions:

```ts
interface Tool<TParams = unknown, TResult = unknown> {
  /** Tool name (must be unique within a llm() instance) */
  name: string;

  /** Human-readable description for the model */
  description: string;

  /** JSON Schema defining parameters */
  parameters: JSONSchema;

  /** Tool execution function */
  run(params: TParams): TResult | Promise<TResult>;

  /** Optional approval handler for sensitive operations */
  approval?(params: TParams): boolean | Promise<boolean>;
}

type JSONSchema = {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

type JSONSchemaProperty = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: unknown[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
};
```

### 10.2 Tool Example

```ts
const getWeather: Tool<{ location: string; units?: string }> = {
  name: 'getWeather',
  description: 'Get current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or coordinates',
      },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius',
      },
    },
    required: ['location'],
  },
  async run({ location, units = 'celsius' }) {
    const weather = await fetchWeather(location, units);
    return `${weather.temp}° ${units}, ${weather.condition}`;
  },
};

const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'You are a weather assistant.',
  tools: [getWeather],
});
```

### 10.3 Tool Approval

For sensitive operations, tools can require approval:

```ts
const deleteFile: Tool<{ path: string }> = {
  name: 'deleteFile',
  description: 'Delete a file from the filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to delete' },
    },
    required: ['path'],
  },
  async approval({ path }) {
    // UI prompt, admin check, path validation, etc.
    return await promptUser(`Allow deletion of ${path}?`);
  },
  async run({ path }) {
    await fs.unlink(path);
    return `Deleted ${path}`;
  },
};
```

### 10.4 Tool Execution Flow

By default, llm() handles tool execution automatically:

1. Model returns an `AssistantMessage` with `toolCalls`
2. If `approval` is defined, it's called first (rejected = error result sent to model)
3. Tool's `run` function is executed with arguments from the model
4. Result (or error) is sent back to the model as `ToolResultMessage`
5. Loop continues until model returns without tool calls OR max iterations reached

**Error handling:**
- If `approval()` throws an exception, the exception propagates to the caller and aborts the generation
- If `approval()` returns `false`, an error result is sent to the model
- If the tool's `run` function throws, the error is caught and sent as an error result to the model

**Important:** llm() does NOT validate tool arguments against the JSON Schema. The schema is provided to the model to guide its output, but validation and sanitization of LLM-provided arguments is the responsibility of the tool implementation. Always treat tool arguments as untrusted input.

**Note on validation asymmetry:** This differs from structured outputs (Section 11), where providers MUST validate responses against the schema. The distinction is intentional: structured outputs are a contract with the developer about response format, while tool arguments are inputs to developer-controlled functions that should perform their own validation appropriate to their security context.

### 10.5 ToolUseStrategy

For custom control over tool execution:

```ts
interface ToolUseStrategy {
  /** Maximum tool execution rounds (default: 10) */
  maxIterations?: number;

  /** Called when the model requests a tool call */
  onToolCall?(tool: Tool, params: unknown): void | Promise<void>;

  /** Called before tool execution, return false to skip */
  onBeforeCall?(tool: Tool, params: unknown): boolean | Promise<boolean>;

  /** Called after tool execution */
  onAfterCall?(tool: Tool, params: unknown, result: unknown): void | Promise<void>;

  /** Called on tool execution error */
  onError?(tool: Tool, params: unknown, error: Error): void | Promise<void>;

  /** Called when max iterations reached */
  onMaxIterations?(iterations: number): void | Promise<void>;
}
```

### 10.6 Strategy Example

```ts
const strategy: ToolUseStrategy = {
  maxIterations: 5,

  async onBeforeCall(tool, params) {
    console.log(`Calling ${tool.name} with`, params);
    return true; // Allow execution
  },

  async onAfterCall(tool, params, result) {
    await logToolUsage(tool.name, params, result);
  },

  async onError(tool, params, error) {
    await alertOps(`Tool ${tool.name} failed: ${error.message}`);
  },

  async onMaxIterations(iterations) {
    console.warn(`Tool loop hit max iterations: ${iterations}`);
  },
};

const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  tools: [getWeather, searchWeb],
  toolStrategy: strategy,
});
```

### 10.7 Disabling Automatic Tool Execution

To handle tool calls manually:

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  tools: [getWeather],
  toolStrategy: { maxIterations: 0 }, // Disable auto-execution
});

const turn = await claude.generate([], 'What is the weather?');

if (turn.response.hasToolCalls) {
  // Handle manually
  for (const toolCall of turn.response.toolCalls) {
    console.log('Model wants to call:', toolCall.toolName);
    // Execute yourself, then continue conversation
  }
}
```

### 10.8 Multiple Tool Calls

Models may request multiple tool calls in a single response. llm() executes them in parallel by default:

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  tools: [getWeather, getTime],
});

// Model might call both tools simultaneously
const turn = await claude.generate(
  'What is the weather and time in Tokyo and Paris?'
);

// turn.toolExecutions might contain 4 executions
// (weather + time for each city)
```

---

## 11. Structured Outputs

### 11.1 Overview

Structured outputs allow you to constrain model responses to a specific JSON schema, ensuring valid, parseable data.

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'Extract structured data from text.',
  structure: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Person name' },
      age: { type: 'integer', description: 'Person age' },
      email: { type: 'string', format: 'email' },
    },
    required: ['name', 'age'],
  },
});

const turn = await claude.generate([], 'John Doe is 30 years old, email: john@example.com');

// turn.data contains the structured response
console.log(turn.data);
// { name: 'John Doe', age: 30, email: 'john@example.com' }

// turn.response.text may contain raw JSON or be empty depending on provider
```

### 11.2 Schema Definition

Structured outputs use standard JSON Schema:

```ts
interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;

  // String-specific
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'email' | 'uri' | 'date' | 'date-time' | 'uuid';

  // Number-specific
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array-specific
  items?: JSONSchemaProperty;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Object-specific
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}
```

### 11.3 Provider Handling

Providers handle structured outputs according to their capabilities:

| Provider | Implementation |
|----------|----------------|
| Anthropic | Uses tool_choice with schema |
| OpenAI | Uses response_format with json_schema |
| Google | Uses responseSchema |

If a provider doesn't natively support structured outputs:
1. The provider MUST still attempt to get JSON output
2. The provider MUST validate the response against the schema
3. Invalid responses should throw a `UPPError` with code `INVALID_RESPONSE`

### 11.4 Complex Schema Example

```ts
const weatherSchema: JSONSchema = {
  type: 'object',
  properties: {
    location: {
      type: 'object',
      properties: {
        city: { type: 'string' },
        country: { type: 'string' },
        coordinates: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lon: { type: 'number' },
          },
          required: ['lat', 'lon'],
        },
      },
      required: ['city', 'country'],
    },
    current: {
      type: 'object',
      properties: {
        temperature: { type: 'number' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        conditions: { type: 'string' },
        humidity: { type: 'integer', minimum: 0, maximum: 100 },
      },
      required: ['temperature', 'unit', 'conditions'],
    },
    forecast: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          high: { type: 'number' },
          low: { type: 'number' },
          conditions: { type: 'string' },
        },
        required: ['date', 'high', 'low'],
      },
      maxItems: 7,
    },
  },
  required: ['location', 'current'],
};

const weatherAI = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  system: 'Provide weather information in the requested format.',
  structure: weatherSchema,
});

const turn = await weatherAI.generate([], 'Weather in Tokyo for the next 3 days');
const weather = turn.data as WeatherResponse; // Type assertion
console.log(weather.location.city); // 'Tokyo'
console.log(weather.forecast.length); // 3
```

### 11.5 Structured Output with Tools

Structured outputs can be combined with tools. The final response will be structured:

```ts
const claude = llm({
  model: anthropic('claude-haiku-4.5'),
  config: { apiKey: process.env.ANTHROPIC_API_KEY },
  tools: [getWeatherTool],
  structure: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      temperature: { type: 'number' },
      recommendation: { type: 'string' },
    },
    required: ['summary', 'temperature', 'recommendation'],
  },
});

// Model may call tools, but final response will be structured
const turn = await claude.generate([], 'Should I bring an umbrella in Tokyo today?');
console.log(turn.data);
// { summary: 'Sunny and warm', temperature: 72, recommendation: 'No umbrella needed' }
```

---

## 12. embedding() Interface

### 12.1 Function Signature

```ts
function embedding<TParams = unknown>(
  options: EmbeddingOptions<TParams>
): EmbeddingInstance<TParams>;
```

### 12.2 Options

```ts
interface EmbeddingOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: ModelReference;

  /** Provider infrastructure configuration (optional - uses env vars if omitted) */
  config?: ProviderConfig;

  /** Model-specific parameters (dimensions, encoding format, etc.) */
  params?: TParams;
}
```

### 12.3 EmbeddingInstance

```ts
interface EmbeddingInstance<TParams = unknown> {
  /**
   * Embed a single input
   */
  embed(input: EmbeddingInput): Promise<Embedding>;

  /**
   * Embed multiple inputs in a single request
   */
  embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingBatch>;

  /**
   * Embed with automatic batching for large input sets
   * Handles rate limiting and chunking automatically
   */
  embedMany(
    inputs: EmbeddingInput[],
    options?: EmbedManyOptions
  ): AsyncIterable<EmbeddingProgress>;

  /** The bound model */
  readonly model: BoundEmbeddingModel<TParams>;

  /** Current parameters */
  readonly params: TParams | undefined;
}

type EmbeddingInput = string | TextBlock | ImageBlock;

interface EmbedManyOptions {
  /** Maximum inputs per batch (default: provider limit) */
  batchSize?: number;

  /** Concurrency limit (default: 1) */
  concurrency?: number;

  /** Abort signal */
  signal?: AbortSignal;
}
```

### 12.4 Embedding Results

```ts
interface Embedding {
  /** The embedding vector */
  vector: number[];

  /** Vector dimensionality */
  dimensions: number;

  /** The input that was embedded (for reference) */
  input: EmbeddingInput;

  /** Token count (if available) */
  tokens?: number;
}

interface EmbeddingBatch {
  /** Embeddings in same order as inputs */
  embeddings: Embedding[];

  /** Aggregate usage */
  usage: EmbeddingUsage;
}

interface EmbeddingUsage {
  /** Total tokens processed */
  totalTokens: number;
}

interface EmbeddingProgress {
  /** Completed embeddings so far */
  embeddings: Embedding[];

  /** Progress information */
  progress: {
    completed: number;
    total: number;
    percent: number;
  };

  /** Set when all complete */
  done: boolean;
}
```

### 12.5 BoundEmbeddingModel

```ts
interface BoundEmbeddingModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Maximum inputs per batch */
  readonly maxBatchSize: number;

  /** Maximum input length (tokens or characters) */
  readonly maxInputLength: number;

  /** Output dimensions (may be configurable) */
  readonly dimensions: number;

  /** Execute embedding request */
  embed(request: EmbeddingRequest<TParams>): Promise<EmbeddingResponse>;
}

interface EmbeddingRequest<TParams = unknown> {
  /** Inputs to embed */
  inputs: EmbeddingInput[];

  /** Model-specific parameters */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal */
  signal?: AbortSignal;
}

interface EmbeddingResponse {
  /** Embedding vectors with optional token counts */
  embeddings: Array<{
    vector: number[];
    tokens?: number;
  }>;

  /** Aggregate usage */
  usage: EmbeddingUsage;
}
```

### 12.6 Basic Usage

```ts
import { embedding } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const embedder = embedding({
  model: openai('text-embedding-3-large'),
  config: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  params: {
    dimensions: 1536,
  },
});

// Single embedding
const result = await embedder.embed('What is the capital of France?');
console.log(result.vector.length); // 1536
console.log(result.dimensions);    // 1536

// Batch embedding
const batch = await embedder.embedBatch([
  'First document to embed',
  'Second document to embed',
  'Third document to embed',
]);

console.log(batch.embeddings.length); // 3
console.log(batch.usage.totalTokens); // Total tokens used
```

### 12.7 Large-Scale Embedding

For embedding large document sets:

```ts
const documents = await loadDocuments(); // 10,000 documents

for await (const progress of embedder.embedMany(documents, {
  batchSize: 100,
  concurrency: 2,
})) {
  console.log(`Progress: ${progress.progress.percent}%`);

  // Process embeddings as they complete
  await storeInVectorDB(progress.embeddings);

  if (progress.done) {
    console.log('All embeddings complete');
  }
}
```

### 12.8 Provider-Specific Parameters

Each provider exports its own parameter types (e.g., `OpenAIEmbedParams`, `VoyageEmbedParams`). Consult provider documentation for available options such as output dimensions, encoding formats, and task type hints.

### 12.9 Similarity Utilities

UPP provides optional utilities for working with embeddings:

```ts
import { cosineSimilarity, euclideanDistance, dotProduct } from '@providerprotocol/ai/similarity';

const similarity = cosineSimilarity(embedding1.vector, embedding2.vector);
```

---

## 13. image() Interface

### 13.1 Function Signature

```ts
function image<TParams = unknown>(
  options: ImageOptions<TParams>
): ImageInstance<TParams>;
```

### 13.2 Options

```ts
interface ImageOptions<TParams = unknown> {
  /** A model reference from a provider factory */
  model: ModelReference;

  /** Provider infrastructure configuration (optional - uses env vars if omitted) */
  config?: ProviderConfig;

  /** Model-specific parameters (size, quality, style, etc.) */
  params?: TParams;
}
```

### 13.3 ImageInstance

```ts
interface ImageInstance<TParams = unknown> {
  /**
   * Generate images from a text prompt
   */
  generate(input: ImagePrompt): Promise<ImageResult>;

  /**
   * Generate with streaming progress (if supported)
   */
  stream?(input: ImagePrompt): ImageStreamResult;

  /**
   * Edit an existing image (inpainting)
   */
  edit?(input: ImageEditInput): Promise<ImageResult>;

  /**
   * Create variations of an existing image
   */
  vary?(input: ImageVaryInput): Promise<ImageResult>;

  /**
   * Upscale an image to higher resolution
   */
  upscale?(input: ImageUpscaleInput): Promise<ImageResult>;

  /** The bound model */
  readonly model: BoundImageModel<TParams>;

  /** Current parameters */
  readonly params: TParams | undefined;

  /** Model capabilities */
  readonly capabilities: ImageCapabilities;
}

type ImagePrompt = string | {
  prompt: string;
  negativePrompt?: string;
  referenceImages?: Image[];
  seed?: number;
};
```

### 13.4 Image Results

```ts
interface ImageResult {
  /** Generated images */
  images: GeneratedImage[];

  /** Generation metadata */
  metadata?: {
    /** Seed used (for reproducibility) */
    seed?: number;
    /** Model's revised prompt (if applicable) */
    revisedPrompt?: string;
  };

  /** Usage/billing information */
  usage?: ImageUsage;
}

interface GeneratedImage {
  /** The generated image */
  image: Image;

  /** Per-image metadata */
  metadata?: {
    seed?: number;
    index?: number;
    finishReason?: 'success' | 'content_filtered';
  };
}

interface ImageUsage {
  /** Number of images generated */
  imagesGenerated: number;
  /** Provider-specific cost units */
  cost?: number;
}
```

### 13.5 Streaming Generation

```ts
interface ImageStreamResult extends AsyncIterable<ImageStreamEvent> {
  /** Final result after streaming completes */
  readonly result: Promise<ImageResult>;

  /** Abort the generation */
  abort(): void;
}

type ImageStreamEvent =
  | { type: 'progress'; percent: number; stage?: string }
  | { type: 'preview'; image: Image; index: number }
  | { type: 'complete'; image: GeneratedImage; index: number };
```

### 13.6 Image Editing

```ts
interface ImageEditInput {
  /** Base image to edit */
  image: Image;

  /** Mask indicating edit region (white = edit area) */
  mask?: Image;

  /** Edit instruction */
  prompt: string;

  /** Negative prompt */
  negativePrompt?: string;
}

interface ImageVaryInput {
  /** Source image for variations */
  image: Image;

  /** Number of variations to generate */
  count?: number;

  /** Variation strength (0-1, higher = more different) */
  strength?: number;
}

interface ImageUpscaleInput {
  /** Image to upscale */
  image: Image;

  /** Target scale factor */
  scale?: 2 | 4;
}
```

### 13.7 Capabilities

```ts
interface ImageCapabilities {
  /** Supports text-to-image generation */
  generate: boolean;

  /** Supports streaming progress */
  streaming: boolean;

  /** Supports image editing/inpainting */
  edit: boolean;

  /** Supports variations */
  vary: boolean;

  /** Supports upscaling */
  upscale: boolean;

  /** Supports outpainting */
  outpaint: boolean;

  /** Supports image-to-image */
  imageToImage: boolean;

  /** Maximum images per request */
  maxImages: number;

  /** Supported output sizes */
  supportedSizes: string[];

  /** Supported aspect ratios */
  supportedAspectRatios?: string[];

  /** Supported output formats */
  supportedFormats: ('png' | 'jpeg' | 'webp')[];
}
```

### 13.8 BoundImageModel

```ts
interface BoundImageModel<TParams = unknown> {
  /** The model identifier */
  readonly modelId: string;

  /** Model capabilities */
  readonly capabilities: ImageCapabilities;

  /** Generate images */
  generate(request: ImageRequest<TParams>): Promise<ImageResponse>;

  /** Stream generation progress (optional) */
  stream?(request: ImageRequest<TParams>): ImageProviderStreamResult;

  /** Edit an image (optional) */
  edit?(request: ImageEditRequest<TParams>): Promise<ImageResponse>;

  /** Create variations (optional) */
  vary?(request: ImageVaryRequest<TParams>): Promise<ImageResponse>;

  /** Upscale an image (optional) */
  upscale?(request: ImageUpscaleRequest<TParams>): Promise<ImageResponse>;
}

interface ImageRequest<TParams = unknown> {
  /** Generation prompt */
  prompt: string;

  /** Negative prompt */
  negativePrompt?: string;

  /** Reference images */
  referenceImages?: Image[];

  /** Seed for reproducibility */
  seed?: number;

  /** Model-specific parameters */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal */
  signal?: AbortSignal;
}

interface ImageResponse {
  /** Generated images */
  images: GeneratedImage[];

  /** Generation metadata */
  metadata?: {
    seed?: number;
    revisedPrompt?: string;
  };

  /** Usage information */
  usage?: ImageUsage;
}

interface ImageEditRequest<TParams = unknown> {
  /** Base image */
  image: Image;

  /** Edit mask */
  mask?: Image;

  /** Edit prompt */
  prompt: string;

  /** Negative prompt */
  negativePrompt?: string;

  /** Model-specific parameters */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal */
  signal?: AbortSignal;
}

interface ImageVaryRequest<TParams = unknown> {
  /** Source image */
  image: Image;

  /** Number of variations */
  count?: number;

  /** Variation strength */
  strength?: number;

  /** Model-specific parameters */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal */
  signal?: AbortSignal;
}

interface ImageUpscaleRequest<TParams = unknown> {
  /** Image to upscale */
  image: Image;

  /** Scale factor */
  scale?: 2 | 4;

  /** Model-specific parameters */
  params?: TParams;

  /** Provider infrastructure config */
  config: ProviderConfig;

  /** Abort signal */
  signal?: AbortSignal;
}

interface ImageProviderStreamResult extends AsyncIterable<ImageStreamEvent> {
  readonly response: Promise<ImageResponse>;
}
```

### 13.9 Basic Usage

```ts
import { image } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const dalle = image({
  model: openai('dall-e-3'),
  config: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  params: {
    size: '1024x1024',
    quality: 'hd',
  },
});

// Simple generation
const result = await dalle.generate('A sunset over mountains, oil painting style');

console.log(result.images.length);           // 1
console.log(result.metadata?.revisedPrompt); // DALL-E's enhanced prompt

// Save the image
const imageData = result.images[0].image.toBytes();
await Bun.write('sunset.png', imageData);
```

### 13.10 Advanced Generation

```ts
import { image } from '@providerprotocol/ai';
import { stability } from '@providerprotocol/ai/stability';

const sd = image({
  model: stability('stable-diffusion-xl-1024-v1-0'),
  config: {
    apiKey: process.env.STABILITY_API_KEY,
  },
  params: {
    steps: 30,
    cfg_scale: 7,
    samples: 4,
  },
});

// Generation with negative prompt
const result = await sd.generate({
  prompt: 'A photorealistic cat sitting on a windowsill, golden hour lighting',
  negativePrompt: 'cartoon, drawing, illustration, low quality, blurry',
  seed: 12345,
});

console.log(result.images.length);      // 4
console.log(result.metadata?.seed);     // 12345

// Save all images
for (let i = 0; i < result.images.length; i++) {
  await Bun.write(`cat-${i}.png`, result.images[i].image.toBytes());
}
```

### 13.11 Image Editing

```ts
// Check if editing is supported
if (dalle.capabilities.edit) {
  const edited = await dalle.edit({
    image: await Image.fromPath('./photo.png'),
    mask: await Image.fromPath('./mask.png'), // White = edit area
    prompt: 'Replace the sky with a starry night',
  });

  await Bun.write('edited.png', edited.images[0].image.toBytes());
}
```

### 13.12 Image Variations

```ts
// Check if variations are supported
if (dalle.capabilities.vary) {
  const variations = await dalle.vary({
    image: await Image.fromPath('./original.png'),
    count: 3,
    strength: 0.7, // 0 = identical, 1 = completely different
  });

  for (let i = 0; i < variations.images.length; i++) {
    await Bun.write(`variation-${i}.png`, variations.images[i].image.toBytes());
  }
}
```

### 13.13 Streaming Progress

```ts
// Check if streaming is supported
if (sd.stream) {
  const stream = sd.stream({
    prompt: 'A cyberpunk cityscape at night, neon lights, rain',
  });

  for await (const event of stream) {
    switch (event.type) {
      case 'progress':
        console.log(`${event.percent}% - ${event.stage}`);
        break;
      case 'preview':
        // Display low-res preview
        displayPreview(event.image, event.index);
        break;
      case 'complete':
        console.log(`Image ${event.index} complete`);
        break;
    }
  }

  const finalResult = await stream.result;
  console.log(`Generated ${finalResult.images.length} images`);
}
```

### 13.14 Provider-Specific Parameters

Each provider exports its own parameter types (e.g., `OpenAIImageParams`, `StabilityImageParams`). Consult provider documentation for available options such as size, quality, style presets, and sampling parameters.

### 13.15 Capability Detection

```ts
// Check capabilities before using optional features
if (imageGen.capabilities.edit && imageGen.edit) {
  // Safe to use edit
}

if (imageGen.capabilities.streaming && imageGen.stream) {
  // Safe to use streaming
}
```

---

## 14. Type Definitions

### 14.1 Modality Types

```ts
type Modality = 'llm' | 'embedding' | 'image' | 'audio' | 'video';
```

### 14.2 Complete Export List

```ts
// --- Entry Points ---
export { llm, embedding, image };

// --- Namespace (alternative import style) ---
export { ai };  // ai = { llm, embedding, image }

// --- LLM Types ---
export {
  LLMOptions,
  LLMInstance,
  LLMProvider,
  BoundLLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamResult,
  InferenceInput,
};

// --- Message Types ---
export {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  MessageOptions,
  MessageMetadata,
  MessageType,
};

// --- Content Block Types ---
export {
  ContentBlock,
  TextBlock,
  ImageBlock,
  AudioBlock,
  VideoBlock,
  BinaryBlock,
  ImageSource,
};

// --- Tool Types ---
export {
  ToolCall,
  ToolResult,
  Tool,
  ToolUseStrategy,
  ToolExecution,
};

// --- Turn & Thread Types ---
export {
  Turn,
  TokenUsage,
  Thread,
  ThreadJSON,
};

// --- Streaming Types ---
export {
  StreamResult,
  StreamEvent,
  StreamEventType,
  EventDelta,
};

// --- Schema Types ---
export {
  JSONSchema,
  JSONSchemaProperty,
};

// --- Embedding Types ---
export {
  EmbeddingOptions,
  EmbeddingInstance,
  EmbeddingProvider,
  BoundEmbeddingModel,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingInput,
  Embedding,
  EmbeddingBatch,
  EmbeddingUsage,
  EmbeddingProgress,
  EmbedManyOptions,
};

// --- Image Types ---
export {
  ImageOptions,
  ImageInstance,
  ImageProvider,
  BoundImageModel,
  ImageRequest,
  ImageResponse,
  ImagePrompt,
  ImageResult,
  GeneratedImage,
  ImageUsage,
  ImageStreamResult,
  ImageStreamEvent,
  ImageEditInput,
  ImageEditRequest,
  ImageVaryInput,
  ImageVaryRequest,
  ImageUpscaleInput,
  ImageUpscaleRequest,
  ImageCapabilities,
  ImageProviderStreamResult,
};

// --- Shared Infrastructure ---
export {
  ProviderConfig,
  KeyStrategy,
  RoundRobinKeys,
  WeightedKeys,
  DynamicKey,
  RetryStrategy,
  ExponentialBackoff,
  LinearBackoff,
  NoRetry,
  TokenBucket,
  RetryAfterStrategy,
  UPPError,
  ErrorCode,
  Modality,
};

// --- Utilities ---
export {
  Image,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
};

// --- Similarity Utilities (optional) ---
// cosineSimilarity, euclideanDistance, dotProduct
// Available from '@providerprotocol/ai/similarity'
```

### 14.3 Provider Exports

Each provider module exports a single factory function and its own parameter types. The model ID passed to the factory determines which modality handler is used.

```ts
// Pattern: @providerprotocol/ai/{provider}
import { openai } from '@providerprotocol/ai/openai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { google } from '@providerprotocol/ai/google';

// Each provider also exports its parameter types
import type { OpenAILLMParams } from '@providerprotocol/ai/openai';
```

Consult individual provider documentation for available parameter types and supported modalities.

---

## 15. Provider Implementation Guide

### 15.1 Provider Module Structure

Each provider module exports a single factory that combines all modality handlers:

```ts
// @providerprotocol/ai/openai/index.ts
import { createProvider } from '@providerprotocol/ai';
import { createLLMHandler } from './llm';
import { createEmbeddingHandler } from './embed';
import { createImageHandler } from './image';

export const openai = createProvider({
  name: 'openai',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
    image: createImageHandler(),
  },
});

// Re-export param types for consumers
export type { OpenAILLMParams } from './llm';
export type { OpenAIEmbedParams } from './embed';
export type { OpenAIImageParams } from './image';
```

### 15.2 createProvider Helper

UPP provides a helper to create providers:

```ts
import { createProvider, Provider, ModelReference } from '@providerprotocol/ai';

interface CreateProviderOptions {
  name: string;
  version: string;
  modalities: {
    llm?: LLMHandler;
    embedding?: EmbeddingHandler;
    image?: ImageHandler;
  };
}

function createProvider(options: CreateProviderOptions): Provider {
  const provider: Provider = Object.assign(
    function (modelId: string): ModelReference {
      return { modelId, provider };
    },
    {
      name: options.name,
      version: options.version,
      modalities: options.modalities,
    }
  );
  return provider;
}
```

### 15.3 HTTP-First Approach

Per [Section 2.7](#27-http-first-provider-implementation), providers SHOULD use direct HTTP calls rather than vendor SDKs.

### 15.4 Shared Utilities

UPP provides utilities for provider implementations. These are available from `@providerprotocol/ai/http`.

```ts
/**
 * Resolve API key from ProviderConfig, supporting string, function, or KeyStrategy.
 * If config.apiKey is not set, automatically falls back to standard environment variables:
 *   - Anthropic: ANTHROPIC_API_KEY
 *   - OpenAI: OPENAI_API_KEY
 *   - Google: GOOGLE_API_KEY, GEMINI_API_KEY
 *   - Stability: STABILITY_API_KEY
 *   - Voyage: VOYAGE_API_KEY
 * Throws UPPError with AUTHENTICATION_FAILED if no key is available.
 */
function resolveApiKey(config: ProviderConfig, envVar?: string): Promise<string>;

/**
 * Execute fetch with retry, timeout, and error normalization.
 * Uses config.retryStrategy for retry logic, config.timeout for request timeout,
 * and config.fetch for custom fetch implementation.
 * Automatically normalizes HTTP errors to UPPError.
 */
function doFetch(url: string, init: RequestInit, config: ProviderConfig): Promise<Response>;

/**
 * Parse Server-Sent Events stream into JSON objects.
 * Handles standard SSE format with "data:" prefix.
 * Yields parsed JSON for each event, terminates on "[DONE]" message.
 */
function parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown>;

/**
 * Normalize HTTP error responses to UPPError.
 * Maps HTTP status codes to appropriate ErrorCode values.
 * Extracts error message from response body when available.
 */
function normalizeHttpError(response: Response, provider: string, modality: Modality): Promise<UPPError>;
```

Reference implementations are provided by the UPP library.

---

## 16. Conformance

### 16.1 Provider Conformance Levels

Providers may implement one or more modalities. For each modality, conformance is defined at multiple levels.

#### 16.1.1 LLM Conformance

**Level 1: Core (Required)**
- Text input/output via `generate()` method
- Return `LLMResponse` with `AssistantMessage` and `TokenUsage`
- Basic configuration pass-through (`params`)
- Error normalization to `UPPError` with correct `modality: 'llm'`
- System prompt handling per vendor requirements

**Level 2: Streaming**
- `stream()` method implementation
- Proper `StreamEvent` emission with correct `StreamEventType`
- `LLMStreamResult` with `response` promise
- Support for `message_start`, `text_delta`, `message_stop` at minimum

**Level 3: Tools**
- Tool definition transformation (JSON Schema to vendor format)
- Tool call detection in responses (`AssistantMessage.toolCalls`)
- Tool result handling (`ToolResultMessage` transformation)
- Note: Tool execution loop is handled by llm() core, not providers

**Level 4: Structured Output**
- Transform `structure` schema to vendor format
- Enable vendor's structured output mode
- Parse and return structured data
- Validate response if vendor lacks native support

**Level 5: Multimodal Input**
- Image input handling (base64, URL conversion)
- Audio input handling (if supported by vendor)
- Video input handling (if supported by vendor)

#### 16.1.2 Embedding Conformance

**Level 1: Core (Required)**
- `embed()` method for single inputs
- Return `EmbeddingResponse` with vectors and usage
- Text input support
- Error normalization with `modality: 'embedding'`

**Level 2: Batch**
- Batch embedding via provider's batch API
- Respect `maxBatchSize` limits
- Aggregate usage reporting

**Level 3: Multimodal**
- Image embedding support (if vendor supports)
- Declare supported inputs in `supportedInputs`

#### 16.1.3 Image Conformance

**Level 1: Core (Required)**
- `generate()` method for text-to-image
- Return `ImageResponse` with `GeneratedImage` array
- Declare capabilities in `ImageCapabilities`
- Error normalization with `modality: 'image'`

**Level 2: Editing**
- `edit()` method for inpainting (if `capabilities.edit`)
- Mask handling

**Level 3: Variations**
- `vary()` method (if `capabilities.vary`)
- Strength/count parameters

**Level 4: Streaming**
- `stream()` method (if `capabilities.streaming`)
- Progress and preview fragments

**Level 5: Advanced**
- `upscale()` method (if `capabilities.upscale`)
- Outpainting support (if `capabilities.outpaint`)

### 16.2 Conformance Requirements

#### 16.2.1 Error Handling

All providers MUST:
- Normalize vendor errors to `UPPError`
- Set appropriate `ErrorCode` based on HTTP status or vendor error type
- Include `provider` name and `modality` in all errors
- Preserve original error as `cause` when available

#### 16.2.2 Configuration Pass-through

All providers MUST:
- Pass `params` to vendor API without modification (unless transformation required)
- Support custom `baseUrl` for proxies
- Support custom `fetch` implementation
- Respect `timeout` setting
- Use provided `retryStrategy` or sensible default

#### 16.2.3 Metadata Handling

All providers MUST:
- Namespace their metadata under `metadata.{providerName}`
- Preserve unknown metadata fields during round-trips
- Extract vendor-specific response fields to metadata

### 16.3 Interoperability Notes

The following features are provider-dependent and may not transfer between providers:

- Token counting algorithms and limits
- Specific tool calling formats and behaviors
- Streaming granularity and event types
- Response metadata structure
- Rate limiting behavior and headers
- Supported modalities and model capabilities
- Image size and format support
- Embedding dimensions and normalization

Developers should consult individual provider documentation for feature support details.

### 16.4 Capability Declaration

Providers SHOULD accurately declare their capabilities:

- `LLMHandler`: No explicit capability interface (check for method existence)
- `EmbeddingHandler`: Declare `supportedInputs` array
- `ImageHandler`: Declare full `ImageCapabilities` object

Applications SHOULD check capabilities before using optional features to ensure graceful degradation.

---

## Appendix A: Provider Implementation Pattern

This appendix shows the minimal pattern for implementing a provider. Full implementations require consulting vendor API documentation.

### A.1 Provider Entry Point

```ts
// @providerprotocol/ai/anthropic/index.ts
import { createProvider } from '@providerprotocol/ai';
import { createLLMHandler } from './llm';

export const anthropic = createProvider({
  name: 'anthropic',
  version: '1.0.0',
  modalities: {
    llm: createLLMHandler(),
  },
});

export type { AnthropicLLMParams } from './llm';
```

### A.2 LLM Handler Pattern

```ts
// @providerprotocol/ai/anthropic/llm.ts
import { LLMHandler, BoundLLMModel, LLMResponse } from '@providerprotocol/ai';
import { resolveApiKey, doFetch } from '@providerprotocol/ai/http';

export interface AnthropicLLMParams {
  max_tokens?: number;
  temperature?: number;
  // ... consult vendor documentation for full options
}

export function createLLMHandler(): LLMHandler<AnthropicLLMParams> {
  return {
    bind(modelId: string): BoundLLMModel<AnthropicLLMParams> {
      return {
        modelId,

        async complete(request) {
          const apiKey = await resolveApiKey(request.config, 'ANTHROPIC_API_KEY');

          // Transform UPP request to vendor format
          const body = transformRequest(request, modelId);

          const response = await doFetch(VENDOR_URL, {
            method: 'POST',
            headers: { /* vendor headers */ },
            body: JSON.stringify(body),
          }, request.config);

          const data = await response.json();

          // Transform vendor response to UPP format
          return transformResponse(data);
        },

        stream(request) {
          // Similar pattern with SSE parsing
          // Return LLMStreamResult with async iterator
        },
      };
    },
  };
}
```

### A.3 Embedding Handler Pattern

```ts
export function createEmbeddingHandler(): EmbeddingHandler<MyEmbedParams> {
  return {
    supportedInputs: ['text'],

    bind(modelId: string): BoundEmbeddingModel<MyEmbedParams> {
      return {
        modelId,
        maxBatchSize: 2048,
        maxInputLength: 8191,
        dimensions: 1536,

        async embed(request) {
          // Transform inputs, call vendor API, return EmbeddingResponse
        },
      };
    },
  };
}
```

### A.4 Image Handler Pattern

```ts
export function createImageHandler(): ImageHandler<MyImageParams> {
  return {
    bind(modelId: string): BoundImageModel<MyImageParams> {
      return {
        modelId,
        capabilities: {
          generate: true,
          streaming: false,
          edit: false,
          vary: false,
          upscale: false,
          outpaint: false,
          imageToImage: false,
          maxImages: 1,
          supportedSizes: ['1024x1024'],
          supportedFormats: ['png'],
        },

        async generate(request) {
          // Transform prompt, call vendor API, return ImageResponse
        },

        // Implement edit, vary, upscale if capabilities indicate support
      };
    },
  };
}
```

### A.5 Key Implementation Requirements

1. **Request transformation**: Convert UPP `Message[]` to vendor message format
2. **Response transformation**: Convert vendor response to `LLMResponse`, `EmbeddingResponse`, or `ImageResponse`
3. **Error normalization**: Wrap vendor errors in `UPPError` with appropriate `ErrorCode` and `modality`
4. **Streaming**: Parse SSE streams and emit `StreamEvent` objects
5. **Metadata namespacing**: Store vendor-specific data under `metadata.{providerName}`

Consult vendor API documentation for specific request/response formats, authentication methods, and available parameters.

---

## Changelog

### 1.1.0-draft

- **Renamed** from "useAI Provider Protocol" to "Unified Provider Protocol"
- **Renamed** package from `useAI` to `@providerprotocol/ai`
- **Renamed** entry points: `useAI()` → `llm()`, `useEmbedding()` → `embedding()`, `useImage()` → `image()`
- **Added** `ai` namespace export for grouped imports: `import { ai } from '@providerprotocol/ai'`
- **Renamed** related types (`AIInstance` → `LLMInstance`, `UseLLMOptions` → `LLMOptions`, etc.)
- **Added** `embedding()` interface for vector embeddings
- **Added** `image()` interface for image generation
- **Added** unified provider factories (single export per provider)
- **Added** `ModelReference` type for portable model references
- **Added** `createProvider()` helper for provider implementations
- **Added** `EmbeddingHandler`, `ImageHandler` interfaces
- **Added** `BoundEmbeddingModel`, `BoundImageModel` types
- **Added** `ImageCapabilities` for runtime feature detection
- **Added** `embedMany()` for large-scale embedding with progress
- **Added** optional similarity utilities
- **Added** image editing, variation, and upscaling interfaces
- **Added** `RetryStrategy` interface for pluggable retry/rate-limit handling
- **Replaced** `RetryConfig` with `RetryStrategy` for flexibility
- **Updated** `UPPError` with `modality` field
- **Updated** provider structure to use unified factories
- **Added** Conformance section (Section 16)
- **Added** migration guide from UPP-1.0

### 1.0.0-draft

- Initial draft specification (LLM-focused)
