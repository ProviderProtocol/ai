# Provider Protocol SDK (UPP) - LLM Reference Guide

**Package**: `@providerprotocol/ai`
**Version**: 0.0.35
**Runtime**: Bun/Node.js (ESM only)

## Overview

Provider Protocol (UPP - Unified Provider Protocol) is a TypeScript SDK that provides a unified API for interacting with multiple AI providers. It eliminates provider fragmentation by offering one consistent interface across 9+ providers and 3 modalities.

**Key Features:**
- Unified interface for Anthropic, OpenAI, Google, xAI, Groq, Cerebras, Ollama, OpenRouter
- Three modalities: LLM inference, embeddings, image generation
- Full streaming support with event-based API
- Tool/function calling with automatic execution loops
- Structured output (JSON schema validation)
- Multimodal input (text, images, documents, audio, video)
- Middleware system for request/response transformation
- Stream resumption for reconnecting clients (pub/sub)
- Retry strategies and API key rotation

---

## Installation

```bash
bun add @providerprotocol/ai
# or
npm install @providerprotocol/ai
```

---

## Quick Start

### Basic LLM Usage

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';

const claude = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'You are a helpful assistant.',
});

// Simple generation
const turn = await claude.generate('Hello, world!');
console.log(turn.response.text);
```

### Streaming

```typescript
import { StreamEventType } from '@providerprotocol/ai';

const stream = claude.stream('Tell me a story');

for await (const event of stream) {
  if (event.type === StreamEventType.TextDelta) {
    process.stdout.write(event.delta.text);
  }
}

const turn = await stream.turn;
console.log('Total tokens:', turn.usage.totalTokens);
```

---

## Core Concepts

### Factory Functions

Three main factory functions create instances for each modality:

```typescript
import { llm, embedding, image } from '@providerprotocol/ai';
```

### Provider Functions

Each provider exports a factory function that creates model references:

```typescript
import { anthropic } from '@providerprotocol/ai/anthropic';
import { openai } from '@providerprotocol/ai/openai';
import { google } from '@providerprotocol/ai/google';
import { xai } from '@providerprotocol/ai/xai';
import { groq } from '@providerprotocol/ai/groq';
import { cerebras } from '@providerprotocol/ai/cerebras';
import { ollama } from '@providerprotocol/ai/ollama';
import { openrouter } from '@providerprotocol/ai/openrouter';
import { proxy } from '@providerprotocol/ai/proxy';
```

---

## Per-Library Imports (Subpaths)

The package uses subpath exports to keep bundles small. Import only what you need:

| Import Path | Contents |
|-------------|----------|
| `@providerprotocol/ai` | Core: `llm`, `embedding`, `image`, types, media classes |
| `@providerprotocol/ai/anthropic` | Anthropic provider + types |
| `@providerprotocol/ai/openai` | OpenAI provider + types |
| `@providerprotocol/ai/google` | Google/Gemini provider + types |
| `@providerprotocol/ai/xai` | xAI/Grok provider + types |
| `@providerprotocol/ai/groq` | Groq provider + types |
| `@providerprotocol/ai/cerebras` | Cerebras provider + types |
| `@providerprotocol/ai/ollama` | Ollama provider + types |
| `@providerprotocol/ai/openrouter` | OpenRouter provider + types |
| `@providerprotocol/ai/proxy` | Proxy provider + server adapters |
| `@providerprotocol/ai/responses` | OpenAI Responses API provider |
| `@providerprotocol/ai/http` | HTTP utilities: retry/key strategies |
| `@providerprotocol/ai/middleware/logging` | Logging middleware |
| `@providerprotocol/ai/middleware/parsed-object` | Partial JSON parsing middleware |
| `@providerprotocol/ai/middleware/pubsub` | Stream resumption middleware + adapters |
| `@providerprotocol/ai/middleware/pubsub/server` | Server adapters for all frameworks |
| `@providerprotocol/ai/middleware/pubsub/server/webapi` | Web API adapter (Bun, Deno, Next.js) |
| `@providerprotocol/ai/middleware/pubsub/server/express` | Express adapter |
| `@providerprotocol/ai/middleware/pubsub/server/fastify` | Fastify adapter |
| `@providerprotocol/ai/middleware/pubsub/server/h3` | H3/Nuxt adapter |

### Example: Minimal Import

```typescript
// Only imports Anthropic provider code, not OpenAI, Google, etc.
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
```

### Example: Multiple Providers

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { openai } from '@providerprotocol/ai/openai';
import { google } from '@providerprotocol/ai/google';
```

