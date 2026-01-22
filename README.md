# @providerprotocol/ai

A unified TypeScript SDK for AI inference across multiple providers. One API for LLMs, embeddings, and image generation.

```bash
bun add @providerprotocol/ai
```

## Quick Start

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';

const claude = llm({ model: anthropic('claude-sonnet-4-20250514') });
const turn = await claude.generate('Hello!');
console.log(turn.response.text);
```

## Providers

| Provider | Import | LLM | Embedding | Image |
|----------|--------|:---:|:---------:|:-----:|
| Anthropic | `@providerprotocol/ai/anthropic` | ✓ | | |
| OpenAI | `@providerprotocol/ai/openai` | ✓ | ✓ | ✓ |
| Google | `@providerprotocol/ai/google` | ✓ | ✓ | ✓ |
| xAI | `@providerprotocol/ai/xai` | ✓ | | ✓ |
| Ollama | `@providerprotocol/ai/ollama` | ✓ | ✓ | |
| OpenRouter | `@providerprotocol/ai/openrouter` | ✓ | ✓ | ✓ |
| Groq | `@providerprotocol/ai/groq` | ✓ | | |
| Cerebras | `@providerprotocol/ai/cerebras` | ✓ | | |
| OpenResponses | `@providerprotocol/ai/responses` | ✓ | | |

API keys are loaded automatically from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, etc.).

## LLM

### Streaming

```typescript
const stream = claude.stream('Count to 5');
for await (const event of stream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
const turn = await stream.turn;
```

**Stream Control:**

```typescript
const stream = claude.stream('Write a long story');

// Abort the stream at any time
setTimeout(() => stream.abort(), 5000);

for await (const event of stream) {
  // Process events until abort
}
```

**Stream Events:**

| Event | Description |
|-------|-------------|
| `text_delta` | Incremental text output |
| `reasoning_delta` | Incremental reasoning/thinking output |
| `object_delta` | Incremental structured output JSON |
| `tool_call_delta` | Tool call arguments being streamed |
| `tool_execution_start` | Tool execution has started |
| `tool_execution_end` | Tool execution has completed |
| `message_start` / `message_stop` | Message boundaries |
| `content_block_start` / `content_block_stop` | Content block boundaries |

### Multi-turn Conversations

```typescript
const history: Message[] = [];

const t1 = await claude.generate(history, 'My name is Alice');
history.push(...t1.messages);

const t2 = await claude.generate(history, 'What is my name?');
// Response: "Your name is Alice"
```

### Tools

```typescript
const turn = await claude.generate({
  tools: [{
    name: 'getWeather',
    description: 'Get weather for a location',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
    },
    run: async ({ location }) => ({ temp: 72, conditions: 'sunny' }),
  }],
}, 'What is the weather in Tokyo?');
```

### Structured Output

```typescript
import { llm } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const extractor = llm({
  model: openai('gpt-4o'),
  structure: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    required: ['name', 'age'],
  },
});

const turn = await extractor.generate('John is 30 years old');
console.log(turn.data); // { name: 'John', age: 30 }
```

### Multimodal Input

```typescript
import { Image, Document, Audio, Video } from '@providerprotocol/ai';

// Images
const img = await Image.fromPath('./photo.png');
const turn = await claude.generate([img, 'What is in this image?']);

// Documents (PDF, text)
const doc = await Document.fromPath('./report.pdf', 'Annual Report');
const docTurn = await claude.generate([doc.toBlock(), 'Summarize this document']);

// Audio (Google, OpenRouter)
const audio = await Audio.fromPath('./recording.mp3');
const audioTurn = await gemini.generate([audio.toBlock(), 'Transcribe this audio']);

// Video (Google, OpenRouter)
const video = await Video.fromPath('./clip.mp4');
const videoTurn = await gemini.generate([video.toBlock(), 'Describe this video']);
```

**Multimodal Support by Provider:**

| Provider | Image | Document | Audio | Video |
|----------|:-----:|:--------:|:-----:|:-----:|
| Anthropic | ✓ | PDF, Text | | |
| OpenAI | ✓ | PDF, Text | | |
| Google | ✓ | PDF, Text | ✓ | ✓ |
| OpenRouter | ✓ | PDF, Text | ✓ | ✓ |
| xAI | ✓ | | | |
| Groq | ✓ | | | |

## Anthropic Beta Features

Anthropic provides beta features through the `betas` export. Enable them at the model level:

```typescript
import { anthropic, betas } from '@providerprotocol/ai/anthropic';
import { llm } from '@providerprotocol/ai';

