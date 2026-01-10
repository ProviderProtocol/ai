/**
 * @fileoverview Vertex AI MaaS (Model-as-a-Service) LLM handler implementation.
 *
 * Handles OpenAI-compatible models available through Vertex AI:
 * - DeepSeek (deepseek-ai/deepseek-r1-0528-maas, etc.)
 * - GPT-OSS (openai/gpt-oss-120b-maas)
 * - Other OpenAI-compatible MaaS models
 */

import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { VertexMaaSParams, VertexMaaSResponse, VertexMaaSStreamChunk } from './types.ts';
import {
  transformMaaSRequest,
  transformMaaSResponse,
  transformMaaSStreamChunk,
  createMaaSStreamState,
  buildMaaSResponseFromState,
} from './transform.maas.ts';
import { getProjectId, getLocationStrict, mergeCustomHeaders } from './config.ts';

/**
 * Builds the Vertex AI MaaS endpoint URL.
 *
 * MaaS uses an OpenAI-compatible endpoint structure.
 */
function buildMaaSUrl(
  projectId: string,
  location: string
): string {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/endpoints/openapi/chat/completions`;
}

const MAAS_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: false,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates a Vertex AI MaaS LLM handler.
 */
export function createMaaSLLMHandler(): LLMHandler<VertexMaaSParams> {
  let providerRef: LLMProvider<VertexMaaSParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<VertexMaaSParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<VertexMaaSParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'vertex',
          'llm'
        );
      }

      const model: BoundLLMModel<VertexMaaSParams> = {
        modelId,
        capabilities: MAAS_CAPABILITIES,

        get provider(): LLMProvider<VertexMaaSParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<VertexMaaSParams>): Promise<LLMResponse> {
          const accessToken = await resolveApiKey(
            request.config,
            'GOOGLE_ACCESS_TOKEN',
            'vertex',
            'llm'
          );

          const projectId = getProjectId(request.config, true);
          const location = getLocationStrict(request.config, 'us-central1');
          const url = buildMaaSUrl(projectId, location);
          const body = transformMaaSRequest(request, modelId);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          };
          mergeCustomHeaders(headers, request.config);

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

          const data = (await response.json()) as VertexMaaSResponse;
          return transformMaaSResponse(data);
        },

        stream(request: LLMRequest<VertexMaaSParams>): LLMStreamResult {
          const state = createMaaSStreamState();
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

              const projectId = getProjectId(request.config, true);
              const location = getLocationStrict(request.config, 'us-central1');
              const url = buildMaaSUrl(projectId, location);
              const body = transformMaaSRequest(request, modelId);
              body.stream = true;
              body.stream_options = { include_usage: true };

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              };
              mergeCustomHeaders(headers, request.config);

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
                  const chunk = data as VertexMaaSStreamChunk;
                  const uppEvent = transformMaaSStreamChunk(chunk, state);
                  if (uppEvent) {
                    yield uppEvent;
                  }
                }
              }

              responseResolve(buildMaaSResponseFromState(state));
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