### Model Reference

Provider functions return a `ModelReference` that's passed to factory functions:

```typescript
const model = anthropic('claude-sonnet-4-20250514', {
  // provider-specific options
});

const instance = llm({ model });
```

---

## LLM Modality

### LLMOptions

```typescript
interface LLMOptions<TParams> {
  model: ModelReference;              // Required: provider model reference
  system?: string | unknown[];        // System prompt
  params?: TParams;                   // Provider-specific parameters
  tools?: Tool[];                     // Available tools
  toolStrategy?: ToolUseStrategy;     // Tool execution configuration
  structure?: JSONSchema;             // Structured output schema
  middleware?: Middleware[];          // Request/response middleware
  config?: Partial<ProviderConfig>;   // Provider configuration overrides
}
```

### Generation Methods

```typescript
const instance = llm({ model: anthropic('claude-sonnet-4-20250514') });

// Simple generation
const turn = await instance.generate('Hello');

// With message history
const turn = await instance.generate([userMessage, assistantMessage], 'Follow-up');

// With Thread
const turn = await instance.generate(thread, 'New message');

// Streaming
const stream = instance.stream('Tell me more');
for await (const event of stream) { /* ... */ }
const turn = await stream.turn;
```

### Turn Object

The result of generation is a `Turn`:

```typescript
interface Turn<TData = unknown> {
  messages: Message[];           // All messages from inference cycle
  response: AssistantMessage;    // Final assistant response
  toolExecutions: ToolExecution[];
  usage: TokenUsage;
  cycles: number;                // Number of inference iterations
  data?: TData;                  // Structured output data (if schema provided)
}
```

### Accessing Response Content

```typescript
const turn = await instance.generate('Hello');

// Text content
console.log(turn.response.text);

// Check for tool calls
if (turn.response.hasToolCalls) {
  console.log(turn.response.toolCalls);
}

// Token usage
console.log(turn.usage.inputTokens, turn.usage.outputTokens);

// Structured data (if schema was provided)
console.log(turn.data);
```

---

## Messages & Content

### Message Types

```typescript
import { UserMessage, AssistantMessage, ToolResultMessage, Thread } from '@providerprotocol/ai';

// Create messages
const userSimple = new UserMessage('Hello');
const userMultimodal = new UserMessage([
  { type: 'text', text: 'Describe this image:' },
  { type: 'image', mimeType: 'image/png', source: { type: 'base64', data: '...' } }
]);

// Type guards
import { isUserMessage, isAssistantMessage, isToolResultMessage } from '@providerprotocol/ai';
```

### Content Blocks

```typescript
import { text, reasoning, isTextBlock, isImageBlock } from '@providerprotocol/ai';

// Content block types
type ContentBlock =
  | TextBlock
  | ReasoningBlock
  | ImageBlock
  | DocumentBlock
  | AudioBlock
  | VideoBlock
  | BinaryBlock;

// Factory functions
const textBlock = text('Hello world');
const reasoningBlock = reasoning('Step 1: ...');
```

### Thread (Conversation History)

```typescript
const thread = new Thread();

// Add messages
thread.user('Hello');
thread.assistant('Hi there!');

// Append turn results
thread.append(turn);

// Iterate
for (const message of thread) {
  console.log(message.type, message.text);
}

// Serialize/deserialize
const json = thread.toJSON();
const restored = Thread.fromJSON(json);
```

---

## Tool Calling

### Define Tools