// Native structured outputs with guaranteed JSON schema conformance
const model = llm({
  model: anthropic('claude-sonnet-4-20250514', {
    betas: [betas.structuredOutputs],
  }),
  structure: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
  },
});

// Extended thinking with interleaved tool calls
const thinker = llm({
  model: anthropic('claude-sonnet-4-20250514', {
    betas: [betas.interleavedThinking],
  }),
  params: {
    thinking: { type: 'enabled', budget_tokens: 10000 },
  },
});
```

**Available Beta Features:**

| Beta | Description |
|------|-------------|
| `structuredOutputs` | Guaranteed JSON schema conformance for responses |
| `interleavedThinking` | Claude can think between tool calls |
| `devFullThinking` | Developer mode for full thinking visibility |
| `effort` | Control response thoroughness vs efficiency (Opus 4.5) |
| `computerUseLegacy` | Computer use for Claude 3.x models |
| `computerUse` | Mouse, keyboard, screenshot control (Claude 4) |
| `computerUseOpus` | Computer use with extra commands (Opus 4.5) |
| `codeExecution` | Python/Bash sandbox execution |
| `tokenEfficientTools` | Up to 70% token reduction for tool calls |
| `fineGrainedToolStreaming` | Stream tool args without buffering |
| `maxTokens35Sonnet` | 8,192 output tokens for Claude 3.5 Sonnet |
| `output128k` | 128K token output length |
| `context1m` | 1 million token context window (Sonnet 4) |
| `promptCaching` | Reduced latency and costs via caching |
| `extendedCacheTtl` | 1-hour cache TTL (vs 5-minute default) |
| `contextManagement` | Automatic tool call clearing for context |
| `modelContextWindowExceeded` | Handle exceeded context windows |
| `advancedToolUse` | Tool Search, Programmatic Tool Calling |
| `mcpClient` | Connect to remote MCP servers |
| `mcpClientLatest` | Updated MCP client |
| `filesApi` | Upload and manage files |
| `pdfs` | PDF document support |
| `tokenCounting` | Token counting endpoint |
| `messageBatches` | Async batch processing at 50% cost |
| `skills` | Agent Skills (PowerPoint, Excel, Word, PDF) |

## Anthropic Built-in Tools

Use Anthropic's built-in tools directly with the `tools` export:

```typescript
import { anthropic, betas, tools } from '@providerprotocol/ai/anthropic';
import { llm } from '@providerprotocol/ai';

// Web search with optional user location
const model = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  params: {
    tools: [tools.webSearch({ max_results: 5 })],
  },
});

// Computer use (requires beta)
const computerModel = llm({
  model: anthropic('claude-sonnet-4-20250514', {
    betas: [betas.computerUse],
  }),
  params: {
    tools: [tools.computer({ display_width: 1920, display_height: 1080, display_number: 1 })],
  },
});

// Code execution (requires beta)
const codeModel = llm({
  model: anthropic('claude-sonnet-4-20250514', {
    betas: [betas.codeExecution],
  }),
  params: {
    tools: [tools.codeExecution()],
  },
});
```

**Available Built-in Tools:**

| Tool | Description |
|------|-------------|
| `tools.webSearch()` | Search the web with optional max results and location |
| `tools.computer()` | Mouse, keyboard, and screenshot control |
| `tools.textEditor()` | Edit text files programmatically |
| `tools.bash()` | Execute bash commands |
| `tools.codeExecution()` | Run code in a sandboxed environment |
| `tools.toolSearch()` | Search through available tools |

## Reasoning / Extended Thinking

Access model reasoning and extended thinking across providers with a unified API.

### Anthropic

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';

const claude = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  params: {
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 5000,
    },
  },
});

const turn = await claude.generate('Solve this complex problem...');
console.log(turn.response.reasoning); // Reasoning blocks
```

### OpenAI

```typescript
import { llm } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const gpt = llm({
  model: openai('o3-mini'),
  params: {
    max_output_tokens: 4000,
    reasoning: {
      effort: 'medium',
      summary: 'detailed',
    },
  },
});
```

### Google Gemini

