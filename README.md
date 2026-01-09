# @providerprotocol/ai

Unified Provider Protocol (UPP-1.2) implementation for AI inference across multiple providers.

## Install

```bash
bun add @providerprotocol/ai
```

## Usage

```typescript
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';
import { openai } from '@providerprotocol/ai/openai';
import { google } from '@providerprotocol/ai/google';
import { ollama } from '@providerprotocol/ai/ollama';
import { openrouter } from '@providerprotocol/ai/openrouter';
import { xai } from '@providerprotocol/ai/xai';

// Simple generation
const claude = llm({ model: anthropic('claude-sonnet-4-20250514') });
const turn = await claude.generate('Hello!');
console.log(turn.response.text);

// Streaming
const stream = claude.stream('Count to 5');
for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta.text);
}

// Multi-turn
const history = [];
const t1 = await claude.generate(history, 'My name is Alice');
history.push(...t1.messages);
const t2 = await claude.generate(history, 'What is my name?');

// Tools
const turn = await claude.generate({
  tools: [{
    name: 'getWeather',
    description: 'Get weather for a location',
    parameters: { type: 'object', properties: { location: { type: 'string' } } },
    run: async ({ location }) => `Sunny in ${location}`,
  }],
}, 'Weather in Tokyo?');

// Structured output
const turn = await llm({
  model: openai('gpt-4o'),
  structure: {
    type: 'object',
    properties: { name: { type: 'string' }, age: { type: 'number' } },
  },
}).generate('Extract: John is 30 years old');
console.log(turn.data); // { name: 'John', age: 30 }
```

## Embeddings

Generate vector embeddings from text using the unified `embedding()` interface.

```typescript
import { embedding } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';
import { google } from '@providerprotocol/ai/google';
import { ollama } from '@providerprotocol/ai/ollama';
import { openrouter } from '@providerprotocol/ai/openrouter';

// Single text embedding
const embedder = embedding({ model: openai('text-embedding-3-small') });
const result = await embedder.embed('Hello world');
console.log(result.embeddings[0].vector); // [0.123, -0.456, ...]
console.log(result.embeddings[0].dimensions); // 1536

// Batch embedding
const batch = await embedder.embed(['doc1', 'doc2', 'doc3']);
console.log(batch.embeddings.length); // 3

// Custom dimensions (OpenAI text-embedding-3 models)
const smallEmbed = embedding({
  model: openai('text-embedding-3-small'),
  params: { dimensions: 256 },
});

// Google with task type optimization
const googleEmbed = embedding({
  model: google('text-embedding-004'),
  params: {
    taskType: 'RETRIEVAL_DOCUMENT',
    title: 'Important Document',
  },
});

// Ollama local embeddings
const localEmbed = embedding({
  model: ollama('qwen3-embedding:4b'),
});

// OpenRouter (access multiple providers)
const routerEmbed = embedding({
  model: openrouter('openai/text-embedding-3-small'),
});
```

### Chunked Streaming

For large document sets, use chunked mode for progress tracking:

```typescript
const embedder = embedding({ model: openai('text-embedding-3-small') });
const documents = Array.from({ length: 1000 }, (_, i) => `Document ${i}`);

const stream = embedder.embed(documents, {
  chunked: true,
  batchSize: 100,
  concurrency: 2,
});

for await (const progress of stream) {
  console.log(`${progress.percent.toFixed(1)}% complete`);
  console.log(`Processed ${progress.completed} of ${progress.total}`);
}

const finalResult = await stream.result;
console.log(`Total embeddings: ${finalResult.embeddings.length}`);
```

### Provider-Specific Parameters

Each provider supports its native parameters passed through unchanged:

```typescript
// OpenAI: dimensions, encoding_format, user
embedding({
  model: openai('text-embedding-3-large'),
  params: { dimensions: 1024, encoding_format: 'float' },
});

// Google: taskType, title, outputDimensionality
embedding({
  model: google('text-embedding-004'),
  params: {
    taskType: 'SEMANTIC_SIMILARITY',
    outputDimensionality: 256,
  },
});

// Ollama: truncate, keep_alive, options
embedding({
  model: ollama('nomic-embed-text'),
  params: { truncate: true, keep_alive: '5m' },
});

// OpenRouter: dimensions, encoding_format, input_type
embedding({
  model: openrouter('openai/text-embedding-3-small'),
  params: { dimensions: 512 },
});
```

## Image Generation

Generate images from text prompts using the unified `image()` interface.

