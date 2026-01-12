# How to Use @providerprotocol/ai

This library provides a unified SDK for AI inference across multiple LLM providers (Anthropic, OpenAI, Google, Ollama, OpenRouter, xAI). It implements the Unified Provider Protocol (UPP-1.2).

## Quick Start

```ts
import { llm } from '@providerprotocol/ai';
import { anthropic } from '@providerprotocol/ai/anthropic';

const claude = llm({
  model: anthropic('claude-sonnet-4-20250514'),
  params: { max_tokens: 1000 },
});

const turn = await claude.generate('Hello!');
console.log(turn.response.text);
```

## Provider Setup

Each provider has a factory function. Import from the provider's path:

```ts
// Anthropic
import { anthropic } from '@providerprotocol/ai/anthropic';
import type { AnthropicLLMParams } from '@providerprotocol/ai/anthropic';

// OpenAI
import { openai } from '@providerprotocol/ai/openai';
import type { OpenAIResponsesParams, OpenAICompletionsParams } from '@providerprotocol/ai/openai';

// Google Gemini
import { google } from '@providerprotocol/ai/google';
import type { GoogleLLMParams } from '@providerprotocol/ai/google';

// Ollama (local models)
import { ollama } from '@providerprotocol/ai/ollama';
import type { OllamaLLMParams } from '@providerprotocol/ai/ollama';

// OpenRouter
import { openrouter } from '@providerprotocol/ai/openrouter';

// xAI (Grok)
import { xai } from '@providerprotocol/ai/xai';
```

## Creating LLM Instances

Use `llm()` with provider-specific params type for type safety:

```ts
// Anthropic
const claude = llm<AnthropicLLMParams>({
  model: anthropic('claude-3-5-haiku-latest'),
  params: { max_tokens: 100 },
});

// OpenAI (Responses API - default)
const gpt = llm<OpenAIResponsesParams>({
  model: openai('gpt-5.2'),
  params: { max_output_tokens: 100 },
});

// OpenAI (Completions API)
const gptCompletions = llm<OpenAICompletionsParams>({
  model: openai('gpt-5.2', { api: 'completions' }),
  params: { max_completion_tokens: 100 },
});

// Google Gemini
const gemini = llm<GoogleLLMParams>({
  model: google('gemini-3-flash-preview'),
  params: { maxOutputTokens: 500 },
});

// Ollama (local)
const local = llm<OllamaLLMParams>({
  model: ollama('gemma3:4b'),
  params: { num_predict: 100 },
});
```

## Basic Generation

```ts
const turn = await model.generate('What is 2+2?');

// Access response
console.log(turn.response.text);      // The text response
console.log(turn.cycles);             // Number of inference cycles (>1 if tools used)
console.log(turn.usage.totalTokens);  // Total tokens used
console.log(turn.usage.inputTokens);  // Input tokens
console.log(turn.usage.outputTokens); // Output tokens
```

## Streaming

```ts
import { StreamEventType } from '@providerprotocol/ai';

const stream = model.stream('Count from 1 to 5.');

// Iterate over events
for await (const event of stream) {
  if (event.type === StreamEventType.TextDelta && event.delta.text) {
    process.stdout.write(event.delta.text);
  }
}

// Get final turn after stream completes
const turn = await stream.turn;
console.log(turn.response.text);
```

### Stream Event Types

- `text_delta` - Text chunk: `event.delta.text`
- `tool_call_delta` - Tool call info: `event.delta.toolCallId`, `event.delta.toolName`, `event.delta.argumentsJson`
- `tool_execution_start` - Tool started: `event.delta.toolCallId`, `event.delta.toolName`, `event.delta.timestamp`
- `tool_execution_end` - Tool completed: `event.delta.toolCallId`, `event.delta.toolName`, `event.delta.result`, `event.delta.isError`, `event.delta.timestamp`
- `message_start` - Message started
- `message_stop` - Message complete
- `content_block_start` - Content block started
- `content_block_stop` - Content block complete

## System Prompts

```ts
const model = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  params: { max_tokens: 100 },
  system: 'You are a helpful assistant who speaks like a pirate.',
});
```

## Multi-turn Conversations

### Manual History Management

```ts
const model = llm<AnthropicLLMParams>({
  model: anthropic('claude-3-5-haiku-latest'),
  params: { max_tokens: 100 },
});

const history: any[] = [];

// First turn
const turn1 = await model.generate(history, 'My name is Alice.');
history.push(...turn1.messages);

// Second turn (model remembers context)
const turn2 = await model.generate(history, 'What is my name?');
// turn2.response.text will contain "Alice"
```

### Using Thread Class

```ts
import { Thread, UserMessage, AssistantMessage } from '@providerprotocol/ai';

const thread = new Thread();

// Add messages
thread.user('Hello');
thread.assistant('Hi there!');
thread.push(new UserMessage('How are you?'));

// Use with generate
const turn = await model.generate(thread.messages, 'Tell me a joke.');
thread.append(turn); // Appends turn.messages to thread

// Thread utilities
thread.filter('user');    // Get only user messages
thread.tail(5);           // Get last 5 messages
thread.slice(0, 10);      // Get messages 0-9
thread.clear();           // Clear all messages

// Serialization
const json = thread.toJSON();
const restored = Thread.fromJSON(json);
```

