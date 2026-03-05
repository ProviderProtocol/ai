/**
 * Google Cloud Vertex AI provider for UPP (Unified Provider Protocol)
 *
 * This module exports the Vertex AI provider for use with Gemini models via GCP endpoints.
 *
 * @example
 * ```ts
 * import { vertex } from '@providerprotocol/ai/vertex';
 * import { llm } from '@providerprotocol/ai';
 *
 * // Create an LLM instance with Vertex
 * const model = llm({
 *   model: vertex('gemini-1.5-pro'),
 *   config: { apiKey: process.env.VERTEX_TOKEN },
 *   params: { project: 'my-gcp-project', location: 'us-central1' }
 * });
 *
 * // Generate a response
 * const turn = await model.generate('What is machine learning?');
 * console.log(turn.response.text);
 * ```
 *
 * @packageDocumentation
 */

export { vertex } from '../providers/vertex/index.ts';
export type { VertexLLMParams } from '../providers/vertex/index.ts';
