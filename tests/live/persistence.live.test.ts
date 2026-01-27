import { test, expect, describe } from 'bun:test';
import { llm } from '../../src/index.ts';
import { anthropic } from '../../src/anthropic/index.ts';
import type { AnthropicLLMParams } from '../../src/anthropic/index.ts';
import { persistenceMiddleware, PersistenceAdapter } from '../../src/middleware/persistence.ts';
import type { ThreadJSON } from '../../src/types/thread.ts';

/**
 * Live API tests for persistence middleware using Anthropic.
 * Requires ANTHROPIC_API_KEY environment variable.
 */
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Persistence Middleware Live (Anthropic)', () => {
  test('persists and reloads thread between calls', async () => {
    const store = new Map<string, ThreadJSON>();
    const adapter = new PersistenceAdapter({
      id: 'persistence-live',
      load: async (id) => store.get(id) ?? null,
      save: async (id, thread) => {
        store.set(id, thread.toJSON());
      },
    });

    const claude = llm<AnthropicLLMParams>({
      model: anthropic('claude-3-5-haiku-latest'),
      params: { max_tokens: 64 },
      middleware: [persistenceMiddleware({ adapter })],
    });

    const turn1 = await claude.generate('My name is Sam. Reply with just "OK".');

    expect(turn1.response.text.length).toBeGreaterThan(0);
    expect(store.get('persistence-live')).toBeDefined();

    const turn2 = await claude.generate('What is my name? Reply with just the name.');

    expect(turn2.response.text.toLowerCase()).toContain('sam');
  });
});