## Tool Calling

Define tools with JSON Schema parameters and a `run` function:

```ts
const getWeather = {
  name: 'getWeather',
  description: 'Get the weather for a location',
  parameters: {
    type: 'object' as const,
    properties: {
      location: { type: 'string' as const, description: 'The city name' },
    },
    required: ['location'],
  },
  run: async (params: { location: string }) => {
    // Your implementation here
    return `The weather in ${params.location} is 72°F and sunny.`;
  },
};

const model = llm<AnthropicLLMParams>({
  model: anthropic('claude-3-5-haiku-latest'),
  params: { max_tokens: 200 },
  tools: [getWeather],
});

const turn = await model.generate('What is the weather in Tokyo?');

// Tool executions are tracked
console.log(turn.toolExecutions);
// [{ toolName: 'getWeather', arguments: { location: 'Tokyo' }, result: '...', duration: 123 }]
```

### Tool with Approval

```ts
const deleteTool = {
  name: 'deleteFile',
  description: 'Delete a file',
  parameters: {
    type: 'object' as const,
    properties: { path: { type: 'string' as const } },
    required: ['path'],
  },
  run: async (params: { path: string }) => {
    // Delete logic
  },
  approval: async (params: { path: string }) => {
    // Return true to allow, false to deny
    return confirm(`Delete ${params.path}?`);
  },
};
```

### Tool Use Strategy (Hooks)

```ts
const model = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  tools: [myTool],
  toolStrategy: {
    maxIterations: 5,  // Max tool execution rounds (default: 10)
    onToolCall: (tool, params) => console.log(`Calling ${tool.name}`),
    onBeforeCall: (tool, params) => true,  // Return false to skip
    onAfterCall: (tool, params, result) => console.log('Result:', result),
    onError: (tool, params, error) => console.error(error),
    onMaxIterations: (n) => console.warn(`Reached ${n} iterations`),
  },
});
```

### Streaming with Tools

```ts
import { StreamEventType } from '@providerprotocol/ai';

const stream = model.stream('What is 7 + 15?');

for await (const event of stream) {
  if (event.type === StreamEventType.ToolCallDelta) {
    console.log('Tool:', event.delta.toolName, event.delta.argumentsJson);
  }
  if (event.type === StreamEventType.ToolExecutionStart) {
    console.log(`Starting ${event.delta.toolName}...`);
  }
  if (event.type === StreamEventType.ToolExecutionEnd) {
    console.log(`${event.delta.toolName} completed:`, event.delta.result);
    if (event.delta.isError) {
      console.error('Tool error:', event.delta.result);
    }
  }
  if (event.type === StreamEventType.TextDelta) {
    process.stdout.write(event.delta.text ?? '');
  }
}

const turn = await stream.turn;
console.log('Tool executions:', turn.toolExecutions);
```

## Structured Output

Use JSON Schema to enforce response structure:

```ts
const model = llm<AnthropicLLMParams>({
  model: anthropic('claude-3-5-haiku-latest'),
  params: { max_tokens: 200 },
  structure: {
    type: 'object',
    properties: {
      city: { type: 'string' },
      population: { type: 'number' },
      isCapital: { type: 'boolean' },
    },
    required: ['city', 'population', 'isCapital'],
  },
});

const turn = await model.generate('Tell me about Paris, France.');

// Parsed data is available on turn.data
console.log(turn.data);
// { city: 'Paris', population: 2161000, isCapital: true }
```

### Streaming Structured Output

Different providers stream structured output differently:

```ts
import { StreamEventType } from '@providerprotocol/ai';

// OpenAI/Google: Accumulate text_delta events
const stream = gpt.stream('Tell me about Tokyo.');
let json = '';
for await (const event of stream) {
  if (event.type === StreamEventType.TextDelta && event.delta.text) {
    json += event.delta.text;
  }
}
const data = JSON.parse(json);

// Anthropic: Accumulate tool_call_delta events (tool-based approach)
const stream = claude.stream('Tell me about Tokyo.');
let json = '';
for await (const event of stream) {
  if (event.type === StreamEventType.ToolCallDelta && event.delta.argumentsJson) {
    json += event.delta.argumentsJson;
  }
}
const data = JSON.parse(json);
```

## Vision / Multimodal

### Using Images

```ts
import { UserMessage } from '@providerprotocol/ai';
import { readFileSync } from 'fs';

// Base64 image
const imageBase64 = readFileSync('./image.png').toString('base64');

const message = new UserMessage([
  { type: 'text', text: 'What is in this image?' },
  {
    type: 'image',
    mimeType: 'image/png',
    source: { type: 'base64', data: imageBase64 },
  },
]);

const turn = await model.generate([message]);
console.log(turn.response.text);
```

### Image from URL

```ts
const message = new UserMessage([
  { type: 'text', text: 'Describe this image.' },
  {
    type: 'image',
    mimeType: 'image/jpeg',
    source: { type: 'url', url: 'https://example.com/image.jpg' },
  },
]);
```