```typescript
import { image } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';
import { google } from '@providerprotocol/ai/google';
import { xai } from '@providerprotocol/ai/xai';

// Simple generation
const dalle = image({ model: openai('dall-e-3') });
const result = await dalle.generate('A sunset over mountains');
console.log(result.images[0].image.toBase64());

// With parameters
const hd = image({
  model: openai('dall-e-3'),
  params: { size: '1792x1024', quality: 'hd', style: 'natural' },
});
const result = await hd.generate('A photorealistic landscape');

// Multiple images (DALL-E 2)
const batch = image({
  model: openai('dall-e-2'),
  params: { n: 4, size: '512x512' },
});
const result = await batch.generate('Abstract geometric art');
console.log(result.images.length); // 4

// Google Imagen
const imagen = image({
  model: google('imagen-4.0-generate-001'),
  params: { aspectRatio: '16:9', sampleCount: 2 },
});

// xAI Aurora
const aurora = image({
  model: xai('grok-2-image-1212'),
  params: { n: 2 },
});
```

### Image Editing

Edit existing images with DALL-E 2 using masks to specify regions:

```typescript
import { image, Image } from '@providerprotocol/ai';
import { openai } from '@providerprotocol/ai/openai';

const editor = image({
  model: openai('dall-e-2'),
  params: { size: '512x512' },
});

// Load source image and mask
const source = await Image.fromPath('./photo.png');
const mask = await Image.fromPath('./mask.png'); // Transparent areas = edit regions

const result = await editor.edit({
  image: source,
  mask,
  prompt: 'Add a rainbow in the sky',
});
```

### Working with Generated Images

```typescript
const result = await dalle.generate('A red apple');
const img = result.images[0].image;

// Convert to different formats
const base64 = img.toBase64();
const bytes = img.toBytes();
const dataUrl = img.toDataUrl();

// Access metadata
console.log(img.mimeType); // 'image/png'
console.log(result.images[0].metadata?.revised_prompt); // DALL-E's enhanced prompt
console.log(result.usage?.imagesGenerated); // 1
```

### Provider-Specific Parameters

```typescript
// OpenAI DALL-E 3: size, quality, style
image({
  model: openai('dall-e-3'),
  params: { size: '1024x1024', quality: 'hd', style: 'vivid' },
});

// OpenAI DALL-E 2: size, n, response_format
image({
  model: openai('dall-e-2'),
  params: { size: '512x512', n: 4, response_format: 'b64_json' },
});

// Google Imagen: aspectRatio, sampleCount, personGeneration
image({
  model: google('imagen-4.0-generate-001'),
  params: {
    aspectRatio: '16:9',
    sampleCount: 4,
    personGeneration: 'allow_adult',
  },
});

// xAI Aurora: n, response_format
image({
  model: xai('grok-2-image-1212'),
  params: { n: 2, response_format: 'b64_json' },
});
```

## Providers

| Provider | Import | LLM | Embedding | Image |
|----------|--------|-----|-----------|-------|
| Anthropic | `@providerprotocol/ai/anthropic` | Yes | - | - |
| OpenAI | `@providerprotocol/ai/openai` | Yes | Yes | Yes |
| Google | `@providerprotocol/ai/google` | Yes | Yes | Yes |
| Ollama | `@providerprotocol/ai/ollama` | Yes | Yes | - |
| OpenRouter | `@providerprotocol/ai/openrouter` | Yes | Yes | - |
| xAI (Grok) | `@providerprotocol/ai/xai` | Yes | - | Yes |

### xAI API Modes

xAI supports three API modes:

```typescript
import { xai } from '@providerprotocol/ai/xai';

// Chat Completions API (OpenAI-compatible, default)
const grok = llm({ model: xai('grok-3-fast') });

// Responses API (stateful, OpenAI Responses-compatible)
const grok = llm({ model: xai('grok-3-fast', { api: 'responses' }) });

// Messages API (Anthropic-compatible)
const grok = llm({ model: xai('grok-3-fast', { api: 'messages' }) });
```

## Configuration

```typescript
import { ExponentialBackoff, RoundRobinKeys } from '@providerprotocol/ai/http';

const instance = llm({
  model: openai('gpt-4o'),
  config: {
    apiKey: 'sk-...',
    timeout: 30000,
    retryStrategy: new ExponentialBackoff({ maxAttempts: 3 }),
  },
  params: { temperature: 0.7, max_tokens: 1000 },
  system: 'You are helpful.',
});
```

## License

MIT
