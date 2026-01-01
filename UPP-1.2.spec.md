# UPP-1.2: Unified Provider Protocol Specification

**Version:** 1.2.0-draft
**Status:** Draft
**Authors:** UPP Working Group

---

## Abstract

The Unified Provider Protocol (UPP) is a language-agnostic specification for interacting with AI inference services. This document defines the protocol semantics, data structures, and implementation requirements for building UPP-compliant clients and providers in any programming language.

UPP establishes uniform interfaces for Large Language Models (LLM), Embedding Models, and Image Generation Models. The protocol enables multi-provider interoperability while preserving provider-native configuration and avoiding abstraction leakage.

UPP provides separate entry points for each modality—`llm()`, `embedding()`, `image()`—while sharing common provider infrastructure, configuration patterns, and design principles.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [Core Concepts](#3-core-concepts)
4. [Provider Protocol](#4-provider-protocol)
5. [LLM Interface](#5-llm-interface)
6. [Messages](#6-messages)
7. [Turns](#7-turns)
8. [Threads](#8-threads)
9. [Streaming](#9-streaming)
10. [Tools](#10-tools)
11. [Structured Outputs](#11-structured-outputs)
12. [Embedding Interface](#12-embedding-interface)
13. [Image Interface](#13-image-interface)
14. [Data Type Definitions](#14-data-type-definitions)
15. [Provider Implementation Guide](#15-provider-implementation-guide)
16. [Conformance](#16-conformance)
17. [Security Considerations](#17-security-considerations)

---

## 1. Introduction

### 1.1 Purpose

Modern AI development requires interacting with multiple providers (Anthropic, OpenAI, Google, Stability, Voyage, etc.), each with distinct APIs, authentication schemes, and response formats. UPP-1.2 establishes a standard protocol that:

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

### 1.6 Notation Conventions

This specification uses language-agnostic pseudocode for examples. The pseudocode follows these conventions:

- Function calls: `function_name(arg1, arg2)`
- Object/map literals: `{key: value, key2: value2}`
- Array/list literals: `[item1, item2, item3]`
- Property access: `object.property`
- Method calls: `object.method(args)`
- Async operations: `await expression`
- Iteration: `for item in collection`
- Type annotations: `variable: Type`
- Optional values: `Type?` or `Optional<Type>`
- Comments: `// comment text`

### 1.7 Code Examples

Code examples in this specification use the placeholder package name `upp`. Implementations MUST choose an appropriate package name for their ecosystem. Examples:

| Language | Example Package Name |
|----------|---------------------|
| JavaScript/TypeScript | `@upp/ai`, `unified-provider-protocol` |
| Python | `upp-ai`, `unified_provider_protocol` |
| Go | `github.com/org/upp` |
| Rust | `upp-protocol` |

Import syntax varies by language. Examples throughout this specification use JavaScript-style imports for readability:

```pseudocode
// Default export style
import anthropic from "upp/anthropic"

// Named export style
import { llm, embedding } from "upp"
```

Implementations SHOULD provide both styles where the language supports them. The semantic behavior is identical regardless of import syntax.

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

UPP **strongly recommends** that providers wrap vendor REST APIs directly using native HTTP primitives (e.g., `fetch`, `http.request`, `curl`) rather than depending on first-party vendor SDKs.

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
│                     Application Code                            │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
    │    llm()    │     │  embedding() │     │   image()   │
    │             │     │              │     │             │
    └─────────────┘     └──────────────┘     └─────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                  Provider Adapters                          │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
    │  │anthropic │  │  openai  │  │  google  │  │stability │    │
    │  │  (LLM)   │  │(LLM,Emb, │  │(LLM,Emb, │  │ (Image)  │    │
    │  │          │  │  Image)  │  │  Image)  │  │          │    │
    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Vendor APIs                              │
    │         (Anthropic, OpenAI, Google, Stability, etc.)        │
    └─────────────────────────────────────────────────────────────┘
```

### 3.2 Import Patterns

UPP implementations SHOULD export both a namespace object and individual functions, giving developers flexibility in import style.

**Namespace style (recommended for clarity):**

```pseudocode
import ai from "upp"
import anthropic from "upp/anthropic"
import voyage from "upp/voyage"

claude = ai.llm({
  model: anthropic("claude-sonnet-4-20250514"),
  system: "You are a helpful assistant."
})

embedder = ai.embedding({
  model: voyage("voyage-3")
})
```

**Direct import style (shorter):**

```pseudocode
import { llm, embedding } from "upp"
import openai from "upp/openai"

gpt = llm({ model: openai("gpt-4o") })
embedder = embedding({ model: openai("text-embedding-3-small") })
```

**Mix and match:**

```pseudocode
import { ai, llm } from "upp"

// Use direct import for frequently-used functions
claude = llm({ ... })

// Use namespace for less common modalities
imageGen = ai.image({ ... })
```

### 3.3 Provider Structure

A provider exports a single factory function that returns a `ModelReference`. The same factory works with any modality—the model ID determines which handler is used:

```pseudocode
import openai from "upp/openai"
import anthropic from "upp/anthropic"
import stability from "upp/stability"

// Same openai() factory works with all modalities
llm({ model: openai("gpt-4o") })
embedding({ model: openai("text-embedding-3-small") })
image({ model: openai("dall-e-3") })

// Providers that only support one modality still use the same pattern
llm({ model: anthropic("claude-sonnet-4-20250514") })
image({ model: stability("stable-diffusion-xl-1024-v1-0") })
```

Internally, each provider combines modality handlers:

```pseudocode
// Provider implementation structure
openai_provider = createProvider({
  name: "openai",
  modalities: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
    image: createImageHandler()
  }
})
```

### 3.4 Data Flow

#### LLM Data Flow

1. Developer calls `llm()` with a provider-bound model
2. Developer calls `generate()` or `stream()` with message history and new input
3. `llm()` core transforms input and manages tool execution loop (if tools configured)
4. Provider handles single request/response cycles, transforming to vendor-specific format
5. `llm()` core returns a `Turn` containing all messages from this inference
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

```pseudocode
import openai from "upp/openai"

// Provider config is shared
config = {
  apiKey: env.OPENAI_API_KEY,
  timeout: 30000,
  retryStrategy: ExponentialBackoff({ maxAttempts: 3 })
}

// Same openai() factory, different modalities
llmInstance = llm({
  model: openai("gpt-4o"),
  config: config,
  params: { temperature: 0.7, max_tokens: 4096 },  // LLM params
  system: "You are a helpful assistant.",
  tools: [getWeather]
})

embedder = embedding({
  model: openai("text-embedding-3-large"),
  config: config,
  params: { dimensions: 1536 }  // Embedding params
})

imageGen = image({
  model: openai("dall-e-3"),
  config: config,
  params: { size: "1024x1024", quality: "hd" }  // Image params
})
```

---

## 4. Provider Protocol

### 4.1 Shared Provider Infrastructure

All providers share common configuration and error handling.

**ProviderConfig Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | String \| Function \| KeyStrategy | No | API key - string, async function, or key strategy |
| `baseUrl` | String | No | Override the base API URL (for proxies, local models) |
| `timeout` | Integer | No | Request timeout in milliseconds |
| `fetch` | Function | No | Custom fetch implementation (for logging, caching, custom TLS) |
| `apiVersion` | String | No | API version override |
| `retryStrategy` | RetryStrategy | No | Retry strategy for handling failures and rate limits |

**Example configurations:**

```pseudocode
// Simple string key
config1 = { apiKey: "sk-xxx" }

// Async function key
config2 = { apiKey: () => fetchKeyFromVault() }

// Key strategy
config3 = { apiKey: RoundRobinKeys(["sk-1", "sk-2"]) }
```

#### Provider-Specific Options

`ProviderConfig` defines common infrastructure settings shared across all providers. However, some providers may offer additional options for vendor-specific operational choices—for example, selecting between different API variants.

These options are passed to the **provider factory function**, not to `ProviderConfig`:

```pseudocode
// Provider factory with optional options
openai(modelId: String, options?: OpenAIProviderOptions) -> ModelReference

// OpenAIProviderOptions structure
{
  api: "responses" | "completions"  // Which API to use
}
```

Usage:

```pseudocode
// Use the modern Responses API (default)
gpt = llm({
  model: openai("gpt-4o")
})

// Explicitly use the legacy Completions API
gptLegacy = llm({
  model: openai("gpt-4o", { api: "completions" })
})
```

Provider options should be:
- **Rare**: Most providers need no options beyond the model ID
- **Well-documented**: Clearly explain when and why each option is needed
- **Defaulted sensibly**: The provider should work without any options

Note: Fundamentally different deployment targets (e.g., Google Vertex AI vs standard Gemini API) should be implemented as **separate providers** rather than options on a single provider.

### 4.2 Key Strategies

UPP provides built-in key strategies for API key management:

**KeyStrategy Interface:**

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getKey()` | String \| Promise<String> | Get the next API key to use |

**RoundRobinKeys:**

Cycles through a list of API keys in order.

```pseudocode
strategy = RoundRobinKeys(["sk-1", "sk-2", "sk-3"])
// First call returns "sk-1", second "sk-2", third "sk-3", fourth "sk-1", etc.
```

**WeightedKeys:**

Random selection with weights.

```pseudocode
strategy = WeightedKeys([
  { key: "sk-primary", weight: 0.8 },
  { key: "sk-backup", weight: 0.2 }
])
// 80% chance of returning "sk-primary"
```

**DynamicKey:**

Custom async key selection logic.

```pseudocode
strategy = DynamicKey(() => {
  return fetchKeyFromSecretManager()
})
```

### 4.3 Retry Strategies

**RetryStrategy Interface:**

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `onRetry` | error: UPPError, attempt: Integer | Integer \| null \| Promise | Returns delay in ms before retry, or null to stop |
| `beforeRequest` | (none) | Integer \| Promise<Integer> | Optional. Returns delay before making request (pre-emptive rate limiting) |
| `reset` | (none) | void | Optional. Reset strategy state after success |

**Standard Implementations:**

```pseudocode
// Exponential backoff with jitter
ExponentialBackoff({
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  jitter: true
})

// Linear backoff
LinearBackoff({
  maxAttempts: 3,
  delay: 2000
})

// No retry
NoRetry()

// Token bucket rate limiting
TokenBucket({
  capacity: 100,
  refillRate: 10  // tokens per second
})

// Honor server Retry-After headers
RetryAfterStrategy({
  fallbackDelay: 5000
})
```

**Custom strategy example:**

```pseudocode
class MyCustomStrategy implements RetryStrategy {
  onRetry(error, attempt) {
    if (attempt >= 5) return null  // Stop retrying
    if (error.code == "RATE_LIMITED") return 5000  // 5 second delay
    return 1000  // 1 second delay for other errors
  }
}
```

### 4.4 Error Handling

All modalities normalize errors to `UPPError`:

**UPPError Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `message` | String | Human-readable error message |
| `code` | ErrorCode | Standardized error code |
| `provider` | String | Provider name (e.g., "anthropic") |
| `modality` | Modality | Which modality: "llm", "embedding", "image" |
| `statusCode` | Integer? | HTTP status code if applicable |
| `cause` | Error? | Original underlying error |

**ErrorCode Values:**

| Code | Description |
|------|-------------|
| `AUTHENTICATION_FAILED` | Invalid or missing API key |
| `RATE_LIMITED` | Too many requests |
| `CONTEXT_LENGTH_EXCEEDED` | Input exceeds model context limit |
| `MODEL_NOT_FOUND` | Requested model doesn't exist |
| `INVALID_REQUEST` | Malformed request |
| `INVALID_RESPONSE` | Response failed validation (e.g., structured output) |
| `CONTENT_FILTERED` | Content policy violation |
| `QUOTA_EXCEEDED` | Usage limits exceeded |
| `PROVIDER_ERROR` | Provider-side error |
| `NETWORK_ERROR` | Connection failure |
| `TIMEOUT` | Request timed out |
| `CANCELLED` | Operation was cancelled |

**Modality Values:**

| Value | Description |
|-------|-------------|
| `llm` | Large Language Model operations |
| `embedding` | Vector embedding operations |
| `image` | Image generation operations |
| `audio` | Audio operations (future) |
| `video` | Video operations (future) |

### 4.5 Provider and ModelReference

A provider is a factory function that returns a `ModelReference`. The modality functions resolve the appropriate handler based on the modality.

**ModelReference Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `modelId` | String | The model identifier |
| `provider` | Provider | The provider that created this reference |

**Provider Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Provider name |
| `version` | String | Provider version |
| `modalities` | Map | Supported modality handlers |

The provider is also callable as a function:

```pseudocode
// Provider as function
modelRef = provider(modelId, options?)

// Provider properties
provider.name      // "openai"
provider.version   // "1.0.0"
provider.modalities.llm        // LLMHandler or null
provider.modalities.embedding  // EmbeddingHandler or null
provider.modalities.image      // ImageHandler or null
```

**Handler Interfaces:**

Each modality handler has a `bind` method that creates an executable bound model:

```pseudocode
// LLMHandler
interface LLMHandler {
  bind(modelId: String) -> BoundLLMModel
}

// EmbeddingHandler
interface EmbeddingHandler {
  supportedInputs: List<String>  // ["text", "image"]
  bind(modelId: String) -> BoundEmbeddingModel
}

// ImageHandler
interface ImageHandler {
  bind(modelId: String) -> BoundImageModel
}
```

### 4.6 Provider Registration

Providers are imported from their respective modules:

```pseudocode
import openai from "upp/openai"
import anthropic from "upp/anthropic"
import google from "upp/google"
import stability from "upp/stability"
import voyage from "upp/voyage"

// All use the same pattern - single factory per provider
llm({ model: openai("gpt-4o") })
llm({ model: anthropic("claude-sonnet-4-20250514") })
llm({ model: google("gemini-pro") })

embedding({ model: openai("text-embedding-3-small") })
embedding({ model: google("text-embedding-004") })
embedding({ model: voyage("voyage-3") })

image({ model: openai("dall-e-3") })
image({ model: google("imagen-3.0-generate-001") })
image({ model: stability("stable-diffusion-xl-1024-v1-0") })
```

When a modality function receives a `ModelReference`, it:
1. Checks if the provider supports that modality
2. MUST throw `UPPError` with code `INVALID_REQUEST` if not supported
3. Binds the model ID to create the executable model

---

## 5. LLM Interface

### 5.1 Function Signature

```pseudocode
llm(options: LLMOptions) -> LLMInstance
```

### 5.2 Options

**LLMOptions Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelReference | Yes | A model reference from a provider factory |
| `config` | ProviderConfig | No | Provider infrastructure configuration (uses env vars if omitted) |
| `params` | Map | No | Model-specific parameters (temperature, max_tokens, etc.) |
| `system` | String | No | System prompt for all inferences |
| `tools` | List<Tool> | No | Tools available to the model |
| `toolStrategy` | ToolUseStrategy | No | Tool execution strategy |
| `structure` | JSONSchema | No | Structured output schema |

### 5.3 LLMInstance

**LLMInstance Interface:**

| Method/Property | Type | Description |
|-----------------|------|-------------|
| `generate(...)` | Function | Execute inference and return complete Turn |
| `stream(...)` | Function | Execute streaming inference |
| `model` | BoundLLMModel | The bound model |
| `system` | String? | Current system prompt |
| `params` | Map? | Current parameters |
| `capabilities` | LLMCapabilities | Provider API capabilities |

**generate() Overloads:**

```pseudocode
// No history - single input
generate(input: InferenceInput) -> Promise<Turn>

// No history - multiple inputs
generate(...inputs: InferenceInput[]) -> Promise<Turn>

// With history
generate(history: List<Message> | Thread, ...inputs: InferenceInput[]) -> Promise<Turn>
```

**stream() Overloads:**

```pseudocode
// No history - single input
stream(input: InferenceInput) -> StreamResult

// No history - multiple inputs
stream(...inputs: InferenceInput[]) -> StreamResult

// With history
stream(history: List<Message> | Thread, ...inputs: InferenceInput[]) -> StreamResult
```

**InferenceInput Type:**

```pseudocode
InferenceInput = String | Message | ContentBlock
```

**History Detection:**

`llm()` determines if the first argument is history or input:
- `List<Message>` or `Thread` → history
- `String`, `Message`, or `ContentBlock` → input (no history)

```pseudocode
// No history - one-shot inference
await claude.generate("What is 2+2?")

// No history - multiple inputs
await claude.generate("Look at this:", imageBlock)

// With history
await claude.generate(history, "Follow-up question")
await claude.generate(thread, "Continue the conversation")
```

### 5.4 LLMCapabilities

`LLMCapabilities` declares what the **provider's API** supports, not individual model capabilities. If a user attempts to use a feature with a model that doesn't support it, the provider's API will return an error—this is expected behavior.

**LLMCapabilities Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `streaming` | Boolean | Provider API supports streaming responses |
| `tools` | Boolean | Provider API supports tool/function calling |
| `structuredOutput` | Boolean | Provider API supports native structured output |
| `imageInput` | Boolean | Provider API supports image input |
| `videoInput` | Boolean | Provider API supports video input |
| `audioInput` | Boolean | Provider API supports audio input |

**Capabilities are static.** A provider's capabilities are constant for the lifetime of the provider instance and do not vary per-request or per-model. They reflect what the provider's API supports, determined at provider implementation time.

### 5.5 BoundLLMModel

**BoundLLMModel Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `modelId` | String | The model identifier |
| `capabilities` | LLMCapabilities | Provider API capabilities |
| `complete(request)` | Function | Execute a single non-streaming inference request |
| `stream(request)` | Function | Execute a single streaming inference request |

**LLMRequest Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `messages` | List<Message> | All messages for this request (history + new input) |
| `system` | String? | System prompt |
| `params` | Map? | Model-specific parameters (passed through unchanged) |
| `tools` | List<Tool>? | Tools available for this request |
| `structure` | JSONSchema? | Structured output schema (if requested) |
| `config` | ProviderConfig | Provider infrastructure config (resolved by llm() core) |
| `signal` | AbortSignal? | Abort signal for cancellation |

**LLMResponse Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `message` | AssistantMessage | The assistant's response |
| `usage` | TokenUsage | Token consumption |
| `stopReason` | String | Why generation stopped |

**LLMStreamResult:**

An async iterable of `StreamEvent` objects with a `response` property that resolves to `LLMResponse`.

### 5.6 Basic Usage

```pseudocode
import { llm } from "upp"
import anthropic from "upp/anthropic"

claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: {
    apiKey: env.ANTHROPIC_API_KEY
  },
  system: "You are a helpful assistant."
})

// Simple one-shot inference (no history needed)
turn = await claude.generate("What is the capital of France?")
print(turn.response.text)  // "The capital of France is Paris."
```

### 5.7 Full Configuration

```pseudocode
import { llm, RoundRobinKeys, ExponentialBackoff } from "upp"
import anthropic from "upp/anthropic"

claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: {
    apiKey: RoundRobinKeys([
      env.ANTHROPIC_KEY_1,
      env.ANTHROPIC_KEY_2
    ]),
    baseUrl: "https://my-proxy.example.com",
    timeout: 30000,
    retryStrategy: ExponentialBackoff({ maxAttempts: 3 })
  },
  params: {
    max_tokens: 4096,
    temperature: 0.7
  },
  system: "You are a friendly AI assistant."
})
```

### 5.8 Tool Execution Loop

`llm()` core manages the tool execution loop. Providers only handle single request/response cycles.

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
              │  provider.complete()    │◄────────────────┐
              │  (single request)       │                 │
              └─────────────────────────┘                 │
                            │                             │
                            ▼                             │
              ┌─────────────────────────┐                 │
              │  response.hasToolCalls? │──── No ────┐    │
              │                         │            │    │
              └─────────────────────────┘            │    │
                            │                        │    │
                           Yes                       │    │
                            │                        │    │
                            ▼                        │    │
              ┌─────────────────────────┐            │    │
              │  iterations <           │── No ──►  Error │
              │  maxIterations?         │                 │
              └─────────────────────────┘                 │
                            │                             │
                           Yes                            │
                            │                             │
                            ▼                             │
              ┌─────────────────────────┐                 │
              │  Execute tools          │                 │
              │  (parallel if multiple) │                 │
              └─────────────────────────┘                 │
                            │                             │
                            ▼                             │
              ┌─────────────────────────┐                 │
              │  Append AssistantMsg    │                 │
              │  (with toolCalls)       │                 │
              │  Append ToolResultMsg   │                 │
              │  to messages            │─────────────────┘
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

### 5.9 Conversation Flow

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "You are a helpful assistant."
})

// User manages their own history
history = []

// First turn
turn1 = await claude.generate(history, "My name is Alice.")
history.push(...turn1.messages)

// Second turn (history preserved)
turn2 = await claude.generate(history, "What is my name?")
history.push(...turn2.messages)

print(turn2.response.text)  // "Your name is Alice."
```

### 5.10 Provider Responsibilities

#### 5.10.1 Request Transformation

The provider MUST transform UPP structures to vendor format:

- Convert `Message` types to vendor message format
- Handle system prompt according to vendor requirements (top-level param vs message)
- Convert `Tool` definitions from JSON Schema to vendor tool format
- Convert binary data (images, audio) to vendor-required encoding (e.g., base64)
- Transform structured output schema to vendor format (if supported)

#### 5.10.2 Response Transformation

The provider MUST transform vendor responses to UPP structures:

- Map vendor response to `AssistantMessage` (which may include `toolCalls`)
- Map streaming chunks to `StreamEvent` with appropriate event metadata
- Preserve vendor-specific metadata in `Message.metadata` under the provider's namespace

**Note:** The provider returns a single `LLMResponse`. `llm()` core handles constructing the full `Turn` including tool loops.

#### 5.10.3 Metadata Handling

Providers MUST handle their own metadata namespace in `Message.metadata`:

**Extracting metadata from responses:**

```pseudocode
// Google provider extracting thought_signature
message = AssistantMessage(content, toolCalls, {
  metadata: {
    google: {
      thought_signature: vendorResponse.thought_signature
    }
  }
})
```

**Including metadata in requests:**

```pseudocode
// When sending messages back to the API, providers extract their namespace
function transformToVendor(message) {
  googleMeta = message.metadata?.google
  return {
    role: message.type,
    content: transformContent(message.content),
    // Include provider-specific fields
    thought_signature: googleMeta?.thought_signature
  }
}
```

Providers SHOULD preserve unknown metadata fields during round-trips to support future API additions.

#### 5.10.4 System Prompt Handling

The provider MUST handle system prompts according to vendor requirements:

| Provider | System Prompt Handling |
|----------|----------------------|
| Anthropic | Top-level `system` parameter |
| OpenAI | Message with `role: "system"` |
| Google | `systemInstruction` field |

`llm()` accepts system prompts at the options level and providers transform accordingly.

#### 5.10.5 Structured Output Handling

If `structure` is provided:

1. `llm()` core checks `capabilities.structuredOutput`
2. If `false`, MUST throw `UPPError` with code `INVALID_REQUEST`
3. If `true`, the provider MUST:
   - Transform the JSON Schema to vendor-specific format (if different)
   - Enable structured output mode on the API request
   - Parse the response as JSON and return the parsed object

UPP does NOT validate the response against the schema. Modern LLMs with structured output support reliably produce conformant output. If validation is required, it is the application's responsibility. UPP does NOT automatically retry on schema mismatch.

Similarly, `llm()` core checks capabilities before using other features:
- `tools` provided but `capabilities.tools` is `false` → MUST throw `INVALID_REQUEST`
- Image content provided but `capabilities.imageInput` is `false` → MUST throw `INVALID_REQUEST`
- `stream()` called but `capabilities.streaming` is `false` → MUST throw `INVALID_REQUEST`

#### 5.10.6 Error Handling

The provider MUST normalize errors to `UPPError`:

```pseudocode
class UPPError extends Error {
  code: ErrorCode
  provider: String
  modality: Modality
  statusCode: Integer?
  cause: Error?

  constructor(message, code, provider, modality, statusCode?, cause?) {
    super(message)
    this.code = code
    this.provider = provider
    this.modality = modality
    this.statusCode = statusCode
    this.cause = cause
  }
}
```

---

## 6. Messages

### 6.1 Message Hierarchy

Messages are represented as a type hierarchy, allowing type-safe handling and provider-specific transformations.

**Base Message Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique message identifier |
| `timestamp` | Timestamp | When the message was created |
| `metadata` | Map? | Provider-specific metadata, namespaced by provider |
| `type` | MessageType | Message type discriminator |
| `text` | String | Convenience accessor - concatenates all text blocks with "\n\n" |
| `images` | List<ImageBlock> | Convenience accessor - returns all image blocks |
| `audio` | List<AudioBlock> | Convenience accessor - returns all audio blocks |
| `video` | List<VideoBlock> | Convenience accessor - returns all video blocks |

**MessageType Values:**

| Value | Description |
|-------|-------------|
| `user` | User input message |
| `assistant` | Assistant response message |
| `tool_result` | Result of tool execution |

**MessageMetadata Structure:**

Provider-namespaced metadata. Each provider defines its own metadata shape.

```pseudocode
{
  google: { thought_signature: "abc123..." },
  openai: { reasoning_encrypted: "..." },
  anthropic: { cache_control: { type: "ephemeral" } }
}
```

### 6.2 Message Types

**UserMessage:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | "user" | Always "user" |
| `content` | List<UserContent> | Content blocks |

`UserContent` can be: `TextBlock`, `ImageBlock`, `AudioBlock`, `VideoBlock`, `BinaryBlock`

Constructor accepts either a string (converted to TextBlock) or array of content blocks.

**AssistantMessage:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | "assistant" | Always "assistant" |
| `content` | List<AssistantContent> | Content blocks |
| `toolCalls` | List<ToolCall>? | Tool calls requested by the model |
| `hasToolCalls` | Boolean | Convenience: true if toolCalls is non-empty |

`AssistantContent` can be: `TextBlock`, `ImageBlock`, `AudioBlock`, `VideoBlock`

**Note:** Models can return both text AND tool calls in a single response (e.g., "I'll check the weather for you." + tool call). `AssistantMessage` handles both cases.

**ToolResultMessage:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | "tool_result" | Always "tool_result" |
| `results` | List<ToolResult> | Tool execution results |

**ToolCall Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `toolCallId` | String | Provider-assigned ID |
| `toolName` | String | Name of tool to invoke |
| `arguments` | Map | Arguments for the tool |

**ToolResult Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `toolCallId` | String | Matching tool_call_id |
| `result` | Any | Result value |
| `isError` | Boolean? | Whether this is an error result (default false) |

**MessageOptions Structure:**

Optional configuration passed to message constructors.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String? | Custom message ID (auto-generated if not provided) |
| `metadata` | MessageMetadata? | Provider-namespaced metadata |

**Message Construction:**

All message types accept an optional `MessageOptions` parameter:

```pseudocode
// UserMessage construction
UserMessage(content: String | List<UserContent>, options?: MessageOptions)

// AssistantMessage construction
AssistantMessage(content: String | List<AssistantContent>, toolCalls?: List<ToolCall>, options?: MessageOptions)

// ToolResultMessage construction
ToolResultMessage(results: List<ToolResult>, options?: MessageOptions)
```

### 6.3 Content Blocks

Content blocks represent discrete pieces of content within messages.

**TextBlock:**

```pseudocode
{
  type: "text",
  text: "Hello, world!"
}
```

**ImageBlock:**

```pseudocode
{
  type: "image",
  source: ImageSource,
  mimeType: "image/png",
  width: 1024,      // optional
  height: 768       // optional
}
```

**ImageSource Variants:**

```pseudocode
// Base64 encoded
{ type: "base64", data: "iVBORw0KGgo..." }

// URL reference
{ type: "url", url: "https://example.com/image.png" }

// Raw bytes
{ type: "bytes", data: <binary data> }
```

**AudioBlock:**

```pseudocode
{
  type: "audio",
  data: <binary data>,
  mimeType: "audio/wav",
  duration: 5.5     // optional, seconds
}
```

**VideoBlock:**

```pseudocode
{
  type: "video",
  data: <binary data>,
  mimeType: "video/mp4",
  duration: 30.0,   // optional, seconds
  width: 1920,      // optional
  height: 1080      // optional
}
```

**BinaryBlock:**

```pseudocode
{
  type: "binary",
  data: <binary data>,
  mimeType: "application/pdf",
  metadata: {}      // optional
}
```

**Note:** `BinaryBlock` is only valid in `UserContent` (user inputs). Models do not produce binary outputs directly; they return text, images, audio, or video blocks. Applications sending arbitrary file data to models MUST use `BinaryBlock` in user messages.

### 6.4 Message Construction

```pseudocode
// Text user message
userMsg = UserMessage("Hello, world!")

// User message with image
imageMsg = UserMessage([
  await Image.fromPath("diagram.png"),
  "Please explain this diagram"
])

// User message with URL-based image
urlImageMsg = UserMessage([
  Image.fromUrl("https://example.com/image.png"),
  "What is this?"
])

// Assistant message (text only)
assistantMsg = AssistantMessage("I can help with that!")

// Assistant message with tool calls (typically created by provider)
assistantWithTools = AssistantMessage(
  [{ type: "text", text: "I'll check the weather for you." }],
  [{ toolCallId: "call_123", toolName: "getWeather", arguments: { location: "Tokyo" } }]
)

// Tool result message (created by llm() core after tool execution)
toolResultMsg = ToolResultMessage([
  { toolCallId: "call_123", result: "72°F, sunny" }
])
```

### 6.5 Image Type

Implementations SHOULD provide an `Image` type with factory methods:

**Image Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `source` | ImageSource | The image source |
| `mimeType` | String | MIME type |
| `width` | Integer? | Width in pixels |
| `height` | Integer? | Height in pixels |
| `hasData` | Boolean | True if data is loaded (false for URL sources) |

**Image Methods:**

| Method | Return Type | Description |
|--------|-------------|-------------|
| `toBase64()` | String | Convert to base64 string (throws if URL source) |
| `toDataUrl()` | String | Convert to data URL (throws if URL source) |
| `toBytes()` | Bytes | Get raw bytes (throws if URL source) |

**Image Factory Methods:**

| Method | Description |
|--------|-------------|
| `Image.fromPath(path)` | Create from file path (reads file into memory) |
| `Image.fromUrl(url, mimeType?)` | Create from URL reference (does not fetch) |
| `Image.fromBytes(data, mimeType)` | Create from raw bytes |
| `Image.fromBase64(base64, mimeType)` | Create from base64 string |

### 6.6 Type Guards

UPP implementations SHOULD provide type guard functions for message handling:

```pseudocode
isUserMessage(msg: Message) -> Boolean
isAssistantMessage(msg: Message) -> Boolean
isToolResultMessage(msg: Message) -> Boolean

// Usage
for msg in turn.messages {
  if (isAssistantMessage(msg)) {
    print("Response:", msg.text)
    if (msg.hasToolCalls) {
      print("Tool calls:", msg.toolCalls)
    }
  } else if (isToolResultMessage(msg)) {
    print("Tool results:", msg.results)
  }
}
```

---

## 7. Turns

### 7.1 Turn Structure

A `Turn` represents the complete result of one inference call, including all messages produced during tool execution loops.

**Turn Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `messages` | List<Message> | All messages produced, in chronological order |
| `response` | AssistantMessage | The final assistant response (convenience accessor) |
| `toolExecutions` | List<ToolExecution> | Tool executions that occurred |
| `usage` | TokenUsage | Aggregate token usage for the entire turn |
| `cycles` | Integer | Total number of inference cycles (1 + tool rounds) |
| `data` | Any? | Structured output data (if structure was provided) |

**ToolExecution Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | String | The tool that was called |
| `toolCallId` | String | Tool call ID |
| `arguments` | Map | Arguments passed to the tool |
| `result` | Any | Result returned by the tool |
| `isError` | Boolean | Whether the execution resulted in an error |
| `duration` | Integer | Execution duration in milliseconds |
| `approved` | Boolean? | Whether approval was required and granted |

**TokenUsage Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `inputTokens` | Integer | Input tokens across all cycles |
| `outputTokens` | Integer | Output tokens across all cycles |
| `totalTokens` | Integer | Total tokens |
| `cycles` | List<CycleUsage>? | Per-cycle breakdown (if available) |

**CycleUsage Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `inputTokens` | Integer | Input tokens for this cycle |
| `outputTokens` | Integer | Output tokens for this cycle |

### 7.2 Turn Usage

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "You are a helpful assistant.",
  tools: [getWeather]
})

history = []

// This turn might involve tool calls
turn = await claude.generate(history, "What is the weather in Tokyo?")

// Turn contains ALL messages from this inference:
// 1. UserMessage: "What is the weather in Tokyo?"
// 2. AssistantMessage: { toolCalls: [{ toolName: "getWeather", arguments: { location: "Tokyo" } }] }
// 3. ToolResultMessage: [{ result: "72°F, sunny" }]
// 4. AssistantMessage: "The weather in Tokyo is 72°F and sunny!"

print(turn.messages.length)  // 4
print(turn.response.text)    // "The weather in Tokyo is 72°F and sunny!"
print(turn.toolExecutions)   // [{ toolName: "getWeather", ... }]
print(turn.cycles)           // 2 (initial + after tool)

// Append all messages to history for next turn
history.push(...turn.messages)
```

### 7.3 Turn Without Tool Calls

When no tools are called, the turn contains just the user input and assistant response:

```pseudocode
turn = await claude.generate("Hello!")

print(turn.messages.length)       // 2
print(turn.messages[0].type)      // "user"
print(turn.messages[1].type)      // "assistant"
print(turn.response.text)         // "Hello! How can I help you today?"
print(turn.response.hasToolCalls) // false
print(turn.toolExecutions)        // []
print(turn.cycles)                // 1
```

---

## 8. Threads

### 8.1 Thread as Utility

`Thread` is an **optional** utility class for managing conversation history. UPP does not manage threads internally—users control their own history.

**Thread Structure:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | String | Unique thread identifier |
| `messages` | List<Message> | All messages in the thread (read-only) |
| `length` | Integer | Number of messages |

**Thread Methods:**

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `append` | turn: Turn | Thread | Append messages from a turn |
| `push` | ...messages: Message[] | Thread | Add raw messages |
| `user` | content: String \| List<ContentBlock> | Thread | Add a user message |
| `assistant` | content: String \| List<ContentBlock> | Thread | Add an assistant message |
| `filter` | type: MessageType | List<Message> | Get messages by type |
| `tail` | count: Integer | List<Message> | Get the last N messages |
| `slice` | start?: Integer, end?: Integer | Thread | Create new thread with subset |
| `clear` | (none) | Thread | Clear all messages |
| `toMessages` | (none) | List<Message> | Convert to plain message array |
| `toJSON` | (none) | ThreadJSON | Serialize to JSON |
| (iterable) | — | Iterator<Message> | Thread is iterable over its messages |

**Thread Static Methods:**

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `fromJSON` | json: ThreadJSON | Thread | Deserialize from JSON |

### 8.2 Thread Usage

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "You are a helpful assistant."
})

// Using Thread utility
thread = Thread()

turn1 = await claude.generate(thread, "My name is Bob.")
thread.append(turn1)

turn2 = await claude.generate(thread, "What did I just tell you?")
thread.append(turn2)

print(turn2.response.text)  // "You told me your name is Bob."
print(thread.length)        // 4 messages

// Serialize for storage
json = thread.toJSON()
storage.set("conversation", json)

// Restore later
restored = Thread.fromJSON(storage.get("conversation"))
```

### 8.3 Using Raw Arrays

Threads are optional—you can use plain arrays:

```pseudocode
messages = []

turn = await claude.generate(messages, "Hello!")
messages.push(...turn.messages)
```

### 8.4 Thread Serialization

**ThreadJSON Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique thread identifier |
| `messages` | List<MessageJSON> | Yes | All messages in the thread |
| `createdAt` | String (ISO 8601) | Yes | Thread creation timestamp |
| `updatedAt` | String (ISO 8601) | Yes | Last update timestamp |

**MessageJSON Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique message identifier |
| `type` | MessageType | Yes | "user", "assistant", or "tool_result" |
| `content` | List<ContentBlock> | Yes | Message content blocks |
| `toolCalls` | List<ToolCall> | No | Tool calls (assistant messages only) |
| `results` | List<ToolResult> | No | Tool results (tool_result messages only) |
| `metadata` | MessageMetadata | No | Provider-namespaced metadata |
| `timestamp` | String (ISO 8601) | Yes | Message timestamp |

**Example:**

```pseudocode
// ThreadJSON
{
  id: "thread_abc123",
  messages: [<MessageJSON>, ...],
  createdAt: "2024-01-15T10:30:00Z",
  updatedAt: "2024-01-15T10:35:00Z"
}

// MessageJSON
{
  id: "msg_xyz789",
  type: "assistant",
  content: [{ type: "text", text: "Hello!" }],
  toolCalls: [],
  metadata: {},
  timestamp: "2024-01-15T10:30:00Z"
}
```

---

## 9. Streaming

### 9.1 StreamResult

Streaming returns a `StreamResult` that is both an async iterable and provides access to the final `Turn`:

**StreamResult Interface:**

| Property/Method | Type | Description |
|-----------------|------|-------------|
| (async iterable) | AsyncIterator<StreamEvent> | StreamResult is async iterable over events |
| `turn` | Promise<Turn> | Resolves to complete Turn after streaming |
| `abort()` | Function | Abort the stream |

### 9.2 StreamEvent

During streaming, providers emit `StreamEvent` objects:

**StreamEvent Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | StreamEventType | Event type |
| `index` | Integer | Index of the content block this event belongs to |
| `delta` | EventDelta | Event data (type-specific) |

**StreamEventType Values:**

| Value | Description |
|-------|-------------|
| `text_delta` | Partial text token |
| `reasoning_delta` | Reasoning/thinking token |
| `image_delta` | Partial image data |
| `audio_delta` | Partial audio data |
| `video_delta` | Partial video data |
| `tool_call_delta` | Partial tool call |
| `message_start` | Stream started |
| `message_stop` | Stream complete |
| `content_block_start` | New content block started |
| `content_block_stop` | Content block complete |

**EventDelta Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `text` | String? | Text content |
| `data` | Bytes? | Binary data |
| `toolCallId` | String? | Tool call ID |
| `toolName` | String? | Tool name |
| `argumentsJson` | String? | Partial JSON arguments |

### 9.3 Streaming Usage

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "You are a helpful assistant."
})

history = []

// Stream the response
stream = claude.stream(history, "Write a haiku about programming.")

for await (event in stream) {
  if (event.type == "text_delta") {
    print(event.delta.text, end="")
  }
}

// Get the complete turn after streaming
turn = await stream.turn
history.push(...turn.messages)
```

### 9.4 Streaming with Tools

When tools are involved, streaming may pause while tools execute:

```pseudocode
stream = claude.stream(history, "What is the weather in Paris?")

for await (event in stream) {
  switch (event.type) {
    case "text_delta":
      print(event.delta.text, end="")
      break
    case "tool_call_delta":
      // Tool call being streamed
      print("[tool]", event.delta.toolName)
      break
    case "message_stop":
      // A message completed (might be tool call, will continue after tool runs)
      break
  }
}

turn = await stream.turn
print("Tool executions:", turn.toolExecutions)
```

### 9.5 Aborting Streams

```pseudocode
stream = claude.stream(history, "Write a very long story...")

// Cancel after 5 seconds
setTimeout(() => {
  stream.abort()
}, 5000)

try {
  for await (event in stream) {
    print(event.delta.text, end="")
  }
} catch (error) {
  if (error instanceof UPPError && error.code == "CANCELLED") {
    print("Stream was cancelled")
  }
}
```

**Abort behavior with tools:** When a stream is aborted during a tool execution loop, the abort signal propagates to any in-flight tool execution. The current tool's `run` function receives the abort via `AbortSignal` (if it accepts one). Pending tool calls that haven't started execution MUST be skipped. The overall generation MUST throw a `CANCELLED` error.

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

Tools use **JSON Schema** for parameter definitions.

**Tool Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | Tool name (must be unique within an llm() instance) |
| `description` | String | Yes | Human-readable description for the model |
| `parameters` | JSONSchema | Yes | JSON Schema defining parameters |
| `run` | Function | Yes | Tool execution function |
| `approval` | Function | No | Optional approval handler for sensitive operations |

**JSONSchema Structure (for tool parameters):**

```pseudocode
{
  type: "object",
  properties: {
    paramName: {
      type: "string" | "number" | "integer" | "boolean" | "array" | "object",
      description: "Parameter description",
      enum: [...],        // optional
      items: {...},       // for arrays
      properties: {...},  // for nested objects
      required: [...],    // for nested objects
      default: value      // optional
    }
  },
  required: ["paramName", ...]
}
```

### 10.2 Tool Example

```pseudocode
getWeather = {
  name: "getWeather",
  description: "Get current weather for a location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "City name or coordinates"
      },
      units: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        default: "celsius"
      }
    },
    required: ["location"]
  },
  run: async (params) => {
    weather = await fetchWeather(params.location, params.units ?? "celsius")
    return weather.temp + "° " + params.units + ", " + weather.condition
  }
}

claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "You are a weather assistant.",
  tools: [getWeather]
})
```

### 10.3 Tool Approval

For sensitive operations, tools can require approval:

```pseudocode
deleteFile = {
  name: "deleteFile",
  description: "Delete a file from the filesystem",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to delete" }
    },
    required: ["path"]
  },
  approval: async (params) => {
    // UI prompt, admin check, path validation, etc.
    return await promptUser("Allow deletion of " + params.path + "?")
  },
  run: async (params) => {
    await fs.unlink(params.path)
    return "Deleted " + params.path
  }
}
```

### 10.4 Tool Execution Flow

By default, `llm()` handles tool execution automatically:

1. Model returns an `AssistantMessage` with `toolCalls`
2. If `approval` is defined, it's called first (rejected = error result sent to model)
3. Tool's `run` function is executed with arguments from the model
4. Result (or error) is sent back to the model as `ToolResultMessage`
5. Loop continues until model returns without tool calls OR max iterations reached

**Error handling:**
- If `approval()` throws an exception, the exception propagates to the caller and aborts the generation
- If `approval()` returns `false`, an error result is sent to the model
- If the tool's `run` function throws, the error is caught and sent as an error result to the model

**Important:** `llm()` does NOT validate tool arguments against the JSON Schema. The schema is provided to the model to guide its output, but validation and sanitization of LLM-provided arguments is the responsibility of the tool implementation. Always treat tool arguments as untrusted input.

**Note:** Similarly, UPP does not validate structured output responses against their schema (see Section 11). Schemas guide LLM behavior but validation is the application's responsibility in both cases.

### 10.5 ToolUseStrategy

For custom control over tool execution:

**ToolUseStrategy Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `maxIterations` | Integer | Maximum tool execution rounds (default: 10) |
| `onToolCall` | Function | Called when the model requests a tool call |
| `onBeforeCall` | Function | Called before tool execution, return false to skip |
| `onAfterCall` | Function | Called after tool execution |
| `onError` | Function | Called on tool execution error |
| `onMaxIterations` | Function | Called when max iterations reached |

### 10.6 Strategy Example

```pseudocode
strategy = {
  maxIterations: 5,

  onBeforeCall: async (tool, params) => {
    print("Calling " + tool.name + " with", params)
    return true  // Allow execution
  },

  onAfterCall: async (tool, params, result) => {
    await logToolUsage(tool.name, params, result)
  },

  onError: async (tool, params, error) => {
    await alertOps("Tool " + tool.name + " failed: " + error.message)
  },

  onMaxIterations: async (iterations) => {
    print("Tool loop hit max iterations:", iterations)
  }
}

claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  tools: [getWeather, searchWeb],
  toolStrategy: strategy
})
```

### 10.7 Disabling Automatic Tool Execution

To handle tool calls manually:

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  tools: [getWeather],
  toolStrategy: { maxIterations: 0 }  // Disable auto-execution
})

turn = await claude.generate([], "What is the weather?")

if (turn.response.hasToolCalls) {
  // Handle manually
  for toolCall in turn.response.toolCalls {
    print("Model wants to call:", toolCall.toolName)
    // Execute yourself, then continue conversation
  }
}
```

### 10.8 Multiple Tool Calls

Models may request multiple tool calls in a single response. `llm()` executes them in parallel by default:

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  tools: [getWeather, getTime]
})

// Model might call both tools simultaneously
turn = await claude.generate(
  "What is the weather and time in Tokyo and Paris?"
)

// turn.toolExecutions might contain 4 executions
// (weather + time for each city)
```

### 10.9 Provider-Native Tools

Some providers offer **provider-native tools**—built-in capabilities that execute server-side rather than client-side. These differ fundamentally from UPP function tools:

| Aspect | UPP Function Tools | Provider-Native Tools |
|--------|-------------------|----------------------|
| Passed via | `tools` parameter in `llm()` | `params.tools` (pass-through) |
| Execution | Client-side via `run` function | Server-side by provider |
| Output | Returned by `run()`, sent back as `ToolResultMessage` | Incorporated into response content |
| Definition | Requires `name`, `description`, `parameters`, `run` | Provider-specific structure |

**Examples of provider-native tools:**

- **Web Search** - Search the web for current information
- **Code Interpreter** - Execute code in a sandboxed environment
- **Image Generation** - Generate images from text prompts
- **File Search** - Search through uploaded documents
- **Computer Use** - Interact with computer interfaces

#### 10.9.1 Usage Pattern

Provider-native tools are passed through the `params` object, not the `tools` array:

```pseudocode
import openai from "upp/openai"

// Provider-native tools go in params.tools
gpt = llm({
  model: openai("gpt-4o"),
  params: {
    tools: [
      { type: "web_search" },
      { type: "image_generation", quality: "high" }
    ]
  },
  // UPP function tools go here (can be used together)
  tools: [myCustomTool]
})
```

#### 10.9.2 Output Handling

Provider-native tool outputs SHOULD be transformed into standard UPP content blocks:

- Image generation results → `ImageBlock` in `AssistantMessage.content`
- Audio generation results → `AudioBlock` in `AssistantMessage.content`
- Text-based results (web search, code output) → Incorporated into text response

This ensures outputs are accessible via standard message accessors:

```pseudocode
turn = await gpt.generate("Generate an image of a sunset")

// Generated images are standard content blocks
images = turn.response.images  // List<ImageBlock>
firstImage = images[0]
```

#### 10.9.3 Provider Implementation

Providers offering native tools SHOULD:

1. **Document available tools** - List supported native tools and their configuration options
2. **Export helper constructors** - Provide ergonomic functions for creating tool configurations
3. **Transform outputs to content** - Convert tool outputs to standard `ContentBlock` types
4. **Preserve tool metadata** - Store provider-specific execution details in `metadata.{providerName}` if needed for multi-turn or debugging

```pseudocode
// Example: Provider exports tool helpers
import { tools } from "upp/openai"

gpt = llm({
  model: openai("gpt-4o"),
  params: {
    tools: [
      tools.webSearch({ search_context_size: "medium" }),
      tools.imageGeneration({ quality: "high", size: "1024x1024" })
    ]
  }
})
```

#### 10.9.4 Combining Tool Types

UPP function tools and provider-native tools can be used together. The provider is responsible for merging them correctly when sending requests:

```pseudocode
// Both tool types in one configuration
gpt = llm({
  model: openai("gpt-4o"),
  params: {
    tools: [tools.webSearch()]  // Provider-native
  },
  tools: [getWeather, saveNote]  // UPP function tools
})

// The model can use any available tool
turn = await gpt.generate("What's the weather in Paris and save it to my notes")
```

The `llm()` core handles UPP function tool execution automatically. Provider-native tools execute server-side and their results appear in the response.

---

## 11. Structured Outputs

### 11.1 Overview

Structured outputs allow you to constrain model responses to a specific JSON schema, ensuring valid, parseable data.

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "Extract structured data from text.",
  structure: {
    type: "object",
    properties: {
      name: { type: "string", description: "Person name" },
      age: { type: "integer", description: "Person age" },
      email: { type: "string", format: "email" }
    },
    required: ["name", "age"]
  }
})

turn = await claude.generate([], "John Doe is 30 years old, email: john@example.com")

// turn.data contains the structured response
print(turn.data)
// { name: "John Doe", age: 30, email: "john@example.com" }

// turn.response.text may contain raw JSON or be empty depending on provider
```

### 11.2 Schema Definition

Structured outputs use standard JSON Schema:

**JSONSchema Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | "object" | Must be "object" |
| `properties` | Map<String, JSONSchemaProperty> | Property definitions |
| `required` | List<String>? | Required property names |
| `additionalProperties` | Boolean? | Allow extra properties |
| `description` | String? | Schema description |

**JSONSchemaProperty Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | "string", "number", "integer", "boolean", "array", "object", "null" |
| `description` | String? | Property description |
| `enum` | List? | Allowed values |
| `const` | Any? | Constant value |
| `default` | Any? | Default value |

**String-specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| `minLength` | Integer? | Minimum length |
| `maxLength` | Integer? | Maximum length |
| `pattern` | String? | Regex pattern |
| `format` | String? | "email", "uri", "date", "date-time", "uuid" |

**Number-specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| `minimum` | Number? | Minimum value (inclusive) |
| `maximum` | Number? | Maximum value (inclusive) |
| `exclusiveMinimum` | Number? | Minimum value (exclusive) |
| `exclusiveMaximum` | Number? | Maximum value (exclusive) |
| `multipleOf` | Number? | Must be multiple of this value |

**Array-specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| `items` | JSONSchemaProperty? | Item schema |
| `minItems` | Integer? | Minimum items |
| `maxItems` | Integer? | Maximum items |
| `uniqueItems` | Boolean? | Items must be unique |

**Object-specific fields:**

| Field | Type | Description |
|-------|------|-------------|
| `properties` | Map? | Nested property definitions |
| `required` | List<String>? | Required properties |
| `additionalProperties` | Boolean? | Allow extra properties |

### 11.3 Provider Handling

Structured output is a capability declared via `LLMCapabilities.structuredOutput`. If a provider's API doesn't support native structured outputs, the provider MUST set this to `false` and `llm()` core MUST throw `INVALID_REQUEST` when `structure` is provided.

Providers with native support handle structured outputs according to vendor APIs:

| Provider | Implementation |
|----------|----------------|
| Anthropic | Uses tool_choice with schema |
| OpenAI | Uses response_format with json_schema |
| Google | Uses responseSchema |

Note: UPP does not validate responses against the schema—only that valid JSON was returned. Schema validation is the application's responsibility if needed.

### 11.4 Complex Schema Example

```pseudocode
weatherSchema = {
  type: "object",
  properties: {
    location: {
      type: "object",
      properties: {
        city: { type: "string" },
        country: { type: "string" },
        coordinates: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lon: { type: "number" }
          },
          required: ["lat", "lon"]
        }
      },
      required: ["city", "country"]
    },
    current: {
      type: "object",
      properties: {
        temperature: { type: "number" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
        conditions: { type: "string" },
        humidity: { type: "integer", minimum: 0, maximum: 100 }
      },
      required: ["temperature", "unit", "conditions"]
    },
    forecast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          high: { type: "number" },
          low: { type: "number" },
          conditions: { type: "string" }
        },
        required: ["date", "high", "low"]
      },
      maxItems: 7
    }
  },
  required: ["location", "current"]
}

weatherAI = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  system: "Provide weather information in the requested format.",
  structure: weatherSchema
})

