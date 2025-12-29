import type { ProviderConfig, KeyStrategy } from '../types/provider.ts';
import { UPPError, type Modality } from '../types/errors.ts';

/**
 * Round-robin through a list of API keys
 */
export class RoundRobinKeys implements KeyStrategy {
  private keys: string[];
  private index = 0;

  constructor(keys: string[]) {
    if (keys.length === 0) {
      throw new Error('RoundRobinKeys requires at least one key');
    }
    this.keys = keys;
  }

  getKey(): string {
    const key = this.keys[this.index]!;
    this.index = (this.index + 1) % this.keys.length;
    return key;
  }
}

/**
 * Weighted random selection of API keys
 */
export class WeightedKeys implements KeyStrategy {
  private entries: Array<{ key: string; weight: number }>;
  private totalWeight: number;

  constructor(keys: Array<{ key: string; weight: number }>) {
    if (keys.length === 0) {
      throw new Error('WeightedKeys requires at least one key');
    }
    this.entries = keys;
    this.totalWeight = keys.reduce((sum, k) => sum + k.weight, 0);
  }

  getKey(): string {
    const random = Math.random() * this.totalWeight;
    let cumulative = 0;

    for (const entry of this.entries) {
      cumulative += entry.weight;
      if (random <= cumulative) {
        return entry.key;
      }
    }

    // Fallback to last key (shouldn't happen)
    return this.entries[this.entries.length - 1]!.key;
  }
}

/**
 * Dynamic key selection based on custom logic
 */
export class DynamicKey implements KeyStrategy {
  private selector: () => string | Promise<string>;

  constructor(selector: () => string | Promise<string>) {
    this.selector = selector;
  }

  async getKey(): Promise<string> {
    return this.selector();
  }
}

/**
 * Check if a value is a KeyStrategy
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
 * Resolve API key from ProviderConfig
 * Falls back to environment variable if provided and config.apiKey is not set
 * Throws UPPError with AUTHENTICATION_FAILED if no key is available
 *
 * @param config - Provider configuration
 * @param envVar - Environment variable name to check as fallback
 * @param provider - Provider name for error messages
 * @param modality - Modality for error messages
 */
export async function resolveApiKey(
  config: ProviderConfig,
  envVar?: string,
  provider = 'unknown',
  modality: Modality = 'llm'
): Promise<string> {
  const { apiKey } = config;

  // If apiKey is provided in config
  if (apiKey !== undefined) {
    // String
    if (typeof apiKey === 'string') {
      return apiKey;
    }

    // Function
    if (typeof apiKey === 'function') {
      return apiKey();
    }

    // KeyStrategy
    if (isKeyStrategy(apiKey)) {
      return apiKey.getKey();
    }
  }

  // Try environment variable
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue) {
      return envValue;
    }
  }

  // No key found
  throw new UPPError(
    envVar
      ? `API key not found. Set ${envVar} environment variable or provide apiKey in config.`
      : 'API key not found. Provide apiKey in config.',
    'AUTHENTICATION_FAILED',
    provider,
    modality
  );
}