```typescript
import { llm } from '@providerprotocol/ai';
import { google } from '@providerprotocol/ai/google';

const gemini = llm({
  model: google('gemini-2.5-flash'),
  params: {
    maxOutputTokens: 4000,
    thinkingConfig: {
      thinkingBudget: -1, // Dynamic
      includeThoughts: true,
    },
  },
});
```

### Cerebras

```typescript
import { llm } from '@providerprotocol/ai';
import { cerebras } from '@providerprotocol/ai/cerebras';

const model = llm({
  model: cerebras('gpt-oss-120b'),
  params: {
    reasoning_effort: 'high',
    reasoning_format: 'parsed',
  },
});
```

### Streaming Reasoning

All providers emit `ReasoningDelta` events during streaming:

```typescript
for await (const event of stream) {
  if (event.type === 'reasoning_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

## Embeddings

```typescript
import { embedding } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const embedder = embedding({ model: openai('text-embedding-3-small') });

// Single or batch
const result = await embedder.embed('Hello world');
const batch = await embedder.embed(['doc1', 'doc2', 'doc3']);

console.log(result.embeddings[0].vector);     // [0.123, -0.456, ...]
console.log(result.embeddings[0].dimensions); // 1536
```

### Chunked Processing

For large datasets with progress tracking:

```typescript
const stream = embedder.embed(documents, {
  chunked: true,
  batchSize: 100,
  concurrency: 2,
});

for await (const progress of stream) {
  console.log(`${progress.percent.toFixed(1)}% complete`);
}

const result = await stream.result;
```

## Image Generation

```typescript
import { image } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const dalle = image({ model: openai('dall-e-3') });
const result = await dalle.generate('A sunset over mountains');

console.log(result.images[0].image.toBase64());
```

### With Parameters

```typescript
const hd = image({
  model: openai('dall-e-3'),
  params: { size: '1792x1024', quality: 'hd', style: 'natural' },
});
```

### Image Editing

```typescript
import { image, Image } from '@providerprotocol/ai';

const editor = image({ model: openai('dall-e-2') });

const source = await Image.fromPath('./photo.png');
const mask = await Image.fromPath('./mask.png');

const result = await editor.edit({
  image: source,
  mask,
  prompt: 'Add a rainbow in the sky',
});
```

## Configuration

```typescript
import { llm } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';
import { ExponentialBackoff, RoundRobinKeys } from '@providerprotocol/ai/http';

const instance = llm({
  model: openai('gpt-4o'),
  config: {
    apiKey: new RoundRobinKeys(['sk-key1', 'sk-key2']),
    timeout: 30000,
    retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
  },
  params: {
    temperature: 0.7,
    max_tokens: 1000,
  },
  system: 'You are a helpful assistant.',
});
```

### System Prompts

System prompts can be a simple string or a provider-specific array for advanced features:

```typescript
// Simple string (all providers)
const simple = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'You are a helpful assistant.',
});

// Anthropic cache_control format
import { anthropic, betas } from '@providerprotocol/ai/anthropic';

const cached = llm({
  model: anthropic('claude-sonnet-4-20250514', {
    betas: [betas.promptCaching],
  }),
  system: [
    { type: 'text', text: 'Large context document...', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'Instructions...' },
  ],
});
```

### Provider Config Options

```typescript
interface ProviderConfig {
  apiKey?: string | (() => Promise<string>) | KeyStrategy; // API key, async getter, or strategy
  baseUrl?: string;                 // Custom API endpoint
  timeout?: number;                 // Per-attempt timeout (ms)
  retryStrategy?: RetryStrategy;    // Retry behavior
  headers?: Record<string, string>; // Custom headers (merged with provider defaults)
  fetch?: typeof fetch;             // Custom fetch implementation
  apiVersion?: string;              // API version override
  retryAfterMaxSeconds?: number;    // Cap for Retry-After header (default: 3600)
}
```

**Notes:**
- `timeout` applies per attempt; total time can exceed this with retries
- `headers` are merged with model-level headers (explicit config takes precedence)
- `retryAfterMaxSeconds` prevents honoring excessively long Retry-After values

### Key Strategies

```typescript
import { RoundRobinKeys, WeightedKeys, DynamicKey } from '@providerprotocol/ai/http';

// Cycle through keys evenly
new RoundRobinKeys(['sk-1', 'sk-2', 'sk-3'])

// Weighted selection (70% key1, 30% key2)
new WeightedKeys([
  { key: 'sk-1', weight: 70 },
  { key: 'sk-2', weight: 30 },
])