turn = await weatherAI.generate([], "Weather in Tokyo for the next 3 days")
weather = turn.data
print(weather.location.city)   // "Tokyo"
print(weather.forecast.length) // 3
```

### 11.5 Structured Output with Tools

Structured outputs can be combined with tools. The final response will be structured:

```pseudocode
claude = llm({
  model: anthropic("claude-haiku-4-20250514"),
  config: { apiKey: env.ANTHROPIC_API_KEY },
  tools: [getWeatherTool],
  structure: {
    type: "object",
    properties: {
      summary: { type: "string" },
      temperature: { type: "number" },
      recommendation: { type: "string" }
    },
    required: ["summary", "temperature", "recommendation"]
  }
})

// Model may call tools, but final response will be structured
turn = await claude.generate([], "Should I bring an umbrella in Tokyo today?")
print(turn.data)
// { summary: "Sunny and warm", temperature: 72, recommendation: "No umbrella needed" }
```

---

## 12. Embedding Interface

### 12.1 Function Signature

```pseudocode
embedding(options: EmbeddingOptions) -> EmbeddingInstance
```

### 12.2 Options

**EmbeddingOptions Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelReference | Yes | A model reference from a provider factory |
| `config` | ProviderConfig | No | Provider infrastructure configuration |
| `params` | Map | No | Model-specific parameters (dimensions, encoding format, etc.) |

### 12.3 EmbeddingInstance

**EmbeddingInstance Interface:**

| Method/Property | Type | Description |
|-----------------|------|-------------|
| `embed(input)` | Function | Embed a single input |
| `embedBatch(inputs)` | Function | Embed multiple inputs in a single request |
| `embedMany(inputs, options)` | Function | Embed with automatic batching for large sets |
| `model` | BoundEmbeddingModel | The bound model |
| `params` | Map? | Current parameters |

**EmbeddingInput Type:**

```pseudocode
EmbeddingInput = String | TextBlock | ImageBlock
```

**EmbedManyOptions Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `batchSize` | Integer? | Maximum inputs per batch (default: provider limit) |
| `concurrency` | Integer? | Concurrency limit (default: 1) |
| `signal` | AbortSignal? | Abort signal |

### 12.4 Embedding Results

**Embedding Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `vector` | List<Float> | The embedding vector |
| `dimensions` | Integer | Vector dimensionality |
| `input` | EmbeddingInput | The input that was embedded |
| `tokens` | Integer? | Token count (if available) |

**EmbeddingBatch Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `embeddings` | List<Embedding> | Embeddings in same order as inputs |
| `usage` | EmbeddingUsage | Aggregate usage |

**EmbeddingUsage Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `totalTokens` | Integer | Total tokens processed |

**EmbeddingProgress Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `embeddings` | List<Embedding> | Completed embeddings so far |
| `progress` | ProgressInfo | Progress information |
| `done` | Boolean | True when all complete |

**ProgressInfo Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `completed` | Integer | Number completed |
| `total` | Integer | Total count |
| `percent` | Float | Percentage complete |

### 12.5 BoundEmbeddingModel

**BoundEmbeddingModel Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `modelId` | String | The model identifier |
| `maxBatchSize` | Integer | Maximum inputs per batch |
| `maxInputLength` | Integer | Maximum input length (tokens or characters) |
| `dimensions` | Integer | Output dimensions (may be configurable) |
| `embed(request)` | Function | Execute embedding request |

**EmbeddingRequest Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `inputs` | List<EmbeddingInput> | Inputs to embed |
| `params` | Map? | Model-specific parameters |
| `config` | ProviderConfig | Provider infrastructure config |
| `signal` | AbortSignal? | Abort signal |

**EmbeddingResponse Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `embeddings` | List<EmbeddingVector> | Embedding vectors with optional token counts |
| `usage` | EmbeddingUsage | Aggregate usage |

**EmbeddingVector Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `vector` | List<Float> | The embedding vector |
| `tokens` | Integer? | Token count |

### 12.6 Basic Usage

```pseudocode
import { embedding } from "upp"
import openai from "upp/openai"