```typescript
import type { Tool } from '@providerprotocol/ai';

const calculator: Tool<{ a: number; b: number }, string> = {
  name: 'add',
  description: 'Add two numbers together',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'number', description: 'First number' },
      b: { type: 'number', description: 'Second number' },
    },
    required: ['a', 'b'],
  },
  run: async ({ a, b }) => `The sum is ${a + b}`,
};
```

### Use Tools

```typescript
const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  tools: [calculator],
});

const turn = await instance.generate('What is 7 + 15?');
// Tool is automatically called, result is in turn.toolExecutions
console.log(turn.response.text); // Contains "22"
```

### Tool Strategy

```typescript
const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  tools: [myTool],
  toolStrategy: {
    maxIterations: 5,
    onBeforeCall: (tool, params) => {
      console.log(`Calling ${tool.name} with`, params);
      return true; // Return false to skip execution
    },
    onAfterCall: (tool, params, result) => {
      console.log(`Result:`, result);
    },
    onError: (tool, params, error) => {
      console.error(`Tool error:`, error);
    },
  },
});
```

---

## Structured Output

```typescript
const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  structure: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      hobbies: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'age'],
  },
});

const turn = await instance.generate('John is 30 years old and likes hiking and reading');
console.log(turn.data);
// { name: 'John', age: 30, hobbies: ['hiking', 'reading'] }
```

---

## Streaming

### Stream Events

```typescript
import { StreamEventType } from '@providerprotocol/ai';

const stream = instance.stream('Hello');

for await (const event of stream) {
  switch (event.type) {
    case StreamEventType.TextDelta:
      process.stdout.write(event.delta.text);
      break;
    case StreamEventType.ReasoningDelta:
      console.log('Thinking:', event.delta.text);
      break;
    case StreamEventType.ToolCallDelta:
      console.log('Tool call:', event.delta.toolName);
      break;
    case StreamEventType.ToolExecutionStart:
      console.log('Executing tool...');
      break;
    case StreamEventType.ToolExecutionEnd:
      console.log('Tool result:', event.delta.result);
      break;
  }
}

// Always await the turn for final result
const turn = await stream.turn;
```

### Abort Streaming

```typescript
const stream = instance.stream('Write a long essay');

setTimeout(() => stream.abort(), 5000);

try {
  for await (const event of stream) {
    // ...
  }
} catch (error) {
  // Handle abort
}
```

---

## Multimodal Input

### Images

```typescript
import { Image } from '@providerprotocol/ai';

// From file
const img = await Image.fromFile('/path/to/image.png');

// From URL
const img = await Image.fromUrl('https://example.com/image.png');

// From base64
const img = Image.fromBase64(base64Data, 'image/png');

// Use in message
const message = new UserMessage([
  { type: 'text', text: 'What is in this image?' },
  img.toContentBlock(),
]);

const turn = await instance.generate([message]);
```

### Documents (PDFs)

```typescript
import { Document } from '@providerprotocol/ai';

const doc = await Document.fromFile('/path/to/document.pdf');

const message = new UserMessage([
  { type: 'text', text: 'Summarize this document' },
  doc.toContentBlock(),
]);
```

### Audio & Video

```typescript
import { Audio, Video } from '@providerprotocol/ai';

const audio = await Audio.fromFile('/path/to/audio.mp3');
const video = await Video.fromFile('/path/to/video.mp4');
```

---

## Embeddings

```typescript
import { embedding } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const embedder = embedding({
  model: openai('text-embedding-3-small'),
});

// Single embedding
const result = await embedder.embed('Hello world');
console.log(result.embeddings[0].vector);

// Batch embeddings
const result = await embedder.embed(['Hello', 'World', 'Test']);
console.log(result.embeddings.length); // 3

// Chunked processing (for large batches)
const stream = embedder.embed(largeArray, { chunked: true });
for await (const chunk of stream) {
  console.log('Progress:', chunk.progress);
}
```

---

## Image Generation

```typescript
import { image } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const generator = image({
  model: openai('dall-e-3'),
  params: {
    size: '1024x1024',
    quality: 'standard',
  },
});

const result = await generator.generate('A red circle on white background');
console.log(result.images[0].image); // Image object
```

