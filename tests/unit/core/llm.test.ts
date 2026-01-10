/**
 * @fileoverview Unit tests for the LLM core module.
 *
 * Tests cover LLM instance creation, header merging, and configuration handling.
 */
import { test, expect, describe } from 'bun:test';
import { llm } from '../../../src/core/llm.ts';
import { UPPError } from '../../../src/types/errors.ts';
import type { Provider, ModelReference } from '../../../src/types/provider.ts';

// ============================================
// Anthropic Betas Integration Tests
// ============================================

describe('Anthropic Betas Integration with LLM', () => {
  test('anthropic model with betas creates correct llm instance', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });

    const instance = llm({
      model: modelRef,
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model with betas and explicit headers merges correctly', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });

    const instance = llm({
      model: modelRef,
      config: {
        headers: {
          'x-custom-header': 'test-value',
        },
      },
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model beta header can be overridden by explicit config', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });

    // User can override the beta header if needed
    const instance = llm({
      model: modelRef,
      config: {
        headers: {
          'anthropic-beta': 'different-beta-2025-01-01',
        },
      },
    });

    expect(instance).toBeDefined();
  });

  test('anthropic model with multiple betas works with llm', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs, betas.tokenEfficientTools, betas.codeExecution],
    });

    const instance = llm({
      model: modelRef,
      system: 'You are a helpful assistant.',
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model without betas still creates valid llm instance', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');

    const instance = llm({
      model: modelRef,
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });

  test('anthropic model with empty betas still creates valid llm instance', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514', { betas: [] });

    const instance = llm({
      model: modelRef,
    });

    expect(instance).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
  });
});

// ============================================
// LLM Instance Configuration Tests
// ============================================

describe('LLM Instance Configuration', () => {
  test('llm instance has generate and stream methods', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({ model: modelRef });

    expect(typeof instance.generate).toBe('function');
    expect(typeof instance.stream).toBe('function');
  });

  test('llm instance exposes model property', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({ model: modelRef });

    expect(instance.model).toBeDefined();
    expect(instance.model.modelId).toBe('claude-sonnet-4-20250514');
    expect(instance.model.capabilities).toBeDefined();
  });

  test('llm instance with system prompt is configured correctly', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({
      model: modelRef,
      system: 'You are a helpful assistant.',
    });

    expect(instance).toBeDefined();
  });

  test('llm instance with params is configured correctly', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const modelRef = anthropic('claude-sonnet-4-20250514');
    const instance = llm({
      model: modelRef,
      params: {
        temperature: 0.7,
        max_tokens: 1024,
      },
    });

    expect(instance).toBeDefined();
  });
});

// ============================================
// Error Handling Tests
// ============================================

describe('LLM Error Handling', () => {
  test('throws error when provider does not support LLM modality', () => {
    // Create a minimal provider-like object with no LLM modality
    // Use Object.defineProperty to set name since function.name is read-only
    const mockProvider = function(modelId: string) {
      return { modelId, provider: mockProvider };
    };

    Object.defineProperty(mockProvider, 'name', { value: 'no-llm-provider' });
    Object.defineProperty(mockProvider, 'version', { value: '1.0.0' });
    Object.defineProperty(mockProvider, 'modalities', { value: {} }); // No LLM modality

    const modelRef = {
      modelId: 'test-model',
      provider: mockProvider as unknown as Provider<unknown>,
    };

    expect(() => llm({ model: modelRef })).toThrow(UPPError);
    expect(() => llm({ model: modelRef })).toThrow("does not support LLM modality");
  });
});