embedder = embedding({
  model: openai("text-embedding-3-large"),
  config: {
    apiKey: env.OPENAI_API_KEY
  },
  params: {
    dimensions: 1536
  }
})

// Single embedding
result = await embedder.embed("What is the capital of France?")
print(result.vector.length)  // 1536
print(result.dimensions)     // 1536

// Batch embedding
batch = await embedder.embedBatch([
  "First document to embed",
  "Second document to embed",
  "Third document to embed"
])

print(batch.embeddings.length)  // 3
print(batch.usage.totalTokens)  // Total tokens used
```

### 12.7 Large-Scale Embedding

For embedding large document sets:

```pseudocode
documents = await loadDocuments()  // 10,000 documents

for await (progress in embedder.embedMany(documents, {
  batchSize: 100,
  concurrency: 2
})) {
  print("Progress:", progress.progress.percent + "%")

  // Process embeddings as they complete
  await storeInVectorDB(progress.embeddings)

  if (progress.done) {
    print("All embeddings complete")
  }
}
```

### 12.8 Provider-Specific Parameters

Each provider exports its own parameter types (e.g., `OpenAIEmbedParams`, `VoyageEmbedParams`). Consult provider documentation for available options such as output dimensions, encoding formats, and task type hints.

**EmbeddingInputType:**

Some providers distinguish between embeddings optimized for different use cases:

| Value | Description |
|-------|-------------|
| `document` | Optimize embedding for storage/indexing (longer text, corpus documents) |
| `query` | Optimize embedding for search queries (shorter text, retrieval queries) |

Providers that support input type hints (e.g., Voyage, Cohere) MAY produce different embeddings for the same text depending on this value. Providers that do not support this feature MUST ignore the parameter.

```pseudocode
// OpenAI embedding params (OpenAIEmbedParams)
{
  dimensions: 1536,
  encoding_format: "float"
}