---

## Proxy Provider (Frontend Usage)

The proxy provider enables frontend applications to make AI requests through your backend, keeping API keys secure on the server.

### Architecture

```
Frontend (Browser/App)
    ↓ HTTP
Backend Server (your API)
    ↓
AI Provider (Anthropic, OpenAI, etc.)
```

### Client-Side: Using the Proxy

```typescript
import { llm } from '@providerprotocol/ai';
import { proxy, proxyModel } from '@providerprotocol/ai/proxy';

// Option 1: Create proxy provider with endpoint
const backend = proxy({ endpoint: '/api/ai' });
const instance = llm({
  model: backend('gpt-4o'),  // model name passed to server
  system: 'You are helpful.',
});

// Option 2: Quick shorthand for single model
const instance = llm({
  model: proxyModel('/api/ai'),
});

// Use normally - works identically to direct providers
const turn = await instance.generate('Hello!');

// Streaming works too
import { StreamEventType } from '@providerprotocol/ai';

const stream = instance.stream('Tell me a story');
for await (const event of stream) {
  if (event.type === StreamEventType.TextDelta) {
    process.stdout.write(event.delta.text);
  }
}
```

### Proxy Configuration

```typescript
const backend = proxy({
  endpoint: 'https://api.myapp.com/ai',
  headers: {
    'Authorization': 'Bearer user-token',
  },
  timeout: 30000,
});
```

### Server-Side: Creating the API Endpoint

The proxy module provides server adapters for popular frameworks.

#### Bun / Web API (Next.js App Router, Deno, Cloudflare)

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { parseBody, toJSON, toSSE, toError } from '@providerprotocol/ai/proxy';

Bun.serve({
  port: 3000,
  async fetch(req: Request) {
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/api/ai') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const { messages, system, params } = parseBody(await req.json());

      const instance = llm({
        model: anthropic('claude-sonnet-4-20250514'),
        system,
        params: { max_tokens: 4096, ...params },
      });

      // Check if client wants streaming
      const wantsStream = req.headers.get('accept')?.includes('text/event-stream');

      if (wantsStream) {
        return toSSE(instance.stream(messages));
      }
      return toJSON(await instance.generate(messages));
    } catch (error) {
      return toError(error.message, 400);
    }
  },
});
```

#### Express

```typescript
import express from 'express';
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { parseBody } from '@providerprotocol/ai/proxy';
import { express as expressAdapter } from '@providerprotocol/ai/proxy';

const app = express();
app.use(express.json());

app.post('/api/ai', async (req, res) => {
  const { messages, system, params } = parseBody(req.body);

  const instance = llm({
    model: anthropic('claude-sonnet-4-20250514'),
    system,
  });

  if (req.headers.accept?.includes('text/event-stream')) {
    expressAdapter.streamSSE(instance.stream(messages), res);
  } else {
    const turn = await instance.generate(messages);
    expressAdapter.sendJSON(turn, res);
  }
});
```

#### Fastify

```typescript
import Fastify from 'fastify';
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { parseBody } from '@providerprotocol/ai/proxy';
import { fastify as fastifyAdapter } from '@providerprotocol/ai/proxy';

const app = Fastify();

app.post('/api/ai', async (request, reply) => {
  const { messages, system } = parseBody(request.body);

  const instance = llm({
    model: anthropic('claude-sonnet-4-20250514'),
    system,
  });

  if (request.headers.accept?.includes('text/event-stream')) {
    return fastifyAdapter.streamSSE(instance.stream(messages), reply);
  }
  return fastifyAdapter.sendJSON(await instance.generate(messages), reply);
});
```

#### Nuxt / H3

```typescript
// server/api/ai.post.ts
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { parseBody } from '@providerprotocol/ai/proxy';
import { h3 as h3Adapter } from '@providerprotocol/ai/proxy';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { messages, system } = parseBody(body);

  const instance = llm({
    model: anthropic('claude-sonnet-4-20250514'),
    system,
  });

  const wantsStream = getHeader(event, 'accept')?.includes('text/event-stream');

  if (wantsStream) {
    return h3Adapter.streamSSE(instance.stream(messages), event);
  }
  return h3Adapter.sendJSON(await instance.generate(messages), event);
});
```

### Server-Side: Tool Binding

When the client sends tool schemas, bind them to server-side implementations:

```typescript
import { parseBody, bindTools } from '@providerprotocol/ai/proxy';

