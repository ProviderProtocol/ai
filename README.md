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

## Providers

| Provider | Import |
|----------|--------|
| Anthropic | `@providerprotocol/ai/anthropic` |
| OpenAI | `@providerprotocol/ai/openai` |
| Google | `@providerprotocol/ai/google` |
| Ollama | `@providerprotocol/ai/ollama` |
| OpenRouter | `@providerprotocol/ai/openrouter` |

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