// Dynamic fetching (secrets manager, etc.)
new DynamicKey(async () => fetchKeyFromVault())
```

### Retry Strategies

```typescript
import {
  ExponentialBackoff,
  LinearBackoff,
  NoRetry,
  TokenBucket,
  RetryAfterStrategy,
} from '@providerprotocol/ai/http';

// Exponential: 1s, 2s, 4s...
new ExponentialBackoff({
  maxAttempts: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,  // Randomize delays to prevent thundering herd (default: true)
})

// Linear: 1s, 2s, 3s...
new LinearBackoff({ maxAttempts: 3, delay: 1000 })

// Rate limiting with token bucket
new TokenBucket({ maxTokens: 10, refillRate: 1 })

// Respect server Retry-After headers
new RetryAfterStrategy({ maxAttempts: 3, fallbackDelay: 5000 })

// No retries
new NoRetry()
```

**Retryable Errors:** `RATE_LIMITED`, `NETWORK_ERROR`, `TIMEOUT`, `PROVIDER_ERROR`

## Tool Execution Control

```typescript
const turn = await claude.generate({
  tools: [weatherTool, searchTool],
  toolStrategy: {
    maxIterations: 5,
    onBeforeCall: (tool, params) => {
      if (tool.name === 'dangerousTool') return false; // Block execution
      return true;
    },
    onAfterCall: (tool, params, result) => {
      console.log(`${tool.name} returned:`, result);
    },
    onError: (tool, params, error) => {
      console.error(`${tool.name} failed:`, error);
    },
  },
}, 'Search for recent news about AI');
```

## Thread Management

```typescript
import { Thread } from '@providerprotocol/ai';

const thread = new Thread();

thread.user('Hello!');
const turn = await claude.generate(thread.toMessages(), 'How are you?');
thread.append(turn);

// Serialize for storage
const json = thread.toJSON();
localStorage.setItem('conversation', JSON.stringify(json));

// Restore later
const restored = Thread.fromJSON(JSON.parse(localStorage.getItem('conversation')));
```

## Middleware

Compose request/response/stream transformations with the middleware system. Middleware is imported from dedicated entry points.

### Parsed Object Middleware

Automatically parse streaming JSON from structured output and tool call events:

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { parsedObjectMiddleware } from '@providerprotocol/ai/middleware/parsed-object';

const model = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  structure: {
    type: 'object',
    properties: {
      city: { type: 'string' },
      country: { type: 'string' },
      population: { type: 'number' },
    },
    required: ['city', 'country', 'population'],
  },
  middleware: [parsedObjectMiddleware()],
});

for await (const event of model.stream('What is the capital of France?')) {
  if (event.type === 'object_delta') {
    // Access incrementally parsed structured data
    console.log(event.delta.parsed);
    // { city: "Par" } -> { city: "Paris" } -> { city: "Paris", country: "Fr" } -> ...
  }
}
```

### Logging Middleware

Add visibility into request lifecycle:

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { loggingMiddleware } from '@providerprotocol/ai/middleware/logging';

const model = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  middleware: [loggingMiddleware({ level: 'debug' })],
});

// Logs: [PP] [anthropic] Starting llm request (streaming)
// Logs: [PP] [anthropic] Completed in 1234ms
const result = await model.generate('Hello');
```

### Pub-Sub Middleware (Stream Resumption)

Enable reconnecting clients to catch up on missed events during active generation. The middleware buffers events and publishes them to subscribers.

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { pubsubMiddleware, memoryAdapter } from '@providerprotocol/ai/middleware/pubsub';
import { webapi } from '@providerprotocol/ai/middleware/pubsub/server';

// Create a shared adapter instance
const adapter = memoryAdapter({ maxStreams: 1000 });

// Server route handling both new requests and reconnections
Bun.serve({
  port: 3000,
  async fetch(req) {
    const { messages, streamId } = await req.json();
    const exists = await adapter.exists(streamId);

    if (!exists) {
      // Start background generation (fire and forget)
      const model = llm({
        model: anthropic('claude-sonnet-4-20250514'),
        middleware: [pubsubMiddleware({ adapter, streamId })],
      });
      consumeInBackground(model.stream(messages));
    }

    // Both new and reconnect: subscribe to events
    return new Response(webapi.createSubscriberStream(streamId, adapter), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  },
});
```

**Framework Adapters:**