app.post('/api/ai', async (req, res) => {
  const { messages, system, tools: schemas } = parseBody(req.body);

  // Bind schemas to actual implementations
  const tools = bindTools(schemas, {
    get_weather: async ({ location }) => fetchWeatherAPI(location),
    search: async ({ query }) => searchDatabase(query),
  });

  const instance = llm({
    model: anthropic('claude-sonnet-4-20250514'),
    system,
    tools,
  });

  // ... handle request
});
```

### Server Utilities Reference

```typescript
import {
  // Request parsing
  parseBody,           // LLM requests
  parseEmbeddingBody,  // Embedding requests
  parseImageBody,      // Image generation requests

  // Response formatting
  toJSON,              // LLM completion → Response
  toSSE,               // LLM stream → SSE Response
  toEmbeddingJSON,     // Embedding result → Response
  toImageJSON,         // Image result → Response
  toError,             // Error → Response

  // Tool binding
  bindTools,           // Bind tool schemas to implementations
} from '@providerprotocol/ai/proxy';
```

### React Frontend Example

```typescript
// hooks/useAI.ts
import { llm, UserMessage, StreamEventType } from '@providerprotocol/ai';
import { proxy } from '@providerprotocol/ai/proxy';

const backend = proxy({
  endpoint: '/api/ai',
  headers: { 'Authorization': `Bearer ${getAuthToken()}` }
});

export function useAI() {
  const instance = llm({ model: backend('default') });

  async function* streamResponse(input: string) {
    const stream = instance.stream(new UserMessage(input));

    for await (const event of stream) {
      if (event.type === StreamEventType.TextDelta) {
        yield event.delta.text;
      }
    }

    return await stream.turn;
  }

  return { streamResponse };
}

// Component usage
function Chat() {
  const { streamResponse } = useAI();
  const [response, setResponse] = useState('');

  const handleSubmit = async (input: string) => {
    let text = '';
    for await (const chunk of streamResponse(input)) {
      text += chunk;
      setResponse(text);
    }
  };

  return <div>{response}</div>;
}
```

---

## Provider Configuration

### API Keys

```typescript
// Environment variable (automatic)
// Set ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.

// Explicit key
const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  config: {
    apiKey: 'sk-...',
  },
});

// Key rotation strategies
import { RoundRobinKeys, WeightedKeys, DynamicKey } from '@providerprotocol/ai/http';

// Round-robin through multiple keys
const instance = llm({
  model: openai('gpt-4o'),
  config: {
    apiKey: new RoundRobinKeys(['key1', 'key2', 'key3']),
  },
});

// Weighted key selection (higher weight = more likely)
const instance2 = llm({
  model: openai('gpt-4o'),
  config: {
    apiKey: new WeightedKeys([
      { key: 'primary-key', weight: 3 },
      { key: 'backup-key', weight: 1 },
    ]),
  },
});

// Dynamic key from async source
const instance3 = llm({
  model: openai('gpt-4o'),
  config: {
    apiKey: new DynamicKey(async () => await fetchKeyFromVault()),
  },
});
```

### Retry Strategies

```typescript
import { ExponentialBackoff, LinearBackoff, RetryAfterStrategy } from '@providerprotocol/ai/http';

const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  config: {
    retryStrategy: new ExponentialBackoff({
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
    }),
  },
});

