import type { BoundLLMModel, LLMRequest, LLMResponse, LLMStreamResult, LLMCapabilities } from '../../types/llm.ts';
declare const process: { env: Record<string, string | undefined> };
import type { LLMHandler } from '../../types/provider.ts';
import type { StreamEvent } from '../../types/stream.ts';
import { StreamEventType, objectDelta } from '../../types/stream.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { UPPError, ErrorCode, ModalityType } from '../../types/errors.ts';
import { resolveApiKey } from '../../http/keys.ts';
import { doFetch, doStreamFetch } from '../../http/fetch.ts';
import { parseSSEStream } from '../../http/sse.ts';
import { normalizeHttpError } from '../../http/errors.ts';
import { parseJsonResponse } from '../../http/json.ts';
import { toError } from '../../utils/error.ts';
import type { VertexLLMParams, GoogleResponse, GoogleStreamChunk } from './types.ts';
import {
    transformRequest,
    transformResponse,
    transformStreamChunk,
    createStreamState,
    buildResponseFromState,
} from '../google/transform.ts';

/**
 * Capability flags for Vertex AI models.
 * Similar to Google Gemini models.
 */
const VERTEX_CAPABILITIES: LLMCapabilities = {
    streaming: true,
    tools: true,
    structuredOutput: true,
    imageInput: true,
    documentInput: true,
    videoInput: true,
    audioInput: true,
    imageOutput: true,
};

/**
 * Constructs the Vertex AI API endpoint URL.
 */
function buildUrl(
    project: string,
    location: string,
    modelId: string,
    action: 'generateContent' | 'streamGenerateContent'
): string {
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${modelId}:${action}`;
}

/**
 * Creates an LLM handler for Vertex AI models.
 */
export function createLLMHandler(): LLMHandler<VertexLLMParams> {
    let providerRef: LLMProvider<VertexLLMParams> | null = null;

    return {
        _setProvider(provider: LLMProvider<VertexLLMParams>) {
            providerRef = provider;
        },

        bind(modelId: string): BoundLLMModel<VertexLLMParams> {
            if (!providerRef) {
                throw new UPPError(
                    'Provider reference not set. Handler must be used with createProvider().',
                    ErrorCode.InvalidRequest,
                    'vertex',
                    ModalityType.LLM
                );
            }

            const model: BoundLLMModel<VertexLLMParams> = {
                modelId,
                capabilities: VERTEX_CAPABILITIES,

                get provider(): LLMProvider<VertexLLMParams> {
                    return providerRef!;
                },

                async complete(request: LLMRequest<VertexLLMParams>): Promise<LLMResponse> {
                    const accessToken = await resolveApiKey(
                        request.config,
                        'VERTEX_TOKEN',
                        'vertex',
                        'llm'
                    );

                    const project = request.params?.project || process.env.VERTEX_PROJECT;
                    const location = request.params?.location || process.env.VERTEX_LOCATION || 'us-central1';

                    if (!project) {
                        throw new UPPError(
                            'Vertex Project ID not found. Set VERTEX_PROJECT environment variable or provide project in params.',
                            ErrorCode.InvalidRequest,
                            'vertex',
                            ModalityType.LLM
                        );
                    }

                    const url = request.config.baseUrl
                        ? `${request.config.baseUrl}/models/${modelId}:generateContent`
                        : buildUrl(project, location, modelId, 'generateContent');

                    const body = transformRequest(request as any, modelId);

                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
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

                    const data = await parseJsonResponse<GoogleResponse>(response, 'vertex', 'llm');
                    return transformResponse(data);
                },

                stream(request: LLMRequest<VertexLLMParams>): LLMStreamResult {
                    const state = createStreamState();
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
                                'VERTEX_TOKEN',
                                'vertex',
                                'llm'
                            );

                            const project = request.params?.project || process.env.VERTEX_PROJECT;
                            const location = request.params?.location || process.env.VERTEX_LOCATION || 'us-central1';

                            if (!project) {
                                throw new UPPError(
                                    'Vertex Project ID not found. Set VERTEX_PROJECT environment variable or provide project in params.',
                                    ErrorCode.InvalidRequest,
                                    'vertex',
                                    ModalityType.LLM
                                );
                            }

                            const url = request.config.baseUrl
                                ? `${request.config.baseUrl}/models/${modelId}:streamGenerateContent?alt=sse`
                                : `${buildUrl(project, location, modelId, 'streamGenerateContent')}?alt=sse`;

                            const body = transformRequest(request as any, modelId);

                            const headers: Record<string, string> = {
                                'Content-Type': 'application/json',
                                Accept: 'text/event-stream',
                                Authorization: `Bearer ${accessToken}`,
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
                                    ErrorCode.ProviderError,
                                    'vertex',
                                    ModalityType.LLM
                                );
                                responseReject(error);
                                throw error;
                            }

                            for await (const data of parseSSEStream(response.body)) {
                                if (typeof data === 'object' && data !== null) {
                                    const chunk = data as GoogleStreamChunk;

                                    if (chunk.error) {
                                        const error = new UPPError(
                                            chunk.error.message,
                                            ErrorCode.ProviderError,
                                            'vertex',
                                            ModalityType.LLM
                                        );
                                        responseReject(error);
                                        throw error;
                                    }

                                    const events = transformStreamChunk(chunk, state);
                                    for (const event of events) {
                                        yield event;
                                        if (request.structure && event.type === StreamEventType.TextDelta) {
                                            yield objectDelta(event.delta.text ?? '', event.index);
                                        }
                                    }
                                }
                            }

                            responseResolve(buildResponseFromState(state));
                        } catch (error) {
                            const err = toError(error);
                            responseReject(err);
                            throw err;
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