```typescript
// Express
import { express } from '@providerprotocol/ai/middleware/pubsub/server';
app.post('/api/ai/reconnect', (req, res) => {
  const { streamId } = req.body;
  express.streamSubscriber(streamId, adapter, res);
});

// Fastify
import { fastify } from '@providerprotocol/ai/middleware/pubsub/server';
app.post('/api/ai/reconnect', (request, reply) => {
  const { streamId } = request.body;
  return fastify.streamSubscriber(streamId, adapter, reply);
});

// H3/Nuxt
import { h3 } from '@providerprotocol/ai/middleware/pubsub/server';
export default defineEventHandler(async (event) => {
  const { streamId } = await readBody(event);
  return h3.streamSubscriber(streamId, adapter, event);
});
```

**Custom Adapters:**

Implement `PubSubAdapter` for custom backends (Redis, etc.):

```typescript
import type { PubSubAdapter } from '@providerprotocol/ai/middleware/pubsub';

const redisAdapter: PubSubAdapter = {
  async exists(streamId) { /* ... */ },
  async create(streamId, metadata) { /* ... */ },
  async append(streamId, event) { /* ... */ },
  async markCompleted(streamId) { /* ... */ },
  async isCompleted(streamId) { /* ... */ },
  async getEvents(streamId) { /* ... */ },
  async getStream(streamId) { /* ... */ },
  subscribe(streamId, callback) { /* ... */ },
  publish(streamId, event) { /* ... */ },
  async remove(streamId) { /* ... */ },
  async cleanup(maxAge) { /* ... */ },
};
```

### Combining Middleware

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { loggingMiddleware } from '@providerprotocol/ai/middleware/logging';
import { parsedObjectMiddleware } from '@providerprotocol/ai/middleware/parsed-object';

const model = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  structure: mySchema,
  middleware: [
    loggingMiddleware({ level: 'info' }),
    parsedObjectMiddleware(),
  ],
});
```

## Error Handling

All errors are normalized to `UPPError` with consistent error codes:

```typescript
import { UPPError } from '@providerprotocol/ai';

try {
  await claude.generate('Hello');
} catch (error) {
  if (error instanceof UPPError) {
    console.log(error.code);       // 'RATE_LIMITED'
    console.log(error.provider);   // 'anthropic'
    console.log(error.modality);   // 'llm'
    console.log(error.statusCode); // 429
    console.log(error.cause);      // Original error (if any)

    switch (error.code) {
      case 'RATE_LIMITED':
        // Wait and retry
        break;
      case 'CONTEXT_LENGTH_EXCEEDED':
        // Reduce input size
        break;
      case 'AUTHENTICATION_FAILED':
        // Check API key
        break;
      case 'CONTENT_FILTERED':
        // Content policy violation
        break;
    }
  }
}
```

**Error Codes:** `AUTHENTICATION_FAILED`, `RATE_LIMITED`, `CONTEXT_LENGTH_EXCEEDED`, `MODEL_NOT_FOUND`, `INVALID_REQUEST`, `INVALID_RESPONSE`, `CONTENT_FILTERED`, `QUOTA_EXCEEDED`, `PROVIDER_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `CANCELLED`

## API Gateway / Proxy

Build AI API gateways with your own authentication. Users authenticate with your platform - AI provider keys stay hidden on the server.

> **Security Note:** The proxy works without any configuration, but this means **no authentication by default**. Always add your own auth layer in production - the examples below show how.

### Server (Bun/Deno/Cloudflare Workers)

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { ExponentialBackoff, RoundRobinKeys } from '@providerprotocol/ai/http';
import { parseBody, toJSON, toSSE, toError } from '@providerprotocol/ai/proxy';

// Server manages AI provider keys - users never see them
const claude = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  config: {
    apiKey: new RoundRobinKeys([process.env.ANTHROPIC_KEY_1!, process.env.ANTHROPIC_KEY_2!]),
    retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
  },
});

Bun.serve({
  port: 3000,
  async fetch(req) {
    // Authenticate with YOUR platform credentials
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const user = await validatePlatformToken(token ?? '');
    if (!user) return toError('Unauthorized', 401);

    // Rate limit, track usage, bill user, etc.
    await trackUsage(user.id);

    const { messages, system, params } = parseBody(await req.json());

    if (params?.stream) {
      return toSSE(claude.stream(messages, { system }));
    }
    return toJSON(await claude.generate(messages, { system }));
  },
});
```

### Client

Clients authenticate with your platform token. They get automatic retry on network failures to your proxy.

```typescript
import { llm } from '@providerprotocol/ai';
import { proxy } from '@providerprotocol/ai/proxy';
import { ExponentialBackoff } from '@providerprotocol/ai/http';