// Or use LinearBackoff for fixed delays
const instance2 = llm({
  model: openai('gpt-4o'),
  config: {
    retryStrategy: new LinearBackoff({ maxAttempts: 3, delay: 1000 }),
  },
});
```

### Custom Base URL

```typescript
const instance = llm({
  model: openai('gpt-4o'),
  config: {
    baseUrl: 'https://your-proxy.com/v1',
  },
});
```

---

## Middleware

Middleware is imported from dedicated subpath exports, not the main entry point.

### Logging Middleware

```typescript
import { loggingMiddleware } from '@providerprotocol/ai/middleware/logging';

const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  middleware: [
    loggingMiddleware({
      level: 'debug',  // 'debug' | 'info' | 'warn' | 'error'
      onLog: (level, message, data) => {
        // Custom log handler (optional)
        console.log(`[${level}] ${message}`, data);
      },
    }),
  ],
});
```

### Parsed Object Middleware

Parses partial JSON during streaming for structured output.

```typescript
import { parsedObjectMiddleware } from '@providerprotocol/ai/middleware/parsed-object';

// Without middleware: object_delta events have delta.text (raw JSON string)
// With middleware: object_delta events also have delta.parsed (parsed partial object)
const structuredInstance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  structure: { type: 'object', properties: { items: { type: 'array' } } },
  middleware: [parsedObjectMiddleware()],
});

const stream = structuredInstance.stream('List 5 items');
for await (const event of stream) {
  if (event.type === StreamEventType.ObjectDelta) {
    // delta.text is always available (raw JSON chunk)
    // delta.parsed is available when using parsedObjectMiddleware
    console.log('Partial:', event.delta.parsed);
  }
}
```

### Pub/Sub Middleware (Stream Resumption)

Enables clients to reconnect and catch up on missed events during active generation.

```typescript
import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';

// Create a shared adapter instance (singleton per process)
const adapter = memoryAdapter({ maxStreams: 500 });

const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  middleware: [
    pubsubMiddleware({
      adapter,
      streamId: 'unique-stream-id',  // Client-provided ID for reconnection
      ttl: 600_000,  // 10 minutes (default)
    }),
  ],
});
```

#### Server-Side: Handling Reconnections

The middleware buffers events and the server routes handle reconnection logic.

**Web API (Bun, Deno, Next.js App Router, Cloudflare Workers):**

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';
import { createSubscriberStream } from '@providerprotocol/ai/middleware/pubsub/server/webapi';

const adapter = memoryAdapter();

Bun.serve({
  port: 3000,
  async fetch(req: Request) {
    if (req.method !== 'POST') return new Response('Not found', { status: 404 });

    const { messages, streamId } = await req.json();
    const exists = await adapter.exists(streamId);

    if (!exists) {
      // Start background generation (fire and forget)
      const model = llm({
        model: anthropic('claude-sonnet-4-20250514'),
        middleware: [pubsubMiddleware({ adapter, streamId })],
      });
      // Consume stream in background - don't await
      (async () => {
        for await (const _ of model.stream(messages)) { /* events buffered by middleware */ }
      })();
    }

    // Both new requests and reconnects: subscribe to buffered + live events
    return new Response(createSubscriberStream(streamId, adapter), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  },
});
```

**Express:**

```typescript
import { express } from '@providerprotocol/ai/middleware/pubsub/server/express';

app.post('/api/ai', async (req, res) => {
  const { streamId } = req.body;
  express.streamSubscriber(streamId, adapter, res);
});
```

**Fastify:**

```typescript
import { fastify } from '@providerprotocol/ai/middleware/pubsub/server/fastify';

app.post('/api/ai', (request, reply) => {
  const { streamId } = request.body;
  return fastify.streamSubscriber(streamId, adapter, reply);
});
```

**H3/Nuxt:**

```typescript
import { h3 } from '@providerprotocol/ai/middleware/pubsub/server/h3';

export default defineEventHandler(async (event) => {
  const { streamId } = await readBody(event);
  return h3.streamSubscriber(streamId, adapter, event);
});
```

#### Custom Storage Adapters

Implement `PubSubAdapter` for custom backends (Redis, etc.):

