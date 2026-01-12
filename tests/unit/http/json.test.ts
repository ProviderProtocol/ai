import { describe, expect, test } from 'bun:test';
import { parseJsonResponse } from '../../../src/http/json.ts';
import { UPPError } from '../../../src/types/errors.ts';

describe('parseJsonResponse', () => {
  test('parses valid JSON responses', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const data = await parseJsonResponse<{ ok: boolean }>(response, 'mock', 'llm');
    expect(data.ok).toBe(true);
  });

  test('throws INVALID_RESPONSE on invalid JSON', async () => {
    const response = new Response('not-json', { status: 200 });
    await expect(
      parseJsonResponse<Record<string, unknown>>(response, 'mock', 'llm')
    ).rejects.toBeInstanceOf(UPPError);
  });

  test('throws INVALID_RESPONSE on empty body', async () => {
    const response = new Response('', { status: 200 });
    await expect(
      parseJsonResponse<Record<string, unknown>>(response, 'mock', 'llm')
    ).rejects.toBeInstanceOf(UPPError);
  });
});
