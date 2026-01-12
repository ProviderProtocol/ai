import { test, expect } from 'bun:test';
import { toError } from '../../../src/utils/error.ts';

test('toError uses message property when present', () => {
  const err = toError({ message: 'boom' });
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toBe('boom');
});

test('toError passes through Error instances', () => {
  const original = new Error('original');
  const err = toError(original);
  expect(err).toBe(original);
});

test('toError converts string values', () => {
  const err = toError('string error');
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toBe('string error');
});

test('toError handles null and undefined', () => {
  const nullErr = toError(null);
  const undefinedErr = toError(undefined);
  expect(nullErr.message).toBe('null');
  expect(undefinedErr.message).toBe('undefined');
});