```typescript
import type { PubSubAdapter } from '@providerprotocol/ai/middleware/pubsub';

const redisAdapter: PubSubAdapter = {
  async exists(streamId) { /* check Redis */ },
  async create(streamId, metadata) { /* store in Redis */ },
  async append(streamId, event) { /* append event */ },
  async markCompleted(streamId) { /* mark done */ },
  async isCompleted(streamId) { /* check completion */ },
  async getEvents(streamId) { /* fetch all events */ },
  async getStream(streamId) { /* get metadata */ },
  subscribe(streamId, callback) { /* Redis pub/sub */ },
  publish(streamId, event) { /* broadcast event */ },
  async remove(streamId) { /* cleanup */ },
  async cleanup(maxAge) { /* remove old streams */ },
};
```

### Custom Middleware

```typescript
import type { Middleware } from '@providerprotocol/ai';

const myMiddleware: Middleware = {
  name: 'my-middleware',

  onStart(ctx) {
    console.log('Starting request to', ctx.modelId);
  },

  onEnd(ctx) {
    const duration = ctx.endTime ? ctx.endTime - ctx.startTime : 0;
    console.log('Request completed in', duration, 'ms');
  },

  onStreamEvent(event, ctx) {
    // Transform or filter stream events
    return event;
  },
};
```

---

## Error Handling

```typescript
import { UPPError, ErrorCode } from '@providerprotocol/ai';

try {
  const turn = await instance.generate('Hello');
} catch (error) {
  if (error instanceof UPPError) {
    switch (error.code) {
      case ErrorCode.RateLimited:
        console.log('Rate limited, retry after delay');
        break;
      case ErrorCode.AuthenticationFailed:
        console.log('Invalid API key');
        break;
      case ErrorCode.ContextLengthExceeded:
        console.log('Message too long');
        break;
      case ErrorCode.ContentFiltered:
        console.log('Content was filtered');
        break;
      default:
        console.log('Provider error:', error.message);
    }
  }
}
```

---

## Provider-Specific Options

### Anthropic

```typescript
import { anthropic, betas } from '@providerprotocol/ai/anthropic';
import type { AnthropicLLMParams } from '@providerprotocol/ai/anthropic';

const instance = llm<AnthropicLLMParams>({
  model: anthropic('claude-sonnet-4-20250514', {
    betas: [betas.computerUse, betas.tokenCounting],
  }),
  params: {
    max_tokens: 4096,
    temperature: 0.7,
  },
});
```

### OpenAI

```typescript
import { openai } from '@providerprotocol/ai/openai';
import type {
  OpenAICompletionsParams,
  OpenAIResponsesParams
} from '@providerprotocol/ai/openai';

// Responses API (default, stateful, supports web search tools)
const instance = llm<OpenAIResponsesParams>({
  model: openai('gpt-4o'),
  params: {
    temperature: 0.7,
    max_output_tokens: 1000,
  },
});

// Chat Completions API (explicit)
const completionsInstance = llm<OpenAICompletionsParams>({
  model: openai('gpt-4o', { api: 'completions' }),
  params: {
    temperature: 0.7,
    max_tokens: 1000,
    frequency_penalty: 0.5,
  },
});
```

### Google

```typescript
import { google } from '@providerprotocol/ai/google';
import type { GoogleLLMParams } from '@providerprotocol/ai/google';

const instance = llm<GoogleLLMParams>({
  model: google('gemini-2.0-flash'),
  params: {
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
});
```

### Groq

```typescript
import { groq } from '@providerprotocol/ai/groq';
import type { GroqLLMParams } from '@providerprotocol/ai/groq';

const instance = llm<GroqLLMParams>({
  model: groq('llama-3.3-70b-versatile'),
  params: {
    max_tokens: 4096,
    temperature: 0.7,
    // Reasoning support for compatible models
    reasoning_effort: 'high',
    reasoning_format: 'parsed',
    // Web search for search-enabled models
    search_settings: { mode: 'auto' },
  },
});
```

### Cerebras

