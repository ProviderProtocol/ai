/**
 * @fileoverview Vertex AI Mistral (partner) LLM handler implementation.
 */

import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { VertexMistralParams, VertexMistralResponse, VertexMistralStreamChunk } from './types.ts';
import {
  transformMistralRequest,
  transformMistralResponse,
  transformMistralStreamChunk,
  createMistralStreamState,
  buildMistralResponseFromState,
} from './transform.mistral.ts';

/**
 * Builds the Vertex AI Mistral endpoint URL.
 */
function buildMistralUrl(
  projectId: string,
  location: string,
  modelId: string,
  streaming: boolean
): string {
  const method = streaming ? 'streamRawPredict' : 'rawPredict';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/mistralai/models/${modelId}:${method}`;
}

const MISTRAL_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates a Vertex AI Mistral LLM handler.
 */
export function createMistralLLMHandler(): LLMHandler<VertexMistralParams> {
  let providerRef: LLMProvider<VertexMistralParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<VertexMistralParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<VertexMistralParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'vertex',
          'llm'
        );
      }

      const model: BoundLLMModel<VertexMistralParams> = {
        modelId,
        capabilities: MISTRAL_CAPABILITIES,

        get provider(): LLMProvider<VertexMistralParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<VertexMistralParams>): Promise<LLMResponse> {
          const accessToken = await resolveApiKey(
            request.config,
            'GOOGLE_ACCESS_TOKEN',
            'vertex',
            'llm'
          );

          const projectId = (request.config as { projectId?: string }).projectId
            ?? process.env.GOOGLE_CLOUD_PROJECT
            ?? process.env.GCLOUD_PROJECT;

          if (!projectId) {
            throw new UPPError(
              'Google Cloud project ID is required. Set config.projectId or GOOGLE_CLOUD_PROJECT env var.',
              'INVALID_REQUEST',
              'vertex',
              'llm'
            );
          }

          const location = (request.config as { location?: string }).location ?? 'us-central1';
          const url = buildMistralUrl(projectId, location, modelId, false);
          const body = transformMistralRequest(request, modelId);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          };

          if (request.config.headers) {
            for (const [key, value] of Object.entries(request.config.headers)) {
              if (value !== undefined) {
                headers[key] = value;
              }
            }
          }

          const response = await doFetch(
            url,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: request.signal,
            },
            request.config,
            'vertex',
            'llm'
          );

          const data = (await response.json()) as VertexMistralResponse;
          return transformMistralResponse(data);
        },

        stream(request: LLMRequest<VertexMistralParams>): LLMStreamResult {
          const state = createMistralStreamState();
          let responseResolve: (value: LLMResponse) => void;
          let responseReject: (error: Error) => void;

          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            responseResolve = resolve;
            responseReject = reject;
          });

          async function* generateEvents(): AsyncGenerator<StreamEvent, void, unknown> {
            try {
              const accessToken = await resolveApiKey(
                request.config,
                'GOOGLE_ACCESS_TOKEN',
                'vertex',
                'llm'
              );

              const projectId = (request.config as { projectId?: string }).projectId
                ?? process.env.GOOGLE_CLOUD_PROJECT
                ?? process.env.GCLOUD_PROJECT;

              if (!projectId) {
                throw new UPPError(
                  'Google Cloud project ID is required. Set config.projectId or GOOGLE_CLOUD_PROJECT env var.',
                  'INVALID_REQUEST',
                  'vertex',
                  'llm'
                );
              }

              const location = (request.config as { location?: string }).location ?? 'us-central1';
              const url = buildMistralUrl(projectId, location, modelId, true);
              const body = transformMistralRequest(request, modelId);
              body.stream = true;

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              };

              if (request.config.headers) {
                for (const [key, value] of Object.entries(request.config.headers)) {
                  if (value !== undefined) {
                    headers[key] = value;
                  }
                }
              }

              const response = await doStreamFetch(
                url,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(body),
                  signal: request.signal,
                },
                request.config,
                'vertex',
                'llm'
              );

              if (!response.ok) {
                const error = await normalizeHttpError(response, 'vertex', 'llm');
                responseReject(error);
                throw error;
              }

              if (!response.body) {
                const error = new UPPError(
                  'No response body for streaming request',
                  'PROVIDER_ERROR',
                  'vertex',
                  'llm'
                );
                responseReject(error);
                throw error;
              }

              for await (const data of parseSSEStream(response.body)) {
                if (data === '[DONE]') {
                  break;
                }

                if (typeof data === 'object' && data !== null) {
                  const chunk = data as VertexMistralStreamChunk;
                  const uppEvent = transformMistralStreamChunk(chunk, state);
                  if (uppEvent) {
                    yield uppEvent;
                  }
                }
              }

              responseResolve(buildMistralResponseFromState(state));
            } catch (error) {
              responseReject(error as Error);
              throw error;
            }
          }

          return {
            [Symbol.asyncIterator]() {
              return generateEvents();
            },
            response: responsePromise,
          };
        },
      };

      return model;
    },
  };
}