// Voyage embedding params (VoyageEmbedParams)
{
  input_type: EmbeddingInputType  // "document" or "query"
}
```

### 12.9 Similarity Utilities

UPP implementations SHOULD provide optional utilities for working with embeddings:

**Cosine Similarity:**

```pseudocode
cosineSimilarity(a: List<Float>, b: List<Float>) -> Float
// Returns value between -1 and 1
```

**Euclidean Distance:**

```pseudocode
euclideanDistance(a: List<Float>, b: List<Float>) -> Float
// Returns non-negative value
```

**Dot Product:**

```pseudocode
dotProduct(a: List<Float>, b: List<Float>) -> Float
```

Usage:

```pseudocode
import { cosineSimilarity } from "upp/similarity"

similarity = cosineSimilarity(embedding1.vector, embedding2.vector)
```

---

## 13. Image Interface

### 13.1 Function Signature

```pseudocode
image(options: ImageOptions) -> ImageInstance
```

### 13.2 Options

**ImageOptions Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelReference | Yes | A model reference from a provider factory |
| `config` | ProviderConfig | No | Provider infrastructure configuration |
| `params` | Map | No | Model-specific parameters (size, quality, style, etc.) |

### 13.3 ImageInstance

**ImageInstance Interface:**

| Method/Property | Type | Description |
|-----------------|------|-------------|
| `generate(input)` | Function | Generate images from a text prompt |
| `stream(input)` | Function? | Generate with streaming progress (if supported) |
| `edit(input)` | Function? | Edit an existing image (inpainting) |
| `vary(input)` | Function? | Create variations of an existing image |
| `upscale(input)` | Function? | Upscale an image to higher resolution |
| `model` | BoundImageModel | The bound model |
| `params` | Map? | Current parameters |
| `capabilities` | ImageCapabilities | Model capabilities |

**ImagePrompt Type:**

```pseudocode
ImagePrompt = String | {
  prompt: String,
  negativePrompt: String?,
  referenceImages: List<Image>?,
  seed: Integer?
}
```

### 13.4 Image Results

**ImageResult Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `images` | List<GeneratedImage> | Generated images |
| `metadata` | ImageMetadata? | Generation metadata |
| `usage` | ImageUsage | Usage/billing information |

**GeneratedImage Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `image` | Image | The generated image |
| `metadata` | ImageItemMetadata? | Per-image metadata |

**ImageItemMetadata Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `seed` | Integer? | Seed used for this image |
| `index` | Integer? | Image index in batch |
| `finishReason` | String? | "success" or "content_filtered" |

**ImageMetadata Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `seed` | Integer? | Seed used (for reproducibility) |
| `revisedPrompt` | String? | Model's revised prompt (if applicable) |

**ImageUsage Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `imagesGenerated` | Integer | Number of images generated |
| `cost` | Float? | Provider-specific cost units |

### 13.5 Streaming Generation

**ImageStreamResult Interface:**

| Property/Method | Type | Description |
|-----------------|------|-------------|
| (async iterable) | AsyncIterator<ImageStreamEvent> | ImageStreamResult is async iterable over events |
| `result` | Promise<ImageResult> | Final result after streaming |
| `abort()` | Function | Abort the generation |

**ImageStreamEvent Types:**

```pseudocode
// Progress event
{ type: "progress", percent: Integer, stage: String? }

