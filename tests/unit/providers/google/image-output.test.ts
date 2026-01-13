import { describe, expect, test } from 'bun:test';
import { llm } from '../../../../src/index.ts';
import { google } from '../../../../src/google/index.ts';
import { StreamEventType } from '../../../../src/types/stream.ts';
import {
  transformRequest,
  transformResponse,
  transformStreamChunk,
  createStreamState,
  buildResponseFromState,
} from '../../../../src/providers/google/transform.ts';
import type { GoogleLLMParams, GoogleResponse, GoogleStreamChunk } from '../../../../src/providers/google/types.ts';

describe('Google Gemini image output (response modalities)', () => {
  test('llm capabilities include imageOutput', () => {
    const model = llm<GoogleLLMParams>({
      model: google('gemini-2.5-flash-image'),
    });

    expect(model.capabilities.imageOutput).toBe(true);
  });

  test('transformRequest forwards responseModalities and imageConfig', () => {
    const params: GoogleLLMParams = {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '1024x1024',
      },
    };

    const request = transformRequest(
      {
        messages: [],
        params,
        config: { apiKey: 'test' },
      },
      'gemini-2.5-flash-image'
    );

    expect(request.generationConfig?.responseModalities).toEqual(['TEXT', 'IMAGE']);
    expect(request.generationConfig?.imageConfig).toEqual({
      aspectRatio: '1:1',
      imageSize: '1024x1024',
    });
  });

  test('transformResponse maps inlineData to ImageBlock', () => {
    const googleResponse: GoogleResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            inlineData: {
              mimeType: 'image/png',
              data: 'aGVsbG8=',
            },
          }],
        },
        finishReason: 'STOP',
        index: 0,
      }],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 10,
        totalTokenCount: 15,
      },
    };

    const response = transformResponse(googleResponse);
    const images = response.message.images;

    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe('image/png');
    expect(images[0]?.source.type).toBe('base64');
    if (images[0]?.source.type === 'base64') {
      expect(images[0].source.data).toBe('aGVsbG8=');
    }
  });

  test('transformStreamChunk accumulates inlineData and emits ImageDelta', () => {
    const state = createStreamState();
    state.isFirstChunk = false;

    const chunk: GoogleStreamChunk = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            inlineData: {
              mimeType: 'image/png',
              data: 'aGVsbG8=',
            },
          }],
        },
        finishReason: 'STOP',
        index: 0,
      }],
    };

    const events = transformStreamChunk(chunk, state);
    const imageEvent = events.find((event) => event.type === StreamEventType.ImageDelta);

    expect(state.images).toHaveLength(1);
    expect(imageEvent).toBeDefined();
    expect(imageEvent?.delta.data).toBeInstanceOf(Uint8Array);

    const response = buildResponseFromState(state);
    const images = response.message.images;
    expect(images).toHaveLength(1);
  });
});
