import { createProvider } from '../../core/provider.ts';
import { createLLMHandler } from './llm.ts';

const baseProvider = createProvider({
    name: 'vertex',
    version: '1.0.0',
    handlers: {
        llm: createLLMHandler(),
    },
});

/**
 * Google Cloud Vertex AI provider for the Unified Provider Protocol (UPP).
 *
 * Provides access to Google's Vertex AI family of models through
 * a standardized interface.
 *
 * @example
 * ```typescript
 * import { vertex } from './providers/vertex';
 * import { llm } from './core/llm';
 * import { StreamEventType } from './types/stream';
 *
 * const gemini = llm({
 *   model: vertex('gemini-1.5-pro'),
 *   config: { apiKey: process.env.VERTEX_TOKEN },
 *   params: { project: 'my-gcp-project', location: 'us-central1' }
 * });
 *
 * const turn = await gemini.generate('Hello!');
 * console.log(turn.response.text);
 * ```
 */
export const vertex = baseProvider;

export type { VertexLLMParams } from './types.ts';