```typescript
import { cerebras } from '@providerprotocol/ai/cerebras';
import type { CerebrasLLMParams } from '@providerprotocol/ai/cerebras';

const instance = llm<CerebrasLLMParams>({
  model: cerebras('llama-3.3-70b'),
  params: {
    max_completion_tokens: 4096,
    temperature: 0.7,
  },
});

// With reasoning (gpt-oss-120b model)
const reasoning = llm<CerebrasLLMParams>({
  model: cerebras('gpt-oss-120b'),
  params: {
    reasoning_effort: 'high',
    reasoning_format: 'parsed',
  },
});
```

---

## Provider Capability Matrix

| Provider | LLM | Embed | Image | Streaming | Tools | Structured | Vision | Documents |
|----------|:---:|:-----:|:-----:|:---------:|:-----:|:----------:|:------:|:---------:|
| Anthropic | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| OpenAI | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Google | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| xAI | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Groq | ✓ | | | ✓ | ✓ | ✓ | ✓ | |
| Cerebras | ✓ | | | ✓ | ✓ | ✓ | | |
| Ollama | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | |
| OpenRouter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Proxy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

*Proxy capabilities depend on your backend implementation.*

---

## Environment Variables

API keys are automatically loaded from environment variables:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
XAI_API_KEY=...
GROQ_API_KEY=gsk_...
CEREBRAS_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
# Ollama doesn't require an API key
```

---

## TypeScript Tips

### Generic Parameters

Provider-specific parameters are typed via generics:

```typescript
import type { AnthropicLLMParams } from '@providerprotocol/ai/anthropic';

const instance = llm<AnthropicLLMParams>({
  model: anthropic('claude-sonnet-4-20250514'),
  params: {
    max_tokens: 4096,  // TypeScript knows this is valid
  },
});
```

### Type Guards

```typescript
import {
  isUserMessage,
  isAssistantMessage,
  isTextBlock,
  isImageBlock
} from '@providerprotocol/ai';

for (const message of thread) {
  if (isAssistantMessage(message)) {
    for (const block of message.content) {
      if (isTextBlock(block)) {
        console.log(block.text);
      }
    }
  }
}
```

---

## Common Patterns

### Multi-turn Conversation

```typescript
const thread = new Thread();
const instance = llm({ model: anthropic('claude-sonnet-4-20250514') });

// First turn
const turn1 = await instance.generate(thread, 'Hello, my name is Alice');
thread.append(turn1);

// Second turn (has context of first)
const turn2 = await instance.generate(thread, 'What is my name?');
thread.append(turn2);

console.log(turn2.response.text); // References "Alice"
```

### Agentic Tool Loop

```typescript
const tools = [searchTool, calculatorTool, weatherTool];

const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  tools,
  toolStrategy: {
    maxIterations: 10,
  },
});

// Model will automatically call tools as needed
const turn = await instance.generate('Search for the weather in NYC and convert 72F to Celsius');

// All tool executions are recorded
for (const exec of turn.toolExecutions) {
  console.log(`${exec.toolName}: ${JSON.stringify(exec.result)}`);
}
```

### Streaming with Structured Output

```typescript
import { parsedObjectMiddleware } from '@providerprotocol/ai/middleware/parsed-object';

const instance = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  structure: { type: 'object', properties: { items: { type: 'array' } } },
  middleware: [parsedObjectMiddleware()],
});

const stream = instance.stream('List 5 fruits');

for await (const event of stream) {
  if (event.type === StreamEventType.ObjectDelta) {
    console.log('Partial:', event.delta.parsed);
  }
}

const turn = await stream.turn;
console.log('Final:', turn.data);
```

---

## Important Notes

1. **ESM Only**: This package is ESM-only. Use `"type": "module"` in package.json.

2. **Bun Preferred**: Designed for Bun runtime. Works with Node.js but Bun is recommended.

3. **No Dependencies**: Zero production dependencies for minimal footprint.

4. **Provider Isolation**: Each provider is a separate module with no cross-provider code.

5. **Type Safety**: 100% TypeScript with strict mode. No `any` types.

6. **Stream Completion**: Always `await stream.turn` after iterating to ensure completion.

7. **Tool Approval**: Tools can have an `approval` function for human-in-the-loop workflows.