// Preview event
{ type: "preview", image: Image, index: Integer }

// Complete event
{ type: "complete", image: GeneratedImage, index: Integer }
```

### 13.6 Image Editing

**ImageEditInput Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | Image | Yes | Base image to edit |
| `mask` | Image | No | Mask indicating edit region (white = edit area) |
| `prompt` | String | Yes | Edit instruction |
| `negativePrompt` | String | No | What to avoid |

**ImageVaryInput Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | Image | Yes | Source image for variations |
| `count` | Integer | No | Number of variations to generate |
| `strength` | Float | No | Variation strength (0-1, higher = more different) |

**ImageUpscaleInput Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | Image | Yes | Image to upscale |
| `scale` | Integer | No | Target scale factor (2 or 4) |

### 13.7 Capabilities

**ImageCapabilities Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `generate` | Boolean | Supports text-to-image generation |
| `streaming` | Boolean | Supports streaming progress |
| `edit` | Boolean | Supports image editing/inpainting |
| `vary` | Boolean | Supports variations |
| `upscale` | Boolean | Supports upscaling |
| `outpaint` | Boolean | Supports outpainting |
| `imageToImage` | Boolean | Supports image-to-image |
| `maxImages` | Integer | Maximum images per request |
| `supportedSizes` | List<String> | Supported output sizes |
| `supportedAspectRatios` | List<String>? | Supported aspect ratios |
| `supportedFormats` | List<String> | Supported formats: "png", "jpeg", "webp" |

### 13.8 BoundImageModel

**BoundImageModel Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `modelId` | String | The model identifier |
| `capabilities` | ImageCapabilities | Model capabilities |
| `generate(request)` | Function | Generate images |
| `stream(request)` | Function? | Stream generation progress (optional), returns ImageProviderStreamResult |
| `edit(request)` | Function? | Edit an image (optional) |
| `vary(request)` | Function? | Create variations (optional) |
| `upscale(request)` | Function? | Upscale an image (optional) |

**ImageRequest Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | String | Generation prompt |
| `negativePrompt` | String? | What to avoid |
| `referenceImages` | List<Image>? | Reference images |
| `seed` | Integer? | Seed for reproducibility |
| `params` | Map? | Model-specific parameters |
| `config` | ProviderConfig | Provider infrastructure config |
| `signal` | AbortSignal? | Abort signal |

**ImageResponse Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `images` | List<GeneratedImage> | Generated images |
| `metadata` | ImageMetadata? | Generation metadata |
| `usage` | ImageUsage | Usage information |

**ImageEditRequest Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | Image | Yes | Base image to edit |
| `mask` | Image | No | Edit mask (white = edit area) |
| `prompt` | String | Yes | Edit instruction |
| `negativePrompt` | String | No | What to avoid |
| `params` | Map | No | Model-specific parameters |
| `config` | ProviderConfig | Yes | Provider infrastructure config |
| `signal` | AbortSignal | No | Abort signal |

**ImageVaryRequest Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | Image | Yes | Source image for variations |
| `count` | Integer | No | Number of variations to generate |
| `strength` | Float | No | Variation strength (0-1) |
| `params` | Map | No | Model-specific parameters |
| `config` | ProviderConfig | Yes | Provider infrastructure config |
| `signal` | AbortSignal | No | Abort signal |

**ImageUpscaleRequest Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | Image | Yes | Image to upscale |
| `scale` | Integer | No | Scale factor (2 or 4) |
| `params` | Map | No | Model-specific parameters |
| `config` | ProviderConfig | Yes | Provider infrastructure config |
| `signal` | AbortSignal | No | Abort signal |

**ImageProviderStreamResult:**

An async iterable of `ImageStreamEvent` objects with a `response` property that resolves to `ImageResponse`.

### 13.9 Basic Usage

```pseudocode
import { image } from "upp"
import openai from "upp/openai"

