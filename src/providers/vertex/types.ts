import type { GoogleLLMParams } from '../google/types.ts';

/**
 * Provider-specific parameters for Vertex AI models.
 * Reuses Google's parameters and adds Vertex-specific authentication fields.
 */
export interface VertexLLMParams extends GoogleLLMParams {
  /**
   * Google Cloud Project ID.
   * Required for Vertex AI API calls. Can also be set via VERTEX_PROJECT env variable.
   */
  project?: string;

  /**
   * Google Cloud Location/Region (e.g., 'us-central1').
   * Required for Vertex AI API calls. Can also be set via VERTEX_LOCATION env variable.
   */
  location?: string;
}

export type { GoogleResponse, GoogleStreamChunk } from '../google/types.ts';
