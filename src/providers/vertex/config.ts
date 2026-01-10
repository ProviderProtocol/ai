/**
 * @fileoverview Vertex AI configuration helpers.
 *
 * Provides typed accessors for Vertex-specific configuration values
 * from ProviderConfig objects, reducing boilerplate type assertions
 * across handlers.
 */

import type { ProviderConfig } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';

/**
 * Extended provider config with Vertex-specific fields.
 */
interface VertexConfig extends ProviderConfig {
  projectId?: string;
  location?: string;
}

/**
 * Extracts the Google Cloud project ID from config or environment variables.
 *
 * @param config - Provider configuration object
 * @param required - Whether to throw an error if project ID is not found
 * @returns The project ID or undefined if not required and not found
 * @throws UPPError if required and project ID is not configured
 */
export function getProjectId(config: ProviderConfig, required?: false): string | undefined;
export function getProjectId(config: ProviderConfig, required: true): string;
export function getProjectId(config: ProviderConfig, required = false): string | undefined {
  const vertexConfig = config as VertexConfig;
  const projectId = vertexConfig.projectId
    ?? process.env.GOOGLE_CLOUD_PROJECT
    ?? process.env.GCLOUD_PROJECT;

  if (required && !projectId) {
    throw new UPPError(
      'Google Cloud project ID is required. Set config.projectId or GOOGLE_CLOUD_PROJECT env var.',
      'INVALID_REQUEST',
      'vertex',
      'llm'
    );
  }

  return projectId;
}

/**
 * Extracts the Google Cloud location from config or environment variables.
 *
 * Note: This function checks config.location first, then env vars, then the default.
 * For handlers that require specific regional locations (Mistral, MaaS),
 * use `getLocationStrict` instead which ignores env vars.
 *
 * @param config - Provider configuration object
 * @param defaultLocation - Default location if not specified (defaults to 'global')
 * @returns The location string
 */
export function getLocation(config: ProviderConfig, defaultLocation = 'global'): string {
  const vertexConfig = config as VertexConfig;
  return vertexConfig.location
    ?? process.env.GOOGLE_CLOUD_LOCATION
    ?? process.env.VERTEX_LOCATION
    ?? defaultLocation;
}

/**
 * Extracts the Google Cloud location from config only, ignoring environment variables.
 *
 * This is used by handlers that require specific regional locations (like Mistral and MaaS)
 * which don't work with the 'global' endpoint that Gemini supports.
 *
 * @param config - Provider configuration object
 * @param defaultLocation - Default location if not specified
 * @returns The location string
 */
export function getLocationStrict(config: ProviderConfig, defaultLocation: string): string {
  const vertexConfig = config as VertexConfig;
  return vertexConfig.location ?? defaultLocation;
}

/**
 * Merges custom headers from config into a headers object.
 *
 * @param headers - Base headers object to merge into
 * @param config - Provider configuration containing optional custom headers
 */
export function mergeCustomHeaders(headers: Record<string, string>, config: ProviderConfig): void {
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }
  }
}