dalle = image({
  model: openai("dall-e-3"),
  config: {
    apiKey: env.OPENAI_API_KEY
  },
  params: {
    size: "1024x1024",
    quality: "hd"
  }
})

// Simple generation
result = await dalle.generate("A sunset over mountains, oil painting style")

print(result.images.length)            // 1
print(result.metadata?.revisedPrompt)  // DALL-E's enhanced prompt

// Save the image
imageData = result.images[0].image.toBytes()
await writeFile("sunset.png", imageData)
```

### 13.10 Advanced Generation

```pseudocode
import { image } from "upp"
import stability from "upp/stability"

sd = image({
  model: stability("stable-diffusion-xl-1024-v1-0"),
  config: {
    apiKey: env.STABILITY_API_KEY
  },
  params: {
    steps: 30,
    cfg_scale: 7,
    samples: 4
  }
})

// Generation with negative prompt
result = await sd.generate({
  prompt: "A photorealistic cat sitting on a windowsill, golden hour lighting",
  negativePrompt: "cartoon, drawing, illustration, low quality, blurry",
  seed: 12345
})

print(result.images.length)   // 4
print(result.metadata?.seed)  // 12345

// Save all images
for (i, img) in enumerate(result.images) {
  await writeFile("cat-" + i + ".png", img.image.toBytes())
}
```

### 13.11 Image Editing

```pseudocode
// Check if editing is supported
if (dalle.capabilities.edit && dalle.edit) {
  edited = await dalle.edit({
    image: await Image.fromPath("./photo.png"),
    mask: await Image.fromPath("./mask.png"),  // White = edit area
    prompt: "Replace the sky with a starry night"
  })

  await writeFile("edited.png", edited.images[0].image.toBytes())
}
```

### 13.12 Image Variations

```pseudocode
// Check if variations are supported
if (dalle.capabilities.vary && dalle.vary) {
  variations = await dalle.vary({
    image: await Image.fromPath("./original.png"),
    count: 3,
    strength: 0.7  // 0 = identical, 1 = completely different
  })

  for (i, img) in enumerate(variations.images) {
    await writeFile("variation-" + i + ".png", img.image.toBytes())
  }
}
```

### 13.13 Streaming Progress

```pseudocode
// Check if streaming is supported
if (sd.stream) {
  stream = sd.stream({
    prompt: "A cyberpunk cityscape at night, neon lights, rain"
  })

  for await (event in stream) {
    switch (event.type) {
      case "progress":
        print(event.percent + "% - " + event.stage)
        break
      case "preview":
        // Display low-res preview
        displayPreview(event.image, event.index)
        break
      case "complete":
        print("Image " + event.index + " complete")
        break
    }
  }

  finalResult = await stream.result
  print("Generated " + finalResult.images.length + " images")
}
```

### 13.14 Provider-Specific Parameters

Each provider exports its own parameter types (e.g., `OpenAIImageParams`, `StabilityImageParams`). Consult provider documentation for available options.

```pseudocode
// OpenAI DALL-E params (OpenAIImageParams)
{
  size: "1024x1024" | "1792x1024" | "1024x1792",
  quality: "standard" | "hd",
  style: "vivid" | "natural"
}

// Stability params (StabilityImageParams)
{
  steps: 10-50,
  cfg_scale: 1-35,
  samples: 1-10,
  style_preset: "anime" | "photographic" | "digital-art" | ...
}
```

### 13.15 Capability Detection

```pseudocode
// Check capabilities before using optional features
if (imageGen.capabilities.edit && imageGen.edit) {
  // Safe to use edit
}

if (imageGen.capabilities.streaming && imageGen.stream) {
  // Safe to use streaming
}
```

---

## 14. Data Type Definitions

### 14.1 Primitive Types

| Type | Description | JSON Representation |
|------|-------------|---------------------|
| `String` | UTF-8 text | JSON string |
| `Integer` | Signed integer (at least 64-bit) | JSON number |
| `Float` | IEEE 754 double precision | JSON number |
| `Boolean` | True or false | JSON boolean |
| `Bytes` | Raw binary data | Base64-encoded JSON string |
| `Timestamp` | Point in time | ISO 8601 string |
| `Map<K,V>` | Key-value mapping | JSON object |
| `List<T>` | Ordered collection | JSON array |
| `Optional<T>` or `T?` | Value or null | JSON value or `null` |
| `Union<A,B,...>` | One of multiple types | Discriminated by `type` field |
| `Any` | Any JSON value | Any JSON value |

### 14.2 Platform Types

The following types are assumed to be provided by the host language or runtime environment:

| Type | Description |
|------|-------------|
| `AbortSignal` | A signal object that allows aborting asynchronous operations. Implementations SHOULD use the platform's standard abort mechanism (e.g., `AbortSignal` in JavaScript, `CancellationToken` in C#, `Context` in Go). |
| `AsyncIterable<T>` | An object that can be asynchronously iterated, yielding values of type `T`. Used for streaming responses. |
| `AsyncIterator<T>` | The iterator protocol for async iteration. |
| `Promise<T>` | A promise/future that resolves to a value of type `T`. |
| `Function` | A callable function. Specific signatures are defined where used. |

### 14.3 Modality Types

```pseudocode
Modality = "llm" | "embedding" | "image" | "audio" | "video"
```

### 14.4 Schema Types

JSON Schema types used for tool parameters and structured outputs are defined in [Section 11.2](#112-schema-definition). The core types are:

- `JSONSchema` - Root schema for structured outputs (must have `type: "object"`)
- `JSONSchemaProperty` - Individual property definitions within a schema

### 14.5 Complete Export List

UPP implementations SHOULD export the following types through their language's standard public API mechanism. All types listed below are considered part of the public API surface and MUST be accessible to users of the implementation:

**Entry Points:**
- `llm`
- `embedding`
- `image`
- `ai` (namespace containing all entry points)

**LLM Types:**
- `LLMOptions`
- `LLMInstance`
- `LLMCapabilities`
- `LLMProvider`
- `BoundLLMModel`
- `LLMRequest`
- `LLMResponse`
- `LLMStreamResult`
- `InferenceInput`

**Message Types:**
- `Message`
- `UserMessage`
- `AssistantMessage`
- `ToolResultMessage`
- `MessageOptions`
- `MessageMetadata`
- `MessageType`

**Content Block Types:**
- `ContentBlock`
- `TextBlock`
- `ImageBlock`
- `AudioBlock`
- `VideoBlock`
- `BinaryBlock`
- `ImageSource`

**Tool Types:**
- `ToolCall`
- `ToolResult`
- `Tool`
- `ToolUseStrategy`
- `ToolExecution`

**Turn & Thread Types:**
- `Turn`
- `TokenUsage`
- `Thread`
- `ThreadJSON`

**Streaming Types:**
- `StreamResult`
- `StreamEvent`
- `StreamEventType`
- `EventDelta`

**Schema Types:**
- `JSONSchema`
- `JSONSchemaProperty`

**Embedding Types:**
- `EmbeddingOptions`
- `EmbeddingInstance`
- `EmbeddingProvider`
- `BoundEmbeddingModel`
- `EmbeddingRequest`
- `EmbeddingResponse`
- `EmbeddingInput`
- `EmbeddingInputType`
- `Embedding`
- `EmbeddingBatch`
- `EmbeddingUsage`
- `EmbeddingProgress`
- `EmbedManyOptions`

**Image Types:**
- `ImageOptions`
- `ImageInstance`
- `ImageProvider`
- `BoundImageModel`
- `ImageRequest`
- `ImageResponse`
- `ImagePrompt`
- `ImageResult`
- `GeneratedImage`
- `ImageUsage`
- `ImageMetadata`
- `ImageItemMetadata`
- `ImageStreamResult`
- `ImageStreamEvent`
- `ImageProviderStreamResult`
- `ImageEditInput`
- `ImageEditRequest`
- `ImageVaryInput`
- `ImageVaryRequest`
- `ImageUpscaleInput`
- `ImageUpscaleRequest`
- `ImageCapabilities`

**Shared Infrastructure:**
- `ProviderConfig`
- `KeyStrategy`
- `RoundRobinKeys`
- `WeightedKeys`
- `DynamicKey`
- `RetryStrategy`
- `ExponentialBackoff`
- `LinearBackoff`
- `NoRetry`
- `TokenBucket`
- `RetryAfterStrategy`
- `UPPError`
- `ErrorCode`
- `Modality`

**Utilities:**
- `Image`
- `isUserMessage`
- `isAssistantMessage`
- `isToolResultMessage`

**Similarity Utilities (optional):**
- `cosineSimilarity`
- `euclideanDistance`
- `dotProduct`

### 14.6 Provider Exports

Each provider module exports a single factory function and its own parameter types. The model ID passed to the factory determines which modality handler is used.

```pseudocode
// Pattern: "upp/{provider}"
import openai from "upp/openai"
import anthropic from "upp/anthropic"
import google from "upp/google"

