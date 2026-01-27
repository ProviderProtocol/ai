# UPP-1.3: Unified Provider Protocol Specification

**Version:** 1.3.1
**Status:** Draft
**Authors:** UPP Working Group

---

## Abstract

The Unified Provider Protocol (UPP) is a language-agnostic specification for interacting with AI inference services. This document defines the protocol semantics, data structures, and implementation requirements for building UPP-compliant clients and providers.

UPP establishes uniform interfaces for Large Language Models (LLM), Embedding Models, and Image Generation Models. The protocol enables multi-provider interoperability while preserving provider-native configuration and avoiding abstraction leakage.

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
10. [Middleware](#10-middleware)
11. [Tools](#11-tools)
12. [Structured Outputs](#12-structured-outputs)
13. [Embedding Interface](#13-embedding-interface)
14. [Image Interface](#14-image-interface)
15. [Data Types](#15-data-types)
16. [Conformance](#16-conformance)
17. [Security Considerations](#17-security-considerations)

---

## 1. Introduction

### 1.1 Purpose

Modern AI development requires interacting with multiple providers (Anthropic, OpenAI, Google, etc.), each with distinct APIs, authentication schemes, and response formats. UPP establishes a standard protocol that:

- Provides modality-specific interfaces (`llm`, `embedding`, `image`)
- Enables provider switching without application code changes
- Maintains provider-native configuration to avoid abstraction leakage
- Shares common infrastructure (auth, retry, HTTP) across modalities

### 1.2 Scope

This specification covers:

- The `llm()` function interface (chat/completion)
- The `embedding()` function interface (vector embeddings)
- The `image()` function interface (image generation)
- Provider adapter requirements for each modality
- Shared infrastructure (ProviderConfig, KeyStrategy, error handling)
- Message, Turn, and Thread data structures
- Streaming response handling
- Tool definition and execution

### 1.3 Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) [[RFC2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

### 1.4 Terminology

| Term | Definition |
|------|------------|
| **Provider** | A vendor-specific adapter exposing one or more modality interfaces |
| **Modality** | A distinct AI capability: LLM, embedding, or image generation |
| **BoundModel** | A model instance bound to a specific provider and model ID |
| **Message** | A single message in an LLM conversation |
| **Turn** | The complete result of one LLM inference call |
| **Thread** | A utility class for managing LLM conversation history |

### 1.5 Notation Conventions

This specification uses language-agnostic pseudocode. Implementations SHOULD adapt syntax to their target language's conventions.

```
function_name(arg1, arg2)     // Function call
{ key: value }                // Object/map literal
[item1, item2]                // Array/list literal
object.property               // Property access
await expression              // Async operation
Type?                         // Optional value
```

### 1.6 Schema Validation

This specification references [JSON Schema](https://json-schema.org/) (draft-07 or later) for parameter and structured output definitions. Implementations MAY use schema validation libraries appropriate to their language ecosystem (e.g., Zod for TypeScript, Pydantic for Python, JSON Schema validators for other languages).

UPP does NOT mandate runtime schema validation. Schemas serve as contracts between components; validation is the responsibility of the application layer.

---

## 2. Design Principles

### 2.1 Provider Transparency

Configuration MUST pass through to providers unchanged. UPP SHALL NOT impose its own defaults or transform model parameters. When no config is supplied, provider defaults apply.

### 2.2 Explicit Over Magic

UPP favors explicit APIs:

- Separate entry points per modality—no modal switches
- `generate()` for complete responses, `stream()` for streaming
- Users manage their own conversation history
- System prompts declared at configuration

### 2.3 Modality-Specific Interfaces

Each modality gets a purpose-built interface:

- **LLM**: Conversational with messages, turns, streaming, tools
- **Embedding**: Batch-oriented, returns vectors
- **Image**: Prompt-based, returns images

### 2.4 Shared Infrastructure

While interfaces differ, providers share common infrastructure:

- `ProviderConfig` (apiKey, baseUrl, timeout, retry)
- `KeyStrategy` (RoundRobin, Weighted, Dynamic)
- Error handling (`UPPError`, `ErrorCode`)

### 2.5 HTTP-First Provider Implementation

Providers SHOULD wrap vendor REST APIs directly using native HTTP primitives rather than depending on first-party vendor SDKs.

**Rationale:** Minimal dependencies, full control over request/response handling, consistency across providers, transparency, and smaller bundle sizes.

---

## 3. Core Concepts

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Code                            │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
    │    llm()    │     │  embedding() │     │   image()   │
    └─────────────┘     └──────────────┘     └─────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                  Provider Adapters                          │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Vendor APIs                              │
    └─────────────────────────────────────────────────────────────┘
```

### 3.2 Import Patterns

Implementations SHOULD export both a namespace object and individual functions:

```
// Namespace style
import ai from "upp"
claude = ai.llm({ model: anthropic("claude-sonnet-4-20250514") })

// Direct import style
import { llm } from "upp"
claude = llm({ model: anthropic("claude-sonnet-4-20250514") })
```

### 3.3 Provider Structure

A provider exports a factory function that returns a `ModelReference`:

```
import openai from "upp/openai"

llm({ model: openai("gpt-4o") })
embedding({ model: openai("text-embedding-3-small") })
image({ model: openai("dall-e-3") })
```

### 3.4 Separation of Concerns

| Layer | Purpose | Shared Across Modalities |
|-------|---------|--------------------------|
| **Provider Config** | Infrastructure settings | Yes |
| **Model Params** | Model behavior parameters | No |
| **Modality Options** | Interface-specific settings | No |

---

## 4. Provider Protocol

### 4.1 ProviderConfig

All providers share common configuration:

| Field | Type | Description |
|-------|------|-------------|
| `apiKey` | String \| Function \| KeyStrategy | API key or key strategy |
| `baseUrl` | String | Override base API URL |
| `timeout` | Integer | Request timeout in milliseconds |
| `fetch` | Function | Custom fetch implementation |
| `retryStrategy` | RetryStrategy | Retry handling strategy |
| `headers` | Map<String, String> | Custom HTTP headers |

Providers MUST support custom headers. Custom headers MUST be merged with provider-required headers. If a custom header conflicts with a required header, the custom header SHOULD take precedence.

### 4.2 Key Strategies

**KeyStrategy Interface:**

```
interface KeyStrategy {
  getKey(): String | Promise<String>
}
```

**Standard Implementations:**

| Strategy | Description |
|----------|-------------|
| `RoundRobinKeys(keys[])` | Cycles through keys in order |
| `WeightedKeys(entries[])` | Random selection with weights |
| `DynamicKey(fn)` | Custom async key selection |

### 4.3 Retry Strategies

**RetryStrategy Interface:**

```
interface RetryStrategy {
  onRetry(error: UPPError, attempt: Integer): Integer | null | Promise
  beforeRequest?(): Integer | Promise<Integer>
  reset?(): void
}
```

The `onRetry` method MUST return delay in milliseconds before retry, or `null` to stop retrying.

**Standard Implementations:**

| Strategy | Description |
|----------|-------------|
| `ExponentialBackoff(options)` | Exponential backoff with jitter |
| `LinearBackoff(options)` | Fixed delay between retries |
| `NoRetry()` | No automatic retry |

### 4.4 Error Handling

All modalities MUST normalize errors to `UPPError`:

| Field | Type | Description |
|-------|------|-------------|
| `message` | String | Human-readable error message |
| `code` | ErrorCode | Standardized error code |
| `provider` | String | Provider name |
| `modality` | Modality | Which modality: `llm`, `embedding`, `image` |
| `statusCode` | Integer? | HTTP status code if applicable |
| `cause` | Error? | Original underlying error |

**ErrorCode Values:**

`AUTHENTICATION_FAILED`, `RATE_LIMITED`, `CONTEXT_LENGTH_EXCEEDED`, `MODEL_NOT_FOUND`, `INVALID_REQUEST`, `INVALID_RESPONSE`, `CONTENT_FILTERED`, `QUOTA_EXCEEDED`, `PROVIDER_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `CANCELLED`

**HTTP Status Code Mapping:**

| HTTP Status | Error Code |
|-------------|------------|
| 400 | `INVALID_REQUEST` |
| 401, 403 | `AUTHENTICATION_FAILED` |
| 404 | `MODEL_NOT_FOUND` |
| 429 | `RATE_LIMITED` |
| 5xx | `PROVIDER_ERROR` |

### 4.5 ModelReference

```
interface ModelReference {
  modelId: String
  provider: Provider
}
```

When a modality function receives a `ModelReference`, it MUST check if the provider supports that modality and throw `UPPError` with code `INVALID_REQUEST` if not supported.

---

## 5. LLM Interface

### 5.1 Function Signature

```
llm(options: LLMOptions) -> LLMInstance
```

### 5.2 LLMOptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelReference | Yes | Model reference from provider factory |
| `config` | ProviderConfig | No | Provider configuration |
| `params` | Map | No | Model-specific parameters |
| `system` | String | No | System prompt |
| `tools` | List<Tool> | No | Available tools |
| `toolStrategy` | ToolUseStrategy | No | Tool execution strategy |
| `structure` | JSONSchema | No | Structured output schema |

### 5.3 LLMInstance

| Method/Property | Description |
|-----------------|-------------|
| `generate(...)` | Execute inference, return complete Turn |
| `stream(...)` | Execute streaming inference |
| `model` | The bound model |
| `capabilities` | Provider API capabilities |

**generate() Signatures:**

```
generate(input: InferenceInput) -> Promise<Turn>
generate(...inputs: InferenceInput[]) -> Promise<Turn>
generate(history: List<Message>, ...inputs: InferenceInput[]) -> Promise<Turn>
```

**InferenceInput:** `String | Message | ContentBlock`

### 5.4 LLMCapabilities

Capabilities declare what the **provider's API** supports, not individual model capabilities:

| Field | Type | Description |
|-------|------|-------------|
| `streaming` | Boolean | Supports streaming responses |
| `tools` | Boolean | Supports tool/function calling |
| `structuredOutput` | Boolean | Supports native structured output |
| `imageInput` | Boolean | Supports image input |
| `documentInput` | Boolean | Supports document input |
| `videoInput` | Boolean | Supports video input |
| `audioInput` | Boolean | Supports audio input |

Capabilities are static for the lifetime of a provider instance.

### 5.5 Tool Execution Loop

The `llm()` core manages the tool execution loop. Providers only handle single request/response cycles.

**Loop Flow:**

1. Convert input to UserMessage, append to messages
2. Call provider's `complete()` method
3. If response has tool calls AND iterations < maxIterations:
   - Execute tools (parallel if multiple)
   - Append AssistantMessage and ToolResultMessage
   - Return to step 2
4. Build Turn from accumulated messages

### 5.6 Provider Responsibilities

Providers MUST:

1. **Transform requests:** Convert UPP structures to vendor format
2. **Transform responses:** Map vendor responses to `AssistantMessage`
3. **Handle system prompts:** Transform to vendor-specific format
4. **Normalize errors:** Wrap vendor errors in `UPPError`
5. **Namespace metadata:** Store vendor-specific data under `metadata.{providerName}`

---

## 6. Messages

### 6.1 Message Types

**Base Message Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique message identifier |
| `type` | MessageType | `user`, `assistant`, or `tool_result` |
| `timestamp` | Timestamp | When created |
| `metadata` | Map? | Provider-namespaced metadata |

**Convenience Accessors** (on all message types):

| Accessor | Type | Description |
|----------|------|-------------|
| `text` | String | Concatenated text blocks |
| `images` | List<ImageBlock> | All image blocks |
| `documents` | List<DocumentBlock> | All document blocks |
| `audio` | List<AudioBlock> | All audio blocks |
| `video` | List<VideoBlock> | All video blocks |

### 6.2 UserMessage

| Field | Type | Description |
|-------|------|-------------|
| `type` | "user" | Always "user" |
| `content` | List<UserContent> | Content blocks |

`UserContent`: `TextBlock`, `ImageBlock`, `DocumentBlock`, `AudioBlock`, `VideoBlock`, `BinaryBlock`

### 6.3 AssistantMessage

| Field | Type | Description |
|-------|------|-------------|
| `type` | "assistant" | Always "assistant" |
| `content` | List<AssistantContent> | Content blocks |
| `toolCalls` | List<ToolCall>? | Tool calls requested |
| `hasToolCalls` | Boolean | True if toolCalls is non-empty |

`AssistantContent`: `TextBlock`, `ReasoningBlock`, `ImageBlock`, `AudioBlock`, `VideoBlock`

### 6.4 ToolResultMessage

| Field | Type | Description |
|-------|------|-------------|
| `type` | "tool_result" | Always "tool_result" |
| `results` | List<ToolResult> | Tool execution results |

### 6.5 Content Blocks

| Block Type | Fields | Description |
|------------|--------|-------------|
| `TextBlock` | `text: String` | Plain text content |
| `ReasoningBlock` | `text: String` | Model reasoning/thinking |
| `ImageBlock` | `source: ImageSource`, `mimeType: String` | Image content |
| `DocumentBlock` | `source: DocumentSource`, `mimeType: String` | Document content |
| `AudioBlock` | `data: Bytes`, `mimeType: String` | Audio content |
| `VideoBlock` | `data: Bytes`, `mimeType: String` | Video content |
| `BinaryBlock` | `data: Bytes`, `mimeType: String` | Arbitrary binary (UserContent only) |

**ImageSource Variants:** `base64`, `url`, `bytes`

**DocumentSource Variants:** `base64`, `url`, `text`

### 6.6 Helper Types

Implementations SHOULD provide helper types with factory methods:

**Image:**
- `Image.fromPath(path)` - Create from file path
- `Image.fromUrl(url, mimeType?)` - Create from URL
- `Image.fromBytes(data, mimeType)` - Create from bytes
- `Image.fromBase64(base64, mimeType)` - Create from base64
- `Image.fromBlock(block)` - Create from ImageBlock

**Document:**
- `Document.fromPath(path, title?)` - Create from file path
- `Document.fromUrl(url, title?)` - Create from URL
- `Document.fromBase64(base64, mimeType, title?)` - Create from base64
- `Document.fromText(text, title?)` - Create from plain text

**Audio:**
- `Audio.fromPath(path)` - Create from file path
- `Audio.fromBytes(data, mimeType)` - Create from bytes
- `Audio.fromBase64(base64, mimeType)` - Create from base64

**Video:**
- `Video.fromPath(path)` - Create from file path
- `Video.fromBytes(data, mimeType)` - Create from bytes
- `Video.fromBase64(base64, mimeType)` - Create from base64

### 6.7 Type Guards

Implementations SHOULD provide type guards:

```
isUserMessage(msg: Message) -> Boolean
isAssistantMessage(msg: Message) -> Boolean
isToolResultMessage(msg: Message) -> Boolean
```

---

## 7. Turns

### 7.1 Turn Structure

A `Turn` represents the complete result of one inference call:

| Field | Type | Description |
|-------|------|-------------|
| `messages` | List<Message> | All messages produced, chronological |
| `response` | AssistantMessage | Final assistant response |
| `toolExecutions` | List<ToolExecution> | Tool executions that occurred |
| `usage` | TokenUsage | Aggregate token usage |
| `cycles` | Integer | Number of inference cycles |
| `data` | Any? | Structured output data (if structure provided) |

### 7.2 TokenUsage

| Field | Type | Description |
|-------|------|-------------|
| `inputTokens` | Integer | Input tokens across all cycles |
| `outputTokens` | Integer | Output tokens across all cycles |
| `totalTokens` | Integer | Total tokens |
| `cacheReadTokens` | Integer | Tokens read from cache (0 if unsupported) |
| `cacheWriteTokens` | Integer | Tokens written to cache (0 if unsupported) |

### 7.3 ToolExecution

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | String | Tool that was called |
| `toolCallId` | String | Tool call ID |
| `arguments` | Map | Arguments passed |
| `result` | Any | Result returned |
| `isError` | Boolean | Whether execution errored |
| `duration` | Integer | Duration in milliseconds |

---

## 8. Threads

`Thread` is an OPTIONAL utility class for managing conversation history.

### 8.1 Thread Interface

| Property/Method | Description |
|-----------------|-------------|
| `id` | Unique thread identifier |
| `messages` | All messages (read-only) |
| `length` | Number of messages |
| `append(turn)` | Append messages from a turn |
| `push(...messages)` | Add raw messages |
| `clear()` | Clear all messages |
| `toJSON()` | Serialize to JSON |
| `Thread.fromJSON(json)` | Deserialize from JSON |

### 8.2 Usage

```
thread = Thread()
turn = await claude.generate(thread, "Hello!")
thread.append(turn)
```

Threads are optional—plain arrays work:

```
messages = []
turn = await claude.generate(messages, "Hello!")
messages.push(...turn.messages)
```

---

## 9. Streaming

### 9.1 StreamResult

Streaming returns a `StreamResult`:

| Property/Method | Description |
|-----------------|-------------|
| (async iterable) | Yields `StreamEvent` objects |
| `turn` | Promise resolving to complete Turn |
| `abort()` | Abort the stream |

### 9.2 StreamEvent

| Field | Type | Description |
|-------|------|-------------|
| `type` | StreamEventType | Event type |
| `index` | Integer | Content block index |
| `delta` | EventDelta | Event data |

**StreamEventType Values:**

`text_delta`, `reasoning_delta`, `image_delta`, `audio_delta`, `video_delta`, `object_delta`, `tool_call_delta`, `tool_execution_start`, `tool_execution_end`, `message_start`, `message_stop`, `content_block_start`, `content_block_stop`

### 9.3 Usage

```
stream = claude.stream(history, "Write a haiku.")

for await (event in stream) {
  if (event.type == "text_delta") {
    print(event.delta.text)
  }
}

turn = await stream.turn
```

### 9.4 Abort Behavior

When aborted during tool execution:
- The abort signal MUST propagate to in-flight tool execution
- Pending tool calls MUST be skipped
- The generation MUST throw `CANCELLED` error

---

## 10. Middleware

### 10.1 Overview

Middleware provides a composable mechanism to intercept and transform requests, responses, and stream events. Middleware is configured per-instance and executes in a defined order.

```
claude = llm({
  model: anthropic("claude-sonnet-4-20250514"),
  middleware: [
    loggingMiddleware(),
    parsedObjectMiddleware()
  ]
})
```

### 10.2 Middleware Interface

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | Middleware name for debugging |
| `onStart` | Function | No | Called when generate/stream starts |
| `onEnd` | Function | No | Called when generate/stream completes |
| `onError` | Function | No | Called on non-cancellation errors |
| `onAbort` | Function | No | Called when a request is cancelled |
| `onRequest` | Function | No | Called before provider execution |
| `onResponse` | Function | No | Called after provider execution |
| `onTurn` | Function | No | Called when a complete Turn is assembled (LLM only) |
| `onStreamEvent` | Function | No | Called for each stream event |
| `onStreamEnd` | Function | No | Called when stream completes |
| `onToolCall` | Function | No | Called before tool execution |
| `onToolResult` | Function | No | Called after tool execution |

### 10.3 MiddlewareContext

Context passed to lifecycle hooks:

| Field | Type | Description |
|-------|------|-------------|
| `modality` | Modality | `llm`, `embedding`, or `image` |
| `modelId` | String | Model identifier |
| `provider` | String | Provider name |
| `streaming` | Boolean | Whether this is a streaming request |
| `request` | AnyRequest | The request object |
| `response` | AnyResponse? | Response (populated after execution) |
| `state` | Map | Shared state across middleware |
| `startTime` | Integer | Request start timestamp |
| `endTime` | Integer? | Request end timestamp |

### 10.4 StreamContext

Context passed to stream event hooks:

| Field | Type | Description |
|-------|------|-------------|
| `state` | Map | Shared state across middleware |

Middleware that need to accumulate text or other data SHOULD manage their own state using the provided `state` map with namespaced keys (e.g., `myMiddleware:accumulator`).

### 10.5 Hook Execution Order

```
generate() / stream() called
    │
    ▼
┌─────────────────────────────────────────┐
│  onStart (all middleware, in order)     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  onRequest (all middleware, in order)   │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Provider execution                     │
│  ├─ For streaming: onStreamEvent()      │
│  │   called per event (pipeline)        │
│  └─ Tool loop: onToolCall/onToolResult  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  onResponse (all middleware, reverse)   │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  onTurn (all middleware, reverse order) │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  onEnd (all middleware, reverse order)  │
└─────────────────────────────────────────┘
    │
    ▼ (on error at any point)
┌─────────────────────────────────────────┐
│  onError (all middleware that have it)  │
└─────────────────────────────────────────┘
    │
    ▼ (on cancellation at any point)
┌─────────────────────────────────────────┐
│  onAbort (all middleware that have it)  │
└─────────────────────────────────────────┘
```

Lifecycle hooks (`onStart`, `onRequest`) execute in middleware array order. Response hooks (`onResponse`, `onTurn`, `onEnd`) execute in reverse order.

### 10.6 Stream Event Transformation

The `onStreamEvent` hook MAY transform, filter, or expand events:

| Return Value | Behavior |
|--------------|----------|
| `StreamEvent` | Replace event with returned event |
| `StreamEvent[]` | Expand into multiple events |
| `null` | Filter out (suppress) the event |

```
// Example: Filter out reasoning events
onStreamEvent(event, ctx) {
  if (event.type == "reasoning_delta") return null
  return event
}
```

### 10.7 Built-in Middleware

**parsedObjectMiddleware(options?)**

Parses incremental JSON from `object_delta` and `tool_call_delta` events. Adds a `parsed` field to the event delta containing the incrementally parsed value.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `parseObjects` | Boolean | true | Parse ObjectDelta events |
| `parseToolCalls` | Boolean | true | Parse ToolCallDelta events |

**loggingMiddleware(options?)**

Logs request lifecycle events for debugging.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | LogLevel | "info" | Minimum log level |
| `logger` | Function | console | Custom logger function |

**pubsubMiddleware(options?)**

Buffers stream events for reconnection and stream resumption. Intended for streaming use cases with reconnecting clients.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `adapter` | PubSubAdapter | memoryAdapter() | Storage adapter for in-flight streams |
| `streamId` | String | (none) | Stream identifier for buffering |

**persistenceMiddleware(options?)**

Loads and saves conversation threads around LLM execution.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `adapter` | PersistenceAdapter | (required) | Adapter for loading and saving threads |

### 10.8 Type Extensions

Middleware that adds fields to events SHOULD export extended types:

```
// parsedObjectMiddleware exports:
interface ParsedEventDelta extends EventDelta {
  parsed?: Any
}

interface ParsedStreamEvent extends StreamEvent {
  delta: ParsedEventDelta
}
```

Consumers accessing middleware-added fields MUST cast to the extended type.

---

## 11. Tools

### 11.1 Tool Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | Tool name (unique within instance) |
| `description` | String | Yes | Description for the model |
| `parameters` | JSONSchema | Yes | Parameter schema |
| `run` | Function | Yes | Execution function |
| `approval` | Function | No | Approval handler |
| `metadata` | Map | No | Provider-specific metadata |

### 11.2 Tool Execution

By default, `llm()` handles tool execution automatically:

1. Model returns `AssistantMessage` with `toolCalls`
2. If `approval` defined and returns `false`, error result sent to model
3. Tool's `run` function executed
4. Result sent back as `ToolResultMessage`
5. Loop continues until no tool calls OR max iterations

**IMPORTANT:** `llm()` SHALL NOT validate tool arguments against the schema. Tool implementations MUST treat arguments as untrusted input.

### 11.3 ToolUseStrategy

| Field | Type | Description |
|-------|------|-------------|
| `maxIterations` | Integer | Maximum tool rounds (default: 10) |
| `onToolCall` | Function | Called when tool requested |
| `onBeforeCall` | Function | Called before execution |
| `onAfterCall` | Function | Called after execution |
| `onError` | Function | Called on execution error |
| `onMaxIterations` | Function | Called when max reached |

### 11.4 Provider-Native Tools

Some providers offer built-in server-side tools (web search, code interpreter, etc.). These differ from UPP function tools:

| Aspect | UPP Function Tools | Provider-Native Tools |
|--------|-------------------|----------------------|
| Passed via | `tools` parameter | `params.tools` |
| Execution | Client-side | Server-side |

```
// Provider-native tools go in params
gpt = llm({
  model: openai("gpt-4o"),
  params: {
    tools: [{ type: "web_search" }]
  },
  // UPP function tools
  tools: [myCustomTool]
})
```

---

## 12. Structured Outputs

### 12.1 Overview

Structured outputs constrain model responses to a JSON schema:

```
claude = llm({
  model: anthropic("claude-sonnet-4-20250514"),
  structure: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" }
    },
    required: ["name", "age"]
  }
})

turn = await claude.generate("John Doe is 30 years old.")
print(turn.data)  // { name: "John Doe", age: 30 }
```

### 12.2 Requirements

If a provider's API does not support native structured outputs (`capabilities.structuredOutput` is `false`), the `llm()` core MUST throw `INVALID_REQUEST` when `structure` is provided.

UPP SHALL NOT validate responses against the schema. Schema validation is the application's responsibility.

---

## 13. Embedding Interface

### 14.1 Function Signature

```
embedding(options: EmbeddingOptions) -> EmbeddingInstance
```

### 13.2 EmbeddingOptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelReference | Yes | Model reference |
| `config` | ProviderConfig | No | Provider configuration |
| `params` | Map | No | Provider-specific parameters |

### 13.3 EmbeddingInstance

| Method | Description |
|--------|-------------|
| `embed(input, options?)` | Embed one or more inputs |

**EmbeddingInput:** `String | TextBlock | ImageBlock`

### 13.4 EmbeddingResult

| Field | Type | Description |
|-------|------|-------------|
| `embeddings` | List<Embedding> | Embeddings in input order |
| `usage` | EmbeddingUsage | Usage statistics |
| `metadata` | Map? | Provider-specific metadata |

**Embedding:**

| Field | Type | Description |
|-------|------|-------------|
| `vector` | List<Float> | The embedding vector |
| `dimensions` | Integer | Vector dimensionality |
| `index` | Integer | Input array position |

### 13.5 Chunked Mode

For large-scale embedding, use chunked mode:

```
stream = embedder.embed(documents, { chunked: true, batchSize: 100 })

for await (progress in stream) {
  print("Progress:", progress.percent + "%")
  await storeInVectorDB(progress.embeddings)
}
```

---

## 14. Image Interface

### 14.1 Function Signature

```
image(options: ImageOptions) -> ImageInstance
```

### 14.2 ImageOptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | ModelReference | Yes | Model reference |
| `config` | ProviderConfig | No | Provider configuration |
| `params` | Map | No | Provider-specific parameters |

All provider-specific options (size, quality, style, etc.) flow through `params`.

### 14.3 ImageInstance

| Method | Description |
|--------|-------------|
| `generate(input, options?)` | Generate images from prompt |
| `stream(input)` | Generate with streaming (if supported) |
| `edit(input)` | Edit existing image (if supported) |
| `capabilities` | Model capabilities |

### 14.4 ImageCapabilities

| Field | Type | Description |
|-------|------|-------------|
| `generate` | Boolean | Supports text-to-image |
| `streaming` | Boolean | Supports streaming previews |
| `edit` | Boolean | Supports image editing |
| `maxImages` | Integer? | Maximum images per request |

### 14.5 ImageResult

| Field | Type | Description |
|-------|------|-------------|
| `images` | List<GeneratedImage> | Generated images |
| `metadata` | Map? | Provider-specific metadata |
| `usage` | ImageUsage? | Usage information |

### 14.6 Basic Usage

```
dalle = image({
  model: openai("dall-e-3"),
  params: { size: "1024x1024", quality: "hd" }
})

result = await dalle.generate("A sunset over mountains")
imageData = result.images[0].image.toBytes()
```

---

## 15. Data Types

### 15.1 Primitive Types

| Type | Description |
|------|-------------|
| `String` | UTF-8 text |
| `Integer` | Signed integer (at least 64-bit) |
| `Float` | IEEE 754 double precision |
| `Boolean` | True or false |
| `Bytes` | Raw binary data |
| `Timestamp` | Point in time (ISO 8601) |
| `Map<K,V>` | Key-value mapping |
| `List<T>` | Ordered collection |
| `T?` | Optional value |
| `Any` | Any JSON value |

### 15.2 Platform Types

Implementations MUST use platform-appropriate equivalents:

| Type | Description |
|------|-------------|
| `AbortSignal` | Allows aborting async operations |
| `AsyncIterable<T>` | Async iteration protocol |
| `Promise<T>` | Promise/future resolving to T |

### 15.3 Modality Type

```
Modality = "llm" | "embedding" | "image"
```

### 15.4 Type Constants

Implementations SHOULD export named constants for discriminated union types (e.g., `StreamEventType.TextDelta`, `ErrorCode.RateLimited`, `MessageRole.User`). Using constants instead of raw strings enables better tooling support and type safety.

---

## 16. Conformance

### 16.1 Provider Conformance

Providers MAY implement one or more modalities. For each implemented modality:

**LLM Conformance:**

| Level | Requirements |
|-------|--------------|
| Core | Text I/O, `LLMCapabilities` declaration, error normalization, system prompt handling |
| Streaming | `stream()` method, proper `StreamEvent` emission |
| Tools | Tool definition transformation, tool call detection, result handling |
| Structured Output | Schema transformation, JSON parsing |
| Multimodal | Input handling for declared capabilities |

**Embedding Conformance:**

| Level | Requirements |
|-------|--------------|
| Core | `embed()` method, vector return, error normalization |
| Metadata | Preserve per-embedding and response metadata |

**Image Conformance:**

| Level | Requirements |
|-------|--------------|
| Core | `generate()` method, `ImageCapabilities` declaration, error normalization |
| Editing | `edit()` method (if `capabilities.edit`) |
| Streaming | `stream()` method (if `capabilities.streaming`) |

### 16.2 Error Handling Requirements

All providers MUST:

- Normalize vendor errors to `UPPError`
- Set appropriate `ErrorCode` based on HTTP status
- Include `provider` name and `modality` in all errors
- Preserve original error as `cause` when available

### 16.3 Configuration Requirements

All providers MUST:

- Pass `params` to vendor API without modification
- Support custom `baseUrl`
- Support custom `fetch` implementation
- Respect `timeout` setting
- Use provided `retryStrategy`

### 16.4 Metadata Requirements

All providers MUST:

- Namespace metadata under `metadata.{providerName}`
- Preserve unknown metadata fields during round-trips

---

## 17. Security Considerations

### 17.1 API Key Handling

- API keys MUST NOT be logged
- API keys SHOULD NOT appear in error messages
- Implementations SHOULD support secure key storage

### 17.2 Tool Execution

- Tool arguments MUST be treated as untrusted input
- Implementations MUST NOT validate arguments against schema automatically
- Tool implementations SHOULD validate and sanitize inputs
- Sensitive operations SHOULD use approval handlers

### 17.3 Content Handling

- Binary data may come from untrusted sources
- Implementations SHOULD validate MIME types
- Large content SHOULD be size-limited

### 17.4 Network Security

- Implementations SHOULD default to TLS/SSL
- Custom base URLs allow MITM if misconfigured
- Timeout settings prevent resource exhaustion

---

## Changelog

### 1.3.1

- **Added** Middleware system (Section 10) with composable request/response/stream interception
- **Added** `Middleware` interface with lifecycle hooks (`onStart`, `onEnd`, `onRequest`, `onResponse`, `onError`, `onAbort`, `onTurn`)
- **Added** Stream event transformation via `onStreamEvent` hook
- **Added** Tool execution hooks (`onToolCall`, `onToolResult`)
- **Added** `MiddlewareContext` and `StreamContext` types for hook parameters
- **Added** Built-in `parsedObjectMiddleware()` for incremental JSON parsing
- **Added** Built-in `loggingMiddleware()` for request lifecycle logging
- **Added** Built-in `pubsubMiddleware()` for stream resumption
- **Added** Built-in `persistenceMiddleware()` for thread persistence
- **Added** `ParsedEventDelta` and `ParsedStreamEvent` extended types
- **Simplified** `StreamContext` to only contain shared `state` map; middleware manage their own accumulation
- **Breaking** Removed `parsed` field from base `EventDelta` type; use `parsedObjectMiddleware()` for incremental JSON parsing during streaming
- **Updated** Section numbering (Sections 10-16 renumbered to 11-17)

### 1.3.0

- Reformatted specification for improved clarity and usability
- Updated RFC 2119 compliance with BCP 14 and RFC 8174 references
- Simplified schema definitions to reference JSON Schema directly
- Removed verbose appendix JSON schemas (duplicative of prose definitions)
- Consolidated helper types into single section
- Streamlined conformance requirements into tabular format
- Removed provider implementation guide (to be published as separate document)
- Simplified type constant documentation
- Clarified MUST/SHOULD/MAY usage throughout per RFC 2119/8174
- Reorganized table of contents for logical flow
- Reduced specification length while maintaining semantic completeness

### 1.2.0-draft

- **Added** `Document` helper type (Section 6.6) with factory methods for PDF and text documents
- **Added** `Audio` helper type (Section 6.7) with factory methods for audio content
- **Added** `Video` helper type (Section 6.8) with factory methods for video content
- **Added** `Image.fromBlock()` factory method to create Image from existing ImageBlock
- **Simplified** specification to pure protocol architecture; removed all vendor-specific implementation details including: metadata option tables (6.1, 10.1), system prompt mappings (5.10.4), structured output wiring (11.3), mask conventions (13.6), provider tool reference (10.9.5), embedding params (12.10), image params (13.14), capability matrix (13.14.9), and example model names (1.5)
- **Removed** Image conformance levels for vary/upscale/outpaint (16.1.3) to match interface; renumbered Streaming to Level 3
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
- **Added** unified `embed()` interface for single, batch, and chunked embedding
- **Added** `EmbeddingStream` for large-scale embedding with progress
- **Added** image editing, variation, and upscaling interfaces
- **Added** `RetryStrategy` interface for pluggable retry/rate-limit handling
- **Replaced** `RetryConfig` with `RetryStrategy` for flexibility
- **Updated** `UPPError` with `modality` field
- **Updated** provider structure to use unified factories
- **Added** Conformance section

### 1.0.0-draft

- Initial draft specification (LLM-focused)