const claude = llm({
  model: proxy('https://api.yourplatform.com/ai'),
  config: {
    headers: { 'Authorization': 'Bearer user-platform-token' },
    retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
    timeout: 30000,
  },
});

const turn = await claude.generate('Hello!');
```

### Framework Adapters

Server adapters for Express, Fastify, and Nuxt/H3:

```typescript
// Express
import { express as expressAdapter, parseBody } from '@providerprotocol/ai/proxy';
app.post('/ai', authMiddleware, async (req, res) => {
  const { messages, system, params } = parseBody(req.body);
  if (params?.stream) {
    expressAdapter.streamSSE(claude.stream(messages, { system }), res);
  } else {
    expressAdapter.sendJSON(await claude.generate(messages, { system }), res);
  }
});

// Fastify
import { fastify as fastifyAdapter, parseBody } from '@providerprotocol/ai/proxy';
app.post('/ai', async (request, reply) => {
  const { messages, system, params } = parseBody(request.body);
  if (params?.stream) {
    return fastifyAdapter.streamSSE(claude.stream(messages, { system }), reply);
  }
  return fastifyAdapter.sendJSON(await claude.generate(messages, { system }), reply);
});

// Nuxt/H3 (server/api/ai.post.ts)
import { h3 as h3Adapter, parseBody } from '@providerprotocol/ai/proxy';
export default defineEventHandler(async (event) => {
  const { messages, system, params } = parseBody(await readBody(event));
  if (params?.stream) {
    return h3Adapter.streamSSE(claude.stream(messages, { system }), event);
  }
  return h3Adapter.sendJSON(await claude.generate(messages, { system }), event);
});
```

**What this enables:**
- Users auth with your platform credentials (JWT, API keys, sessions)
- You manage/rotate AI provider keys centrally
- Per-user rate limiting, usage tracking, billing
- Model access control (different users get different models)
- Request/response logging, content filtering
- Double-layer retry: client retries to proxy, server retries to AI provider

## OpenAI API Modes

OpenAI supports two API endpoints. The Responses API is the default and recommended approach:

```typescript
import { openai } from '@providerprotocol/ai/openai';

// Responses API (default, recommended)
openai('gpt-4o')

// Chat Completions API (legacy)
openai('gpt-4o', { api: 'completions' })
```

The Responses API supports built-in tools and stateful conversations. Use completions for backward compatibility.

## OpenAI Built-in Tools

With the Responses API, use OpenAI's built-in tools directly:

```typescript
import { llm } from '@providerprotocol/ai';
import { openai, tools } from '@providerprotocol/ai/openai';

// Web search
const model = llm({
  model: openai('gpt-4o'),
  params: {
    tools: [tools.webSearch()],
  },
});

// File search with vector stores
const researchModel = llm({
  model: openai('gpt-4o'),
  params: {
    tools: [tools.fileSearch({ vector_store_ids: ['vs_abc123'] })],
  },
});

// Code interpreter
const codeModel = llm({
  model: openai('gpt-4o'),
  params: {
    tools: [tools.codeInterpreter()],
  },
});

// Image generation
const creativeModel = llm({
  model: openai('gpt-4o'),
  params: {
    tools: [tools.imageGeneration()],
  },
});
```

**Available Built-in Tools:**

| Tool | Description |
|------|-------------|
| `tools.webSearch()` | Search the web with optional user location |
| `tools.fileSearch()` | Search uploaded files in vector stores |
| `tools.codeInterpreter()` | Execute code in a sandboxed environment |
| `tools.computer()` | Computer use with display configuration |
| `tools.imageGeneration()` | Generate images via DALL-E |
| `tools.mcp()` | Connect to MCP servers |

## xAI API Modes

xAI supports multiple API compatibility modes:

```typescript
import { xai } from '@providerprotocol/ai/xai';

// Chat Completions (OpenAI-compatible, default)
xai('grok-3-fast')

// Responses API (stateful)
xai('grok-3-fast', { api: 'responses' })