// Each provider also exports its parameter types
// e.g., OpenAILLMParams, AnthropicLLMParams, etc.
```

---

## 15. Provider Implementation Guide

### 15.1 Provider Module Structure

Each provider module exports a single factory that combines all modality handlers:

```pseudocode
// Provider implementation structure

import { createProvider } from "upp"
import { createLLMHandler } from "./llm"
import { createEmbeddingHandler } from "./embed"
import { createImageHandler } from "./image"

openai = createProvider({
  name: "openai",
  version: "1.0.0",
  modalities: {
    llm: createLLMHandler(),
    embedding: createEmbeddingHandler(),
    image: createImageHandler()
  }
})

// Export provider and param types
export { openai }
export type { OpenAILLMParams, OpenAIEmbedParams, OpenAIImageParams }
```

### 15.2 createProvider Helper

UPP implementations SHOULD provide a helper to create providers:

```pseudocode
function createProvider(options: CreateProviderOptions) -> Provider {
  provider = function(modelId: String) -> ModelReference {
    return { modelId: modelId, provider: provider }
  }

  provider.name = options.name
  provider.version = options.version
  provider.modalities = options.modalities

  return provider
}

CreateProviderOptions = {
  name: String,
  version: String,
  modalities: {
    llm: LLMHandler?,
    embedding: EmbeddingHandler?,
    image: ImageHandler?
  }
}
```

### 15.3 HTTP-First Approach

Per Section 2.7 (HTTP-First Provider Implementation), providers SHOULD use direct HTTP calls rather than vendor SDKs.

### 15.4 Shared Utilities

UPP implementations SHOULD provide utilities for provider implementations:

**resolveApiKey(config, envVar?) -> Promise<String>**

Resolve API key from ProviderConfig, supporting string, function, or KeyStrategy. If `config.apiKey` is not set, automatically falls back to standard environment variables. MUST throw `UPPError` with `AUTHENTICATION_FAILED` if no key is available.

**doFetch(url, init, config) -> Promise<Response>**

Execute fetch with retry, timeout, and error normalization. Uses `config.retryStrategy` for retry logic, `config.timeout` for request timeout, and `config.fetch` for custom fetch implementation. Automatically normalizes HTTP errors to `UPPError`.

**parseSSEStream(body) -> AsyncGenerator<Any>**

Parse Server-Sent Events stream into JSON objects. Handles standard SSE format with "data:" prefix. Yields parsed JSON for each event, terminates on "[DONE]" message.

**normalizeHttpError(response, provider, modality) -> Promise<UPPError>**

Normalize HTTP error responses to `UPPError`. Maps HTTP status codes to appropriate `ErrorCode` values. Extracts error message from response body when available.

### 15.5 LLM Handler Pattern

```pseudocode
function createLLMHandler() -> LLMHandler {
  return {
    bind(modelId: String) -> BoundLLMModel {
      return {
        modelId: modelId,
        capabilities: {
          streaming: true,
          tools: true,
          structuredOutput: true,
          imageInput: true,
          videoInput: false,
          audioInput: false
        },

        complete: async (request) => {
          apiKey = await resolveApiKey(request.config, "VENDOR_API_KEY")

          // Transform UPP request to vendor format
          body = transformRequest(request, modelId)

          response = await doFetch(VENDOR_URL, {
            method: "POST",
            headers: { Authorization: "Bearer " + apiKey, ... },
            body: JSON.stringify(body)
          }, request.config)

          data = await response.json()

          // Transform vendor response to UPP format
          return transformResponse(data)
        },

        stream: (request) => {
          // Similar pattern with SSE parsing
          // Return LLMStreamResult (async iterator with response promise)
        }
      }
    }
  }
}
```

### 15.6 Embedding Handler Pattern

```pseudocode
function createEmbeddingHandler() -> EmbeddingHandler {
  return {
    supportedInputs: ["text"],

    bind(modelId: String) -> BoundEmbeddingModel {
      return {
        modelId: modelId,
        maxBatchSize: 2048,
        maxInputLength: 8191,
        dimensions: 1536,

        embed: async (request) => {
          apiKey = await resolveApiKey(request.config, "VENDOR_API_KEY")

          // Transform inputs to vendor format
          body = {
            model: modelId,
            input: request.inputs.map(transformInput),
            ...request.params
          }

          response = await doFetch(VENDOR_URL, {
            method: "POST",
            headers: { Authorization: "Bearer " + apiKey },
            body: JSON.stringify(body)
          }, request.config)

          data = await response.json()

          // Return EmbeddingResponse
          return {
            embeddings: data.data.map(d => ({
              vector: d.embedding,
              tokens: d.usage?.tokens
            })),
            usage: { totalTokens: data.usage.total_tokens }
          }
        }
      }
    }
  }
}
```

### 15.7 Image Handler Pattern

```pseudocode
function createImageHandler() -> ImageHandler {
  return {
    bind(modelId: String) -> BoundImageModel {
      return {
        modelId: modelId,
        capabilities: {
          generate: true,
          streaming: false,
          edit: false,
          vary: false,
          upscale: false,
          outpaint: false,
          imageToImage: false,
          maxImages: 1,
          supportedSizes: ["1024x1024"],
          supportedFormats: ["png"]
        },

        generate: async (request) => {
          apiKey = await resolveApiKey(request.config, "VENDOR_API_KEY")

          body = {
            model: modelId,
            prompt: request.prompt,
            ...request.params
          }

          response = await doFetch(VENDOR_URL, {
            method: "POST",
            headers: { Authorization: "Bearer " + apiKey },
            body: JSON.stringify(body)
          }, request.config)

          data = await response.json()

          // Return ImageResponse
          return transformImageResponse(data)
        }

        // Implement edit, vary, upscale if capabilities indicate support
      }
    }
  }
}
```

### 15.8 Key Implementation Requirements

1. **Request transformation:** Convert UPP `Message[]` to vendor message format
2. **Response transformation:** Convert vendor response to `LLMResponse`, `EmbeddingResponse`, or `ImageResponse`
3. **Error normalization:** Wrap vendor errors in `UPPError` with appropriate `ErrorCode` and `modality`
4. **Streaming:** Parse SSE streams and emit `StreamEvent` objects
5. **Metadata namespacing:** Store vendor-specific data under `metadata.{providerName}`

### 15.9 Language-Specific Implementation Notes

#### Object-Oriented Languages (Java, C#, PHP)

```pseudocode
// Use interfaces/abstract classes for handlers
interface LLMHandler {
  BoundLLMModel bind(String modelId)
}

// Use classes for bound models
class OpenAIBoundLLMModel implements BoundLLMModel {
  String modelId
  LLMCapabilities capabilities

  LLMResponse complete(LLMRequest request)
  LLMStreamResult stream(LLMRequest request)
}
```

#### Systems Languages (Rust, Go)

```pseudocode
// Rust: Use traits
trait LLMHandler {
  fn bind(&self, model_id: &str) -> Box<dyn BoundLLMModel>;
}

// Go: Use interfaces
type LLMHandler interface {
  Bind(modelID string) BoundLLMModel
}
```

#### Dynamic Languages (Python, Ruby, JavaScript)

```pseudocode
// Use duck typing and factory functions
def create_llm_handler():
  def bind(model_id):
    return BoundLLMModel(model_id, ...)
  return {"bind": bind}
