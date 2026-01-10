/**
 * @fileoverview Vertex AI Claude (Anthropic partner) LLM handler implementation.
 */

import type { LLMHandler, BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
import type { StreamEvent } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { UPPError } from '../../types/errors.ts';
import type { VertexClaudeParams, VertexClaudeResponse, VertexClaudeStreamEvent } from './types.ts';
import {
  transformClaudeRequest,
  transformClaudeResponse,
  transformClaudeStreamEvent,
  createClaudeStreamState,
  buildClaudeResponseFromState,
} from './transform.claude.ts';
import { getProjectId, getLocation, mergeCustomHeaders } from './config.ts';

/**
 * Builds the Vertex AI Claude endpoint URL.
 *
 * When location is 'global', uses the base aiplatform.googleapis.com endpoint.
 * Otherwise uses the regional endpoint {location}-aiplatform.googleapis.com.
 */
function buildClaudeUrl(
  projectId: string,
  location: string,
  modelId: string,
  streaming: boolean
): string {
  const method = streaming ? 'streamRawPredict' : 'rawPredict';
  const endpoint = location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
  return `https://${endpoint}/v1/projects/${projectId}/locations/${location}/publishers/anthropic/models/${modelId}:${method}`;
}

const CLAUDE_CAPABILITIES: LLMCapabilities = {
  streaming: true,
  tools: true,
  structuredOutput: true,
  imageInput: true,
  videoInput: false,
  audioInput: false,
};

/**
 * Creates a Vertex AI Claude LLM handler.
 */
export function createClaudeLLMHandler(): LLMHandler<VertexClaudeParams> {
  let providerRef: LLMProvider<VertexClaudeParams> | null = null;

  return {
    _setProvider(provider: LLMProvider<VertexClaudeParams>) {
      providerRef = provider;
    },

    bind(modelId: string): BoundLLMModel<VertexClaudeParams> {
      if (!providerRef) {
        throw new UPPError(
          'Provider reference not set. Handler must be used with createProvider().',
          'INVALID_REQUEST',
          'vertex',
          'llm'
        );
      }

      const model: BoundLLMModel<VertexClaudeParams> = {
        modelId,
        capabilities: CLAUDE_CAPABILITIES,

        get provider(): LLMProvider<VertexClaudeParams> {
          return providerRef!;
        },

        async complete(request: LLMRequest<VertexClaudeParams>): Promise<LLMResponse> {
          const accessToken = await resolveApiKey(
            request.config,
            'GOOGLE_ACCESS_TOKEN',
            'vertex',
            'llm'
          );

          const projectId = getProjectId(request.config, true);
          const location = getLocation(request.config, 'us-central1');
          const url = buildClaudeUrl(projectId, location, modelId, false);
          const body = transformClaudeRequest(request, modelId);

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

          const data = (await response.json()) as VertexClaudeResponse;
          return transformClaudeResponse(data);
        },

        stream(request: LLMRequest<VertexClaudeParams>): LLMStreamResult {
          const state = createClaudeStreamState();
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
              const location = getLocation(request.config, 'us-central1');
              const url = buildClaudeUrl(projectId, location, modelId, true);
              const body = transformClaudeRequest(request, modelId);
              body.stream = true;

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
                if (typeof data === 'object' && data !== null && 'type' in data) {
                  const event = data as VertexClaudeStreamEvent;

                  if (event.type === 'error') {
                    const error = new UPPError(
                      event.error.message,
                      'PROVIDER_ERROR',
                      'vertex',
                      'llm'
                    );
                    responseReject(error);
                    throw error;
                  }

                  const uppEvent = transformClaudeStreamEvent(event, state);
                  if (uppEvent) {
                    yield uppEvent;
                  }
                }
              }

              responseResolve(buildClaudeResponseFromState(state));
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
