// Core entry points
export { llm } from './core/llm.ts';
export { createProvider } from './core/provider.ts';
export { Image } from './core/image.ts';

// Namespace object for alternative import style
import { llm } from './core/llm.ts';

/**
 * UPP namespace object
 * Provides ai.llm(), ai.embedding(), ai.image() style access
 */
export const ai = {
  llm,
  // embedding, // Coming soon
  // image,     // Coming soon
};

// Re-export all types from types/index.ts
export * from './types/index.ts';

// Re-export HTTP utilities
export {
  RoundRobinKeys,
  WeightedKeys,
  DynamicKey,
  ExponentialBackoff,
  LinearBackoff,
  NoRetry,
  TokenBucket,
  RetryAfterStrategy,
} from './http/index.ts';
