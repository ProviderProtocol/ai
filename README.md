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
| OpenRouter | `@providerprotocol/ai/openrouter` | ✓ | ✓ | |

API keys are loaded automatically from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).

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
import { Image } from '@providerprotocol/ai';

const img = await Image.fromPath('./photo.png');
const turn = await claude.generate([img, 'What is in this image?']);
```

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
| `computerUse` | Mouse, keyboard, screenshot control (Claude 4) |
| `codeExecution` | Python/Bash sandbox execution |
| `tokenEfficientTools` | Up to 70% token reduction for tool calls |
| `fineGrainedToolStreaming` | Stream tool args without buffering |
| `output128k` | 128K token output length |
| `context1m` | 1 million token context window (Sonnet 4) |
| `promptCaching` | Reduced latency and costs via caching |
| `extendedCacheTtl` | 1-hour cache TTL (vs 5-minute default) |
| `advancedToolUse` | Tool Search, Programmatic Tool Calling |
| `mcpClient` | Connect to remote MCP servers |
| `filesApi` | Upload and manage files |
| `pdfs` | PDF document support |
| `messageBatches` | Async batch processing at 50% cost |
| `skills` | Agent Skills (PowerPoint, Excel, Word, PDF) |

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
} from '@providerprotocol/ai';
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
