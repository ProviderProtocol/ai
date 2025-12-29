// Error types
export { UPPError, type ErrorCode, type Modality } from './errors.ts';

// Schema types
export type {
  JSONSchema,
  JSONSchemaProperty,
  JSONSchemaPropertyType,
} from './schema.ts';

// Content block types
export type {
  ContentBlock,
  TextBlock,
  ImageBlock,
  AudioBlock,
  VideoBlock,
  BinaryBlock,
  ImageSource,
  UserContent,
  AssistantContent,
} from './content.ts';
export {
  text,
  isTextBlock,
  isImageBlock,
  isAudioBlock,
  isVideoBlock,
  isBinaryBlock,
} from './content.ts';

// Tool types
export type {
  Tool,
  ToolCall,
  ToolResult,
  ToolUseStrategy,
  ToolExecution,
} from './tool.ts';

// Message types
export {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from './messages.ts';
export type { MessageType, MessageMetadata, MessageOptions } from './messages.ts';

// Turn types
export type { Turn, TokenUsage } from './turn.ts';
export { createTurn, emptyUsage, aggregateUsage } from './turn.ts';

// Thread types
export { Thread } from './thread.ts';
export type { ThreadJSON, MessageJSON } from './thread.ts';

// Stream types
export type {
  StreamEvent,
  StreamEventType,
  EventDelta,
  StreamResult,
} from './stream.ts';
export {
  createStreamResult,
  textDelta,
  toolCallDelta,
  messageStart,
  messageStop,
  contentBlockStart,
  contentBlockStop,
} from './stream.ts';

// Provider types
export type {
  Provider,
  ModelReference,
  ProviderConfig,
  KeyStrategy,
  RetryStrategy,
  LLMProvider,
  EmbeddingProvider,
  ImageProvider,
  EmbeddingHandler,
  ImageHandler,
  BoundEmbeddingModel,
  BoundImageModel,
} from './provider.ts';

// LLM types
export type {
  LLMOptions,
  LLMInstance,
  LLMCapabilities,
  LLMRequest,
  LLMResponse,
  LLMStreamResult,
  BoundLLMModel,
  LLMHandler,
  InferenceInput,
} from './llm.ts';
