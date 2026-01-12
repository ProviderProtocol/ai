/**
 * API key management strategies for load balancing and dynamic key selection.
 * @module http/keys
 */

import type { ProviderConfig, KeyStrategy } from '../types/provider.ts';
import { ErrorCode, UPPError, type Modality } from '../types/errors.ts';

/**
 * Distributes API requests across multiple keys using round-robin selection.
 *
 * Each call to {@link getKey} returns the next key in sequence, cycling back to
 * the first key after reaching the end. This provides even distribution of requests
 * across all available keys, which is useful for:
 * - Spreading rate limits across multiple API keys
 * - Load balancing between different accounts
 * - Maximizing throughput when multiple keys are available
 *
 * @implements {KeyStrategy}
 *
 * @example
 * ```typescript
 * const keys = new RoundRobinKeys([
 *   'sk-key-1',
 *   'sk-key-2',
 *   'sk-key-3'
 * ]);
 *
 * keys.getKey(); // Returns 'sk-key-1'
 * keys.getKey(); // Returns 'sk-key-2'
 * keys.getKey(); // Returns 'sk-key-3'
 * keys.getKey(); // Returns 'sk-key-1' (cycles back)
 * ```
 */
export class RoundRobinKeys implements KeyStrategy {
  private keys: string[];
  private index = 0;

  /**
   * Creates a new RoundRobinKeys instance.
   *
   * @param keys - Array of API keys to rotate through
   * @throws {Error} When the keys array is empty
   */
  constructor(keys: string[]) {
    if (keys.length === 0) {
      throw new Error('RoundRobinKeys requires at least one key');
    }
    this.keys = keys;
  }

  /**
   * Returns the next key in the rotation sequence.
   *
   * @returns The next API key in round-robin order
   */
  getKey(): string {
    const key = this.keys[this.index]!;
    this.index = (this.index + 1) % this.keys.length;
    return key;
  }
}

/**
 * Selects API keys using weighted random probability.
 *
 * Each key is assigned a weight that determines its probability of being selected.
 * Higher weights mean higher selection probability. This is useful for:
 * - Preferring higher-tier API keys with better rate limits
 * - Gradually migrating traffic between old and new keys
 * - A/B testing different API accounts
 * - Directing more traffic to keys with higher quotas
 *
 * The selection probability for each key is: weight / totalWeight
 *
 * @implements {KeyStrategy}
 *
 * @example
 * ```typescript
 * const keys = new WeightedKeys([
 *   { key: 'sk-premium', weight: 70 },   // 70% of requests
 *   { key: 'sk-standard', weight: 20 },  // 20% of requests
 *   { key: 'sk-backup', weight: 10 }     // 10% of requests
 * ]);
 *
 * // Configure provider with weighted key selection
 * const provider = createOpenAI({
 *   apiKey: keys
 * });
 * ```
 */
export class WeightedKeys implements KeyStrategy {
  private entries: Array<{ key: string; weight: number }>;
  private totalWeight: number;

  /**
   * Creates a new WeightedKeys instance.
   *
   * @param keys - Array of key-weight pairs defining selection probabilities
   * @throws {Error} When the keys array is empty
   */
  constructor(keys: Array<{ key: string; weight: number }>) {
    if (keys.length === 0) {
      throw new Error('WeightedKeys requires at least one key');
    }
    this.entries = keys;
    this.totalWeight = keys.reduce((sum, k) => sum + k.weight, 0);
  }

  /**
   * Returns a randomly selected key based on configured weights.
   *
   * @returns An API key selected with probability proportional to its weight
   */
  getKey(): string {
    const random = Math.random() * this.totalWeight;
    let cumulative = 0;

    for (const entry of this.entries) {
      cumulative += entry.weight;
      if (random <= cumulative) {
        return entry.key;
      }
    }

    return this.entries[this.entries.length - 1]!.key;
  }
}