// Messages API (Anthropic-compatible)
xai('grok-3-fast', { api: 'messages' })
```

## Groq

Fast inference with Llama, Gemma, and Mixtral models:

```typescript
import { llm } from '@providerprotocol/ai';
import { groq } from '@providerprotocol/ai/groq';

const model = llm({
  model: groq('llama-3.3-70b-versatile'),
  params: { max_tokens: 1000 },
});

const turn = await model.generate('Hello!');
```

**With web search:**

```typescript
const searchModel = llm({
  model: groq('llama-3.3-70b-versatile'),
  params: {
    search_settings: { mode: 'auto' },
  },
});
```

**With RAG documents:**

```typescript
const ragModel = llm({
  model: groq('llama-3.3-70b-versatile'),
  params: {
    documents: [
      { title: 'Doc 1', content: 'Document content here...' },
      { title: 'Doc 2', content: 'More content...' },
    ],
    citation_options: { include: true },
  },
});
```

**Capabilities:** Streaming, tool calling, structured output, image input (Llama 4 preview), web search, RAG with citations.

**Environment:** `GROQ_API_KEY`

## Cerebras

Ultra-fast inference with Llama, Qwen, and GPT-OSS models:

```typescript
import { llm } from '@providerprotocol/ai';
import { cerebras } from '@providerprotocol/ai/cerebras';

const model = llm({
  model: cerebras('llama-3.3-70b'),
  params: { max_completion_tokens: 1000 },
});

const turn = await model.generate('Hello!');
```

**With reasoning (GPT-OSS):**

```typescript
const model = llm({
  model: cerebras('gpt-oss-120b'),
  params: {
    reasoning_effort: 'high',
    reasoning_format: 'parsed',
  },
});
```

**Capabilities:** Streaming, tool calling, structured output, reasoning parameters.

**Environment:** `CEREBRAS_API_KEY`

## OpenResponses Provider

Connect to any server implementing the [OpenResponses specification](https://www.openresponses.org):

```typescript
import { llm } from '@providerprotocol/ai';
import { responses } from '@providerprotocol/ai/responses';

// Using with OpenAI
const model = llm({
  model: responses('gpt-5.2', {
    host: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  }),
  params: { max_output_tokens: 1000 },
});

// Using with OpenRouter
const routerModel = llm({
  model: responses('openai/gpt-4o', {
    host: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  }),
});

// Using with self-hosted server
const localModel = llm({
  model: responses('llama-3.3-70b', {
    host: 'http://localhost:8080/v1',
  }),
});
```

**Capabilities:** Full multimodal support, streaming, tool calling, structured output, reasoning summaries.

## Alternative Import Style

Use the `ai` namespace for a grouped import style:

```typescript
import { ai } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const model = ai.llm({ model: openai('gpt-4o') });
const embedder = ai.embedding({ model: openai('text-embedding-3-small') });
const dalle = ai.image({ model: openai('dall-e-3') });
```

## TypeScript

Full type safety with no `any` types. All provider parameters are typed:

```typescript
import type {
  // Core types
  Turn,
  Message,
  Tool,
  TokenUsage,

  // Streaming
  StreamEvent,
  StreamResult,

  // Content blocks
  TextBlock,
  ImageBlock,
  ReasoningBlock,
  DocumentBlock,
  AudioBlock,
  VideoBlock,

  // Modality results
  EmbeddingResult,
  ImageResult,

  // Errors
  UPPError,
  ErrorCode,

  // Configuration
  ProviderConfig,
  KeyStrategy,
  RetryStrategy,
  LLMCapabilities,

  // Middleware
  Middleware,
  MiddlewareContext,
  StreamContext,
} from '@providerprotocol/ai';
```

**Type-Safe Enums:**

```typescript
import {
  StreamEventType,
  ErrorCode,
  ContentBlockType,
  MessageRole,
  ModalityType,
} from '@providerprotocol/ai';

// Use instead of magic strings
if (event.type === StreamEventType.TextDelta) { ... }
if (error.code === ErrorCode.RateLimited) { ... }
if (block.type === ContentBlockType.Text) { ... }
```

### Custom Providers

Build custom providers with `createProvider`:

```typescript
import { createProvider } from '@providerprotocol/ai';

const myProvider = createProvider({
  name: 'my-provider',
  version: '1.0.0',
  handlers: {
    llm: myLLMHandler,
    embedding: myEmbeddingHandler,
  },
});
```

## License

MIT
