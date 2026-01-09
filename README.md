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

// Exponential: 1s, 2s, 4s... (default)
new ExponentialBackoff({ maxAttempts: 5, baseDelay: 1000, maxDelay: 30000 })

// Linear: 1s, 2s, 3s...
new LinearBackoff({ maxAttempts: 3, delay: 1000 })

// Rate limiting with token bucket
new TokenBucket({ maxTokens: 10, refillRate: 1 })

// Respect server Retry-After headers
new RetryAfterStrategy({ maxAttempts: 3, fallbackDelay: 5000 })

// No retries
new NoRetry()
```

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

## Proxy Server

Build backend proxies to hide API keys from clients.

### Server

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { webapi, parseBody, toJSON, toSSE } from '@providerprotocol/ai/proxy';

const claude = llm({ model: anthropic('claude-sonnet-4-20250514') });

Bun.serve({
  port: 3000,
  fetch: webapi(async (req) => {
    const { messages, system, params } = parseBody(await req.json());

    if (params?.stream) {
      return toSSE(claude.stream(messages, { system }));
    }

    return toJSON(await claude.generate(messages, { system }));
  }),
});
```

### Client

```typescript
import { llm } from '@providerprotocol/ai';
import { proxy } from '@providerprotocol/ai/proxy';

const claude = llm({ model: proxy('http://localhost:3000') });
const turn = await claude.generate('Hello!');
```

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

## TypeScript

Full type safety with no `any` types. All provider parameters are typed:

```typescript
import type {
  Turn,
  Message,
  Tool,
  UPPError,
  TokenUsage,
  StreamEvent,
  EmbeddingResult,
  ImageResult,
} from '@providerprotocol/ai';
```

## License

MIT
