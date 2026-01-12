import { test, expect } from 'bun:test';
import {
  statusToErrorCode,
  normalizeHttpError,
  networkError,
  timeoutError,
  cancelledError,
} from '../../../src/http/errors.ts';
import { UPPError } from '../../../src/types/errors.ts';

test('statusToErrorCode maps 402 to QUOTA_EXCEEDED', () => {
  expect(statusToErrorCode(402)).toBe('QUOTA_EXCEEDED');
});

test('statusToErrorCode maps 422 to INVALID_REQUEST', () => {
  expect(statusToErrorCode(422)).toBe('INVALID_REQUEST');
});

test('statusToErrorCode maps 451 to CONTENT_FILTERED', () => {
  expect(statusToErrorCode(451)).toBe('CONTENT_FILTERED');
});

test('statusToErrorCode maps 409 to INVALID_REQUEST', () => {
  expect(statusToErrorCode(409)).toBe('INVALID_REQUEST');
});

test('normalizeHttpError extracts message from nested error', async () => {
  const response = new Response(JSON.stringify({ error: { message: 'bad request' } }), {
    status: 400,
    statusText: 'Bad Request',
  });

  const error = await normalizeHttpError(response, 'mock', 'llm');
  expect(error).toBeInstanceOf(UPPError);
  expect(error.message).toBe('bad request');
  expect(error.code).toBe('INVALID_REQUEST');
  expect(error.statusCode).toBe(400);
});

test('normalizeHttpError uses detail field when present', async () => {
  const response = new Response(JSON.stringify({ detail: 'nope' }), {
    status: 422,
    statusText: 'Unprocessable Entity',
  });

  const error = await normalizeHttpError(response, 'mock', 'llm');
  expect(error.message).toBe('nope');
  expect(error.code).toBe('INVALID_REQUEST');
});

test('normalizeHttpError falls back to plain text body', async () => {
  const response = new Response('plain error', {
    status: 500,
    statusText: 'Server Error',
  });

  const error = await normalizeHttpError(response, 'mock', 'llm');
  expect(error.message).toBe('plain error');
  expect(error.code).toBe('PROVIDER_ERROR');
});

test('networkError wraps underlying error', () => {
  const error = networkError(new Error('offline'), 'mock', 'llm');
  expect(error).toBeInstanceOf(UPPError);
  expect(error.code).toBe('NETWORK_ERROR');
  expect(error.message).toContain('offline');
});

test('timeoutError reports timeout duration', () => {
  const error = timeoutError(1500, 'mock', 'llm');
  expect(error).toBeInstanceOf(UPPError);
  expect(error.code).toBe('TIMEOUT');
  expect(error.message).toContain('1500');
});

test('cancelledError returns CANCELLED code', () => {
  const error = cancelledError('mock', 'llm');
  expect(error).toBeInstanceOf(UPPError);
  expect(error.code).toBe('CANCELLED');
});
