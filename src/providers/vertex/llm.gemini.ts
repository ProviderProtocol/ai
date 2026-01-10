/**
 * @fileoverview Vertex AI Gemini LLM handler implementation.
 */

import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import type { VertexGeminiParams, VertexGeminiResponse, VertexGeminiStreamChunk } from './types.ts';
import {
  transformGeminiRequest,
  transformGeminiResponse,
  transformGeminiStreamChunk,
  createGeminiStreamState,
  buildGeminiResponseFromState,
} from './transform.gemini.ts';
import { getProjectId, getLocation, mergeCustomHeaders } from './config.ts';

/**
 * Authentication mode for Vertex AI Gemini.
 */
type GeminiAuthMode = 'api_key' | 'oauth';

/**
 * Builds the Vertex AI Gemini endpoint URL.
 *
 * Three URL formats are supported:
 * 1. API Key (Express Mode): `https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent?key=API_KEY`
 * 2. OAuth (global): `https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{model}:generateContent`
 * 3. OAuth (regional): `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`
 */
function buildGeminiUrl(
  modelId: string,
  streaming: boolean,
  authMode: GeminiAuthMode,
  apiKey?: string,
  projectId?: string,
  location?: string
): string {
  const method = streaming ? 'streamGenerateContent' : 'generateContent';

  if (authMode === 'api_key' && apiKey) {
    const altParam = streaming ? '&alt=sse' : '';
    return `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelId}:${method}?key=${apiKey}${altParam}`;
  }

  const loc = location ?? 'global';
  const altParam = streaming ? '?alt=sse' : '';

  // Global location uses aiplatform.googleapis.com without region prefix
  if (loc === 'global') {
    return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${modelId}:${method}${altParam}`;
  }

  // Regional locations use {location}-aiplatform.googleapis.com
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${loc}/publishers/google/models/${modelId}:${method}${altParam}`;
}

const GEMINI_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: true,
  audioInput: true,
};

/**
 * Creates a Vertex AI Gemini LLM handler.
 */
export function createGeminiLLMHandler(): LLMHandler<VertexGeminiParams> {
  let providerRef: LLMProvider<VertexGeminiParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<VertexGeminiParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<VertexGeminiParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'vertex',
          'llm'
        );
      }

      const model: BoundLLMModel<VertexGeminiParams> = {
        modelId,
        capabilities: GEMINI_CAPABILITIES,

        get provider(): LLMProvider<VertexGeminiParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<VertexGeminiParams>): Promise<LLMResponse> {
          const apiKey = await resolveApiKey(
            request.config,
            'VERTEX_API_KEY',
            'vertex',
            'llm'
          ).catch(() => undefined);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          let url: string;

          if (apiKey) {
            url = buildGeminiUrl(modelId, false, 'api_key', apiKey);
          } else {
            const accessToken = await resolveApiKey(
              request.config,
              'GOOGLE_ACCESS_TOKEN',
              'vertex',
              'llm'
            );

            const projectId = getProjectId(request.config, true);
            const location = getLocation(request.config, 'global');
            url = buildGeminiUrl(modelId, false, 'oauth', undefined, projectId, location);
            headers['Authorization'] = `Bearer ${accessToken}`;
          }

          const body = transformGeminiRequest(request, modelId);
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

          const data = (await response.json()) as VertexGeminiResponse;
          return transformGeminiResponse(data);
        },

        stream(request: LLMRequest<VertexGeminiParams>): LLMStreamResult {
          const state = createGeminiStreamState();
          let responseResolve: (value: LLMResponse) => void;
          let responseReject: (error: Error) => void;

          const responsePromise = new Promise<LLMResponse>((resolve, reject) => {
            responseResolve = resolve;
            responseReject = reject;
          });

          async function* generateEvents(): AsyncGenerator<StreamEvent, void, unknown> {
            try {
              const apiKey = await resolveApiKey(
                request.config,
                'VERTEX_API_KEY',
                'vertex',
                'llm'
              ).catch(() => undefined);

              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };

              let url: string;

              if (apiKey) {
                url = buildGeminiUrl(modelId, true, 'api_key', apiKey);
              } else {
                const accessToken = await resolveApiKey(
                  request.config,
                  'GOOGLE_ACCESS_TOKEN',
                  'vertex',
                  'llm'
                );

                const projectId = getProjectId(request.config, true);
                const location = getLocation(request.config, 'global');
                url = buildGeminiUrl(modelId, true, 'oauth', undefined, projectId, location);
                headers['Authorization'] = `Bearer ${accessToken}`;
              }

              const body = transformGeminiRequest(request, modelId);
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
                if (typeof data === 'object' && data !== null) {
                  const chunk = data as VertexGeminiStreamChunk;
                  const events = transformGeminiStreamChunk(chunk, state);
                  for (const event of events) {
                    yield event;
                  }
                }
              }

              responseResolve(buildGeminiResponseFromState(state));
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