```

---

## 16. Conformance

### 16.1 Provider Conformance Levels

Providers may implement one or more modalities. For each modality, conformance is defined at multiple levels.

#### 16.1.1 LLM Conformance

**Level 1: Core (Required)**
- Declare `LLMCapabilities` accurately for the provider's API
- Text input/output via `complete()` method
- Return `LLMResponse` with `AssistantMessage` and `TokenUsage`
- Basic configuration pass-through (`params`)
- Error normalization to `UPPError` with correct `modality: "llm"`
- System prompt handling per vendor requirements

**Level 2: Streaming** (`capabilities.streaming: true`)
- `stream()` method implementation
- Proper `StreamEvent` emission with correct `StreamEventType`
- `LLMStreamResult` with `response` promise
- Support for `message_start`, `text_delta`, `message_stop` at minimum

**Level 3: Tools** (`capabilities.tools: true`)
- Tool definition transformation (JSON Schema to vendor format)
- Tool call detection in responses (`AssistantMessage.toolCalls`)
- Tool result handling (`ToolResultMessage` transformation)
- Note: Tool execution loop is handled by `llm()` core, not providers

**Level 4: Structured Output** (`capabilities.structuredOutput: true`)
- Transform `structure` schema to vendor format
- Enable vendor's structured output mode
- Parse and return structured data as JSON

**Level 5: Multimodal Input** (`capabilities.imageInput`, `videoInput`, `audioInput`)
- Image input handling (base64, URL conversion) if `imageInput: true`
- Video input handling if `videoInput: true`
- Audio input handling if `audioInput: true`

#### 16.1.2 Embedding Conformance

**Level 1: Core (Required)**
- `embed()` method for single inputs
- Return `EmbeddingResponse` with vectors and usage
- Text input support
- Error normalization with `modality: "embedding"`

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
- Error normalization with `modality: "image"`

**Level 2: Editing**
- `edit()` method for inpainting (if `capabilities.edit`)
- Mask handling

**Level 3: Variations**
- `vary()` method (if `capabilities.vary`)
- Strength/count parameters

**Level 4: Streaming**
- `stream()` method (if `capabilities.streaming`)
- Progress and preview events

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

**HTTP Status Code Mapping:**

| HTTP Status | UPP Error Code |
|-------------|----------------|
| 400 | `INVALID_REQUEST` (or `CONTEXT_LENGTH_EXCEEDED` if indicated) |
| 401 | `AUTHENTICATION_FAILED` |
| 403 | `AUTHENTICATION_FAILED` or `QUOTA_EXCEEDED` |
| 404 | `MODEL_NOT_FOUND` |
| 429 | `RATE_LIMITED` |
| 500, 502, 503 | `PROVIDER_ERROR` |

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

Providers MUST accurately declare their capabilities:

- **LLMHandler**: Via `LLMCapabilities` on `BoundLLMModel`
- **EmbeddingHandler**: Declare `supportedInputs` array
- **ImageHandler**: Declare full `ImageCapabilities` object

Applications SHOULD check capabilities before using optional features to ensure graceful degradation.

---

## 17. Security Considerations

### 17.1 API Key Handling

- API keys MUST NOT be logged
- API keys SHOULD NOT be included in error messages
- Implementations SHOULD support secure key storage integration
- Environment variable fallback SHOULD be clearly documented

### 17.2 Tool Execution

Tools execute arbitrary code based on LLM-provided arguments:

- Tool arguments MUST be treated as untrusted input
- Implementations MUST NOT automatically validate arguments against schema
- Tool implementations SHOULD validate and sanitize inputs
- Sensitive operations SHOULD use approval handlers
- File system and network operations SHOULD be sandboxed where possible

### 17.3 Content Handling

- Binary data (images, audio) may come from untrusted sources
- Implementations SHOULD validate MIME types
- Large content SHOULD be size-limited
- Content filtering errors SHOULD be handled gracefully

### 17.4 Network Security

- Implementations SHOULD default to TLS/SSL
- Custom base URLs allow man-in-the-middle if misconfigured
- Proxy configurations SHOULD be carefully validated
- Timeout settings prevent resource exhaustion

### 17.5 Structured Output Security

- Structured output data comes from the model and should be validated
- Applications SHOULD NOT trust structured output for security decisions without validation
- Schema validation is the application's responsibility

---

## Appendix A: JSON Schema for UPP Structures

### A.1 Message Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "TextBlock": {
      "type": "object",
      "required": ["type", "text"],
      "properties": {
        "type": { "const": "text" },
        "text": { "type": "string" }
      }
    },
    "ImageSource": {
      "oneOf": [
        {
          "type": "object",
          "required": ["type", "data"],
          "properties": {
            "type": { "const": "base64" },
            "data": { "type": "string" }
          }
        },
        {
          "type": "object",
          "required": ["type", "url"],
          "properties": {
            "type": { "const": "url" },
            "url": { "type": "string", "format": "uri" }
          }
        },
        {
          "type": "object",
          "required": ["type", "data"],
          "properties": {
            "type": { "const": "bytes" },
            "data": { "type": "string", "contentEncoding": "base64" }
          }
        }
      ]
    },
    "ImageBlock": {
      "type": "object",
      "required": ["type", "source", "mimeType"],
      "properties": {
        "type": { "const": "image" },
        "source": { "$ref": "#/definitions/ImageSource" },
        "mimeType": { "type": "string" },
        "width": { "type": "integer" },
        "height": { "type": "integer" }
      }
    },
    "AudioBlock": {
      "type": "object",
      "required": ["type", "data", "mimeType"],
      "properties": {
        "type": { "const": "audio" },
        "data": { "type": "string", "contentEncoding": "base64" },
        "mimeType": { "type": "string" },
        "duration": { "type": "number" }
      }
    },
    "VideoBlock": {
      "type": "object",
      "required": ["type", "data", "mimeType"],
      "properties": {
        "type": { "const": "video" },
        "data": { "type": "string", "contentEncoding": "base64" },
        "mimeType": { "type": "string" },
        "duration": { "type": "number" },
        "width": { "type": "integer" },
        "height": { "type": "integer" }
      }
    },
    "BinaryBlock": {
      "type": "object",
      "required": ["type", "data", "mimeType"],
      "properties": {
        "type": { "const": "binary" },
        "data": { "type": "string", "contentEncoding": "base64" },
        "mimeType": { "type": "string" },
        "metadata": { "type": "object" }
      }
    },
    "ContentBlock": {
      "oneOf": [
        { "$ref": "#/definitions/TextBlock" },
        { "$ref": "#/definitions/ImageBlock" },
        { "$ref": "#/definitions/AudioBlock" },
        { "$ref": "#/definitions/VideoBlock" },
        { "$ref": "#/definitions/BinaryBlock" }
      ]
    },
    "ToolCall": {
      "type": "object",
      "required": ["toolCallId", "toolName", "arguments"],
      "properties": {
        "toolCallId": { "type": "string" },
        "toolName": { "type": "string" },
        "arguments": { "type": "object" }
      }
    },
    "ToolResult": {
      "type": "object",
      "required": ["toolCallId", "result"],
      "properties": {
        "toolCallId": { "type": "string" },
        "result": {},
        "isError": { "type": "boolean", "default": false }
      }
    },
    "UserMessage": {
      "type": "object",
      "required": ["id", "type", "content", "timestamp"],
      "properties": {
        "id": { "type": "string" },
        "type": { "const": "user" },
        "content": {
          "type": "array",
          "items": { "$ref": "#/definitions/ContentBlock" }
        },
        "timestamp": { "type": "string", "format": "date-time" },
        "metadata": { "type": "object" }
      }
    },
    "AssistantMessage": {
      "type": "object",
      "required": ["id", "type", "content", "timestamp"],
      "properties": {
        "id": { "type": "string" },
        "type": { "const": "assistant" },
        "content": {
          "type": "array",
          "items": { "$ref": "#/definitions/ContentBlock" }
        },
        "toolCalls": {
          "type": "array",
          "items": { "$ref": "#/definitions/ToolCall" }
        },
        "timestamp": { "type": "string", "format": "date-time" },
        "metadata": { "type": "object" }
      }
    },
    "ToolResultMessage": {
      "type": "object",
      "required": ["id", "type", "results", "timestamp"],
      "properties": {
        "id": { "type": "string" },
        "type": { "const": "tool_result" },
        "results": {
          "type": "array",
          "items": { "$ref": "#/definitions/ToolResult" }
        },
        "timestamp": { "type": "string", "format": "date-time" },
        "metadata": { "type": "object" }
      }
    },
    "Message": {
      "oneOf": [
        { "$ref": "#/definitions/UserMessage" },
        { "$ref": "#/definitions/AssistantMessage" },
        { "$ref": "#/definitions/ToolResultMessage" }
      ]
    }
  }
}
```

### A.2 Error Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["message", "code", "provider", "modality"],
  "properties": {
    "message": { "type": "string" },
    "code": {
      "type": "string",
      "enum": [
        "AUTHENTICATION_FAILED",
        "RATE_LIMITED",
        "CONTEXT_LENGTH_EXCEEDED",
        "MODEL_NOT_FOUND",
        "INVALID_REQUEST",
        "INVALID_RESPONSE",
        "CONTENT_FILTERED",
        "QUOTA_EXCEEDED",
        "PROVIDER_ERROR",
        "NETWORK_ERROR",
        "TIMEOUT",
        "CANCELLED"
      ]
    },
    "provider": { "type": "string" },
    "modality": {
      "type": "string",
      "enum": ["llm", "embedding", "image", "audio", "video"]
    },
    "statusCode": { "type": "integer" },
    "cause": { "type": "object" }
  }
}
```

### A.3 Turn Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["messages", "response", "toolExecutions", "usage", "cycles"],
  "properties": {
    "messages": {
      "type": "array",
      "items": { "$ref": "#/definitions/Message" }
    },
    "response": { "$ref": "#/definitions/AssistantMessage" },
    "toolExecutions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["toolName", "toolCallId", "arguments", "result", "isError", "duration"],
        "properties": {
          "toolName": { "type": "string" },
          "toolCallId": { "type": "string" },
          "arguments": { "type": "object" },
          "result": {},
          "isError": { "type": "boolean" },
          "duration": { "type": "integer" },
          "approved": { "type": "boolean" }
        }
      }
    },
    "usage": {
      "type": "object",
      "required": ["inputTokens", "outputTokens", "totalTokens"],
      "properties": {
        "inputTokens": { "type": "integer" },
        "outputTokens": { "type": "integer" },
        "totalTokens": { "type": "integer" },
        "cycles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "inputTokens": { "type": "integer" },
              "outputTokens": { "type": "integer" }
            }
          }
        }
      }
    },
    "cycles": { "type": "integer" },
    "data": {}
  }
}
```

---

## Appendix B: Similarity Functions

For embedding operations, implementations MAY provide similarity utilities.

**Cosine Similarity:**

```
cosine_similarity(a, b) = dot(a, b) / (norm(a) * norm(b))

where:
  dot(a, b) = sum(a[i] * b[i]) for all i
  norm(x) = sqrt(sum(x[i]^2)) for all i
```

Returns a value between -1 and 1, where 1 indicates identical direction.

**Euclidean Distance:**

```
euclidean_distance(a, b) = sqrt(sum((a[i] - b[i])^2)) for all i
```

Returns a non-negative value, where 0 indicates identical vectors.

**Dot Product:**

```
dot_product(a, b) = sum(a[i] * b[i]) for all i
```

Returns a scalar value. For normalized vectors, equivalent to cosine similarity.

---

## Changelog

### 1.2.0-draft

- **Added** Section 10.9 Provider-Native Tools documenting server-side built-in tools (web search, image generation, code interpreter, etc.)
- **Added** `images`, `audio`, `video` convenience accessors to base Message structure (Section 6.1) to match existing `text` accessor pattern
- **Reformatted** specification to be language-agnostic
- **Replaced** language-specific syntax with pseudocode notation
- **Added** JSON Schema definitions in appendices
- **Added** implementation guidance for multiple programming languages
- **Added** security considerations section
- **Added** HTTP status code mapping table
- **Added** `ImageProviderStreamResult` type definition and export
- **Added** cross-reference note in Section 10.4 linking tool and structured output validation behavior
- **Added** `EmbeddingInputType` enumeration (`document`/`query`) for provider-specific input type hints
- **Added** `MessageOptions` structure definition with constructor signatures for all message types
- **Added** Section 1.7 clarifying package naming conventions and import syntax
- **Fixed** terminology: "fragments" → "events" in Image conformance (Section 16.1.3)
- **Fixed** RFC 2119 compliance: "will throw" → "MUST throw" in Section 11.3
- **Fixed** iterator notation to use language-agnostic `(iterable)` format instead of `[iterator]`
- **Corrected** Section 16.4 capability declaration wording (1.1 incorrectly stated "no explicit capability interface")
- **Updated** example model IDs to use dated format (e.g., `claude-haiku-4-20250514`) for accuracy; this is an example update, not a format requirement
- **Updated** example package name to `upp` as a language-agnostic placeholder (implementations choose their own names)
- **Clarified** provider implementation patterns across language paradigms
- **Clarified** `BinaryBlock` constraint: only valid in `UserContent`, not `AssistantContent`
- **Maintained** semantic compatibility with UPP 1.1 (additive clarifications only, no breaking changes)

### 1.1.0-draft

- **Renamed** from "useAI Provider Protocol" to "Unified Provider Protocol"
- **Renamed** package from `useAI` to `@providerprotocol/ai`
- **Renamed** entry points: `useAI()` → `llm()`, `useEmbedding()` → `embedding()`, `useImage()` → `image()`
- **Added** `ai` namespace export for grouped imports
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
- **Added** Conformance section

### 1.0.0-draft

- Initial draft specification (LLM-focused)
