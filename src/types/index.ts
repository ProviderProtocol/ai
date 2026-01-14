/**
 * @fileoverview Unified Provider Protocol (UPP) Type Definitions
 *
 * This module exports all core types for the Unified Provider Protocol,
 * providing a normalized interface for interacting with various AI providers.
 *
 * @module types
 */

/**
 * Error handling types for normalized cross-provider error handling.
 * @see {@link UPPError} for the main error class
 */
export {
  UPPError,
  ErrorCode,
  ModalityType,
  type Modality,
} from './errors.ts';

/**
 * JSON Schema types for tool parameters and structured outputs.
 * Used to define type-safe schemas for LLM tool calls and response structures.
 */
export type {
  JSONSchema,
  JSONSchemaProperty,
  JSONSchemaPropertyType,
} from './schema.ts';

/**
 * Content block types for multimodal message content.
 * Supports text, images, documents, audio, video, and binary data.
 */
export type {
  ContentBlock,
  TextBlock,
  ReasoningBlock,
  ImageBlock,
  DocumentBlock,
  AudioBlock,
  VideoBlock,
  BinaryBlock,
  ImageSource,
  DocumentSource,
  UserContent,
  AssistantContent,
} from './content.ts';
export {
  ContentBlockType,
  ImageSourceType,
  DocumentSourceType,
  text,
  reasoning,
  isTextBlock,
  isReasoningBlock,
  isImageBlock,
  isDocumentBlock,
  isAudioBlock,
  isVideoBlock,
  isBinaryBlock,
} from './content.ts';

/**
 * Tool types for function calling and tool execution.
 * Defines the interface for registering and executing tools with LLMs.
 */
export type {
  Tool,
  ToolCall,
  ToolResult,
  ToolMetadata,
  ToolUseStrategy,
  BeforeCallResult,
  AfterCallResult,
  ToolExecution,
} from './tool.ts';

/**
 * Message types for conversation history.
 * Includes user, assistant, and tool result message classes.
 */
export {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  MessageRole,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
} from './messages.ts';
export type { MessageType, MessageMetadata, MessageOptions } from './messages.ts';

/**
 * Turn types representing complete inference results.
 * A Turn encapsulates all messages and metadata from a single inference call.
 */
export type { Turn, TokenUsage } from './turn.ts';
export { createTurn, emptyUsage, aggregateUsage } from './turn.ts';

/**
 * Thread class for managing conversation history.
 * Provides utilities for building and manipulating message sequences.
 */
export { Thread } from './thread.ts';
export type { ThreadJSON } from './thread.ts';
export type { MessageJSON } from './messages.ts';

/**
 * Streaming types for real-time inference responses.
 * Supports text deltas, tool call deltas, and control events.
 */
export type {
  StreamEvent,
  EventDelta,
  StreamResult,
} from './stream.ts';
export {
  StreamEventType,
  createStreamResult,
  textDelta,
  toolCallDelta,
  messageStart,
  messageStop,
  contentBlockStart,
  contentBlockStop,
} from './stream.ts';

/**
 * Provider types for AI service integrations.
 * Defines the interface for provider factories and modality handlers.
 */
export type {
  Provider,
  ProviderIdentity,
  ModelReference,
  ProviderConfig,
  KeyStrategy,
  RetryStrategy,
  LLMProvider,
  EmbeddingProvider,
  ImageProvider,
  EmbeddingHandler,
  BoundEmbeddingModel,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingVector,
  EmbeddingUsage,
  EmbeddingInput,
} from './provider.ts';

/**
 * LLM types for language model inference.
 * Includes options, instances, requests, and responses for LLM operations.
 */
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

/**
 * Embedding types for vector embedding generation.
 * Includes options, instances, requests, and responses for embedding operations.
 */
export type {
  EmbeddingOptions,
  EmbeddingInstance,
  EmbedOptions,
  Embedding,
  EmbeddingResult,
  EmbeddingProgress,
  EmbeddingStream,
  EmbeddingModelInput,
} from './embedding.ts';

/**
 * Image generation types for text-to-image and image editing.
 * Includes options, instances, requests, and responses for image operations.
 */
export type {
  ImageOptions,
  ImageInstance,
  ImageInput,
  ImageEditInput,
  ImageGenerateOptions,
  GeneratedImage,
  ImageUsage,
  ImageResult,
  ImageStreamEvent,
  ImageStreamResult,
  ImageCapabilities,
  ImageRequest,
  ImageEditRequest,
  ImageResponse,
  ImageProviderStreamResult,
  BoundImageModel,
  ImageHandler,
  ImageModelInput,
} from './image.ts';