## OpenAI Built-in Tools

OpenAI Responses API provides native tools:

```ts
import { openai, tools } from '@providerprotocol/ai/openai';

// Web Search
const model = llm<OpenAIResponsesParams>({
  model: openai('gpt-4o'),
  params: {
    max_output_tokens: 500,
    tools: [tools.webSearch()],
  },
});

// Web Search with user location
const modelWithLocation = llm<OpenAIResponsesParams>({
  model: openai('gpt-4o'),
  params: {
    max_output_tokens: 500,
    tools: [
      tools.webSearch({
        search_context_size: 'medium',
        user_location: {
          type: 'approximate',
          city: 'Tokyo',
          country: 'JP',
        },
      }),
    ],
  },
});

// Image Generation
const imageModel = llm<OpenAIResponsesParams>({
  model: openai('gpt-4o'),
  params: {
    max_output_tokens: 1000,
    tools: [tools.imageGeneration({ quality: 'low', size: '1024x1024' })],
  },
});

const turn = await imageModel.generate('Generate an image of a red apple.');
// Generated images are in turn.response.images
const image = turn.response.images[0];
```

## Error Handling

All errors are normalized to `UPPError`:

```ts
import { UPPError } from '@providerprotocol/ai';

try {
  await model.generate('Hello');
} catch (error) {
  if (error instanceof UPPError) {
    console.log(error.code);     // 'AUTHENTICATION_FAILED', 'RATE_LIMITED', etc.
    console.log(error.provider); // 'anthropic', 'openai', etc.
    console.log(error.modality); // 'llm', 'embedding', 'image'
    console.log(error.message);  // Human-readable message
  }
}
```

### Error Codes

- `AUTHENTICATION_FAILED` - Invalid API key
- `RATE_LIMITED` - Too many requests
- `CONTEXT_LENGTH_EXCEEDED` - Input too long
- `MODEL_NOT_FOUND` - Invalid model ID
- `INVALID_REQUEST` - Malformed request
- `SERVER_ERROR` - Provider error
- `NETWORK_ERROR` - Connection failed
- `TIMEOUT` - Request timeout

## Custom API Key / Config

```ts
const model = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  params: { max_tokens: 100 },
  config: {
    apiKey: 'sk-...',  // Override env var
    baseUrl: 'https://custom-endpoint.com',  // Custom endpoint
  },
});
```

## Key Management Strategies

For load balancing across multiple API keys:

```ts
import { RoundRobinKeys, WeightedKeys, DynamicKey } from '@providerprotocol/ai';

// Round robin
const model = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  config: {
    apiKey: new RoundRobinKeys(['key1', 'key2', 'key3']),
  },
});

// Weighted distribution
const weighted = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  config: {
    apiKey: new WeightedKeys([
      { key: 'primary-key', weight: 80 },
      { key: 'backup-key', weight: 20 },
    ]),
  },
});

// Dynamic key fetching
const dynamic = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  config: {
    apiKey: new DynamicKey(async () => {
      // Fetch from secrets manager, etc.
      return await getKeyFromVault();
    }),
  },
});
```

## Retry Strategies

```ts
import { ExponentialBackoff, LinearBackoff, NoRetry } from '@providerprotocol/ai';

const model = llm({
  model: anthropic('claude-3-5-haiku-latest'),
  config: {
    retry: new ExponentialBackoff({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
    }),
  },
});
```

## Provider-Specific Parameters

Each provider has unique parameter names:

| Feature | Anthropic | OpenAI Responses | OpenAI Completions | Google |
|---------|-----------|------------------|-------------------|--------|
| Max tokens | `max_tokens` | `max_output_tokens` | `max_completion_tokens` | `maxOutputTokens` |
| Temperature | `temperature` | `temperature` | `temperature` | `temperature` |

## Message Types

```ts
import { UserMessage, AssistantMessage, ToolResultMessage } from '@providerprotocol/ai';

// User message with text
const user = new UserMessage('Hello');

// User message with content blocks
const userMulti = new UserMessage([
  { type: 'text', text: 'Describe this:' },
  { type: 'image', mimeType: 'image/png', source: { type: 'base64', data: '...' } },
]);

// Assistant message
const assistant = new AssistantMessage('Hi there!');

// Assistant message with tool calls
const assistantWithTools = new AssistantMessage('Let me check...', [
  { toolCallId: 'call_123', toolName: 'getWeather', arguments: { city: 'Tokyo' } },
]);

// Tool result
const toolResult = new ToolResultMessage([
  { toolCallId: 'call_123', result: '72°F and sunny' },
]);

// Type guards
import { isUserMessage, isAssistantMessage, isToolResultMessage } from '@providerprotocol/ai';
if (isUserMessage(msg)) { /* ... */ }
```

## Environment Variables

Set API keys as environment variables (Bun auto-loads `.env`):

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
XAI_API_KEY=xai-...
OPENROUTER_API_KEY=sk-or-...
```

## Running Tests

```sh
# All tests
bun test

# Specific provider tests
bun test:anthropic
bun test:openai
bun test:google

# Unit tests only
bun test:unit

# Live API tests (requires API keys)
bun test:live
```