/**
 * Provides dynamic key selection using custom logic.
 *
 * This strategy delegates key selection to a user-provided function, enabling
 * advanced scenarios such as:
 * - Fetching keys from a secrets manager (AWS Secrets Manager, HashiCorp Vault)
 * - Rotating keys based on external state or configuration
 * - Selecting keys based on request context or time of day
 * - Implementing custom load balancing algorithms
 *
 * The selector function can be synchronous or asynchronous.
 *
 * @implements {KeyStrategy}
 *
 * @example
 * ```typescript
 * // Fetch key from environment based on current mode
 * const dynamicKey = new DynamicKey(() => {
 *   return process.env.NODE_ENV === 'production'
 *     ? process.env.PROD_API_KEY!
 *     : process.env.DEV_API_KEY!;
 * });
 *
 * // Async key fetching from a secrets manager
 * const vaultKey = new DynamicKey(async () => {
 *   const secret = await vault.read('secret/openai');
 *   return secret.data.apiKey;
 * });
 *
 * // Time-based key rotation
 * const timedKey = new DynamicKey(() => {
 *   const hour = new Date().getHours();
 *   return hour < 12 ? morningKey : afternoonKey;
 * });
 * ```
 */
export class DynamicKey implements KeyStrategy {
  private selector: () => string | Promise<string>;

  /**
   * Creates a new DynamicKey instance.
   *
   * @param selector - Function that returns an API key (sync or async)
   */
  constructor(selector: () => string | Promise<string>) {
    this.selector = selector;
  }

  /**
   * Invokes the selector function to retrieve the current key.
   *
   * @returns Promise resolving to the selected API key
   */
  async getKey(): Promise<string> {
    return this.selector();
  }
}

/**
 * Type guard to check if a value implements the KeyStrategy interface.
 *
 * @param value - The value to check
 * @returns True if the value has a getKey method
 */
function isKeyStrategy(value: unknown): value is KeyStrategy {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getKey' in value &&
    typeof (value as KeyStrategy).getKey === 'function'
  );
}

/**
 * Resolves an API key from provider configuration with multiple fallback options.
 *
 * This function handles various key specification methods in priority order:
 * 1. Direct string key in config.apiKey
 * 2. Function returning a key (sync or async) in config.apiKey
 * 3. KeyStrategy instance in config.apiKey (RoundRobinKeys, WeightedKeys, DynamicKey)
 * 4. Environment variable fallback (if envVar parameter is provided)
 *
 * @param config - Provider configuration containing the apiKey option
 * @param envVar - Optional environment variable name to check as fallback
 * @param provider - Provider identifier for error context (default: 'unknown')
 * @param modality - Request modality for error context (default: 'llm')
 * @returns The resolved API key string
 *
 * @throws {UPPError} AUTHENTICATION_FAILED - When no valid key is found
 *
 * @example
 * ```typescript
 * // Direct key in config
 * const key1 = await resolveApiKey({ apiKey: 'sk-...' }, 'OPENAI_API_KEY', 'openai');
 *
 * // Function-based key
 * const key2 = await resolveApiKey({ apiKey: () => getKeyFromVault() }, undefined, 'anthropic');
 *
 * // KeyStrategy instance
 * const key3 = await resolveApiKey({
 *   apiKey: new RoundRobinKeys(['sk-1', 'sk-2', 'sk-3'])
 * }, 'OPENAI_API_KEY', 'openai');
 *
 * // Environment variable fallback
 * const key4 = await resolveApiKey({}, 'ANTHROPIC_API_KEY', 'anthropic');
 * ```
 */
export async function resolveApiKey(
  config: ProviderConfig,
  envVar?: string,
  provider = 'unknown',
  modality: Modality = 'llm'
): Promise<string> {
  const { apiKey } = config;

  if (apiKey !== undefined) {
    if (typeof apiKey === 'string') {
      return apiKey;
    }

    if (typeof apiKey === 'function') {
      return apiKey();
    }

    if (isKeyStrategy(apiKey)) {
      return apiKey.getKey();
    }
  }

  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue) {
      return envValue;
    }
  }

  throw new UPPError(
    envVar
      ? `API key not found. Set ${envVar} environment variable or provide apiKey in config.`
      : 'API key not found. Provide apiKey in config.',
    ErrorCode.AuthenticationFailed,
    provider,
    modality
  );
}
