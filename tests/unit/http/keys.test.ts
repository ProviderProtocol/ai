import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  resolveApiKey,
  RoundRobinKeys,
  WeightedKeys,
  DynamicKey,
} from '../../../src/http/keys.ts';
import { UPPError, ErrorCode } from '../../../src/types/errors.ts';

describe('RoundRobinKeys', () => {
  test('cycles through keys', () => {
    const strategy = new RoundRobinKeys(['key1', 'key2', 'key3']);
    expect(strategy.getKey()).toBe('key1');
    expect(strategy.getKey()).toBe('key2');
    expect(strategy.getKey()).toBe('key3');
    expect(strategy.getKey()).toBe('key1');
  });

  test('throws on empty array', () => {
    expect(() => new RoundRobinKeys([])).toThrow();
  });

  test('works with single key', () => {
    const strategy = new RoundRobinKeys(['only']);
    expect(strategy.getKey()).toBe('only');
    expect(strategy.getKey()).toBe('only');
  });
});

describe('WeightedKeys', () => {
  test('returns keys based on weight', () => {
    const strategy = new WeightedKeys([
      { key: 'heavy', weight: 100 },
      { key: 'light', weight: 0 },
    ]);
    // Heavy should always be selected
    for (let i = 0; i < 10; i++) {
      expect(strategy.getKey()).toBe('heavy');
    }
  });

  test('throws on empty array', () => {
    expect(() => new WeightedKeys([])).toThrow();
  });
});

describe('DynamicKey', () => {
  test('calls selector function', async () => {
    let calls = 0;
    const strategy = new DynamicKey(() => {
      calls++;
      return `key-${calls}`;
    });

    expect(await strategy.getKey()).toBe('key-1');
    expect(await strategy.getKey()).toBe('key-2');
  });

  test('supports async selector', async () => {
    const strategy = new DynamicKey(async () => {
      return 'async-key';
    });
    expect(await strategy.getKey()).toBe('async-key');
  });
});

describe('resolveApiKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('resolves string key', async () => {
    const key = await resolveApiKey({ apiKey: 'test-key' });
    expect(key).toBe('test-key');
  });

  test('resolves function key', async () => {
    const key = await resolveApiKey({ apiKey: () => 'func-key' });
    expect(key).toBe('func-key');
  });

  test('resolves async function key', async () => {
    const key = await resolveApiKey({ apiKey: async () => 'async-key' });
    expect(key).toBe('async-key');
  });

  test('resolves KeyStrategy', async () => {
    const key = await resolveApiKey({
      apiKey: new RoundRobinKeys(['strategy-key']),
    });
    expect(key).toBe('strategy-key');
  });

  test('falls back to env var', async () => {
    process.env.TEST_API_KEY = 'env-key';
    const key = await resolveApiKey({}, 'TEST_API_KEY');
    expect(key).toBe('env-key');
  });

  test('throws when no key found', async () => {
    try {
      await resolveApiKey({}, 'NONEXISTENT_KEY');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      expect((error as UPPError).code).toBe(ErrorCode.AuthenticationFailed);
    }
  });

  test('config takes precedence over env', async () => {
    process.env.TEST_KEY = 'env-value';
    const key = await resolveApiKey({ apiKey: 'config-value' }, 'TEST_KEY');
    expect(key).toBe('config-value');
  });
});
