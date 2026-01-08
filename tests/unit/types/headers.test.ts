import { test, expect, describe } from 'bun:test';
import type { AnthropicHeaders } from '../../../src/providers/anthropic/index.ts';
import type { OpenAIHeaders } from '../../../src/providers/openai/index.ts';
import type { GoogleHeaders } from '../../../src/providers/google/index.ts';
import type { OpenRouterHeaders } from '../../../src/providers/openrouter/index.ts';
import type { XAIHeaders } from '../../../src/providers/xai/index.ts';
import type { OllamaHeaders } from '../../../src/providers/ollama/index.ts';
import type { ProviderConfig } from '../../../src/types/provider.ts';

describe('Header Types', () => {
  describe('AnthropicHeaders', () => {
    test('supports anthropic-beta header', () => {
      const headers: AnthropicHeaders = {
        'anthropic-beta': 'extended-cache-ttl-2025-04-11',
      };
      expect(headers['anthropic-beta']).toBe('extended-cache-ttl-2025-04-11');
    });

    test('supports comma-separated beta features', () => {
      const headers: AnthropicHeaders = {
        'anthropic-beta': 'extended-cache-ttl-2025-04-11,token-efficient-tools-2025-02-19',
      };
      expect(headers['anthropic-beta']).toContain('extended-cache-ttl');
      expect(headers['anthropic-beta']).toContain('token-efficient-tools');
    });

    test('allows custom headers alongside typed ones', () => {
      const headers: AnthropicHeaders = {
        'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        'X-Custom': 'value',
      };
      expect(headers['anthropic-beta']).toBeDefined();
      expect(headers['X-Custom']).toBe('value');
    });
  });

  describe('OpenAIHeaders', () => {
    test('supports organization header', () => {
      const headers: OpenAIHeaders = {
        'OpenAI-Organization': 'org-abc123',
      };
      expect(headers['OpenAI-Organization']).toBe('org-abc123');
    });

    test('supports project header', () => {
      const headers: OpenAIHeaders = {
        'OpenAI-Project': 'proj-xyz789',
      };
      expect(headers['OpenAI-Project']).toBe('proj-xyz789');
    });

    test('supports client request ID header', () => {
      const headers: OpenAIHeaders = {
        'X-Client-Request-Id': 'trace-123',
      };
      expect(headers['X-Client-Request-Id']).toBe('trace-123');
    });

    test('supports all headers together', () => {
      const headers: OpenAIHeaders = {
        'OpenAI-Organization': 'org-abc123',
        'OpenAI-Project': 'proj-xyz789',
        'X-Client-Request-Id': 'trace-123',
      };
      expect(Object.keys(headers)).toHaveLength(3);
    });
  });

  describe('GoogleHeaders', () => {
    test('supports api client header', () => {
      const headers: GoogleHeaders = {
        'x-goog-api-client': 'myapp/1.0.0',
      };
      expect(headers['x-goog-api-client']).toBe('myapp/1.0.0');
    });

    test('supports user project header', () => {
      const headers: GoogleHeaders = {
        'x-goog-user-project': 'my-gcp-project',
      };
      expect(headers['x-goog-user-project']).toBe('my-gcp-project');
    });
  });

  describe('OpenRouterHeaders', () => {
    test('supports HTTP-Referer header', () => {
      const headers: OpenRouterHeaders = {
        'HTTP-Referer': 'https://myapp.example.com',
      };
      expect(headers['HTTP-Referer']).toBe('https://myapp.example.com');
    });

    test('supports X-Title header', () => {
      const headers: OpenRouterHeaders = {
        'X-Title': 'My Application',
      };
      expect(headers['X-Title']).toBe('My Application');
    });

    test('supports both headers for attribution', () => {
      const headers: OpenRouterHeaders = {
        'HTTP-Referer': 'https://myapp.example.com',
        'X-Title': 'My Application',
      };
      expect(headers['HTTP-Referer']).toBeDefined();
      expect(headers['X-Title']).toBeDefined();
    });
  });

  describe('XAIHeaders', () => {
    test('supports client request ID header', () => {
      const headers: XAIHeaders = {
        'X-Client-Request-Id': 'trace-123',
      };
      expect(headers['X-Client-Request-Id']).toBe('trace-123');
    });
  });

  describe('OllamaHeaders', () => {
    test('supports Cloudflare access headers', () => {
      const headers: OllamaHeaders = {
        'CF-Access-Client-Id': 'client-id.access',
        'CF-Access-Client-Secret': 'secret-token',
      };
      expect(headers['CF-Access-Client-Id']).toBe('client-id.access');
      expect(headers['CF-Access-Client-Secret']).toBe('secret-token');
    });

    test('allows arbitrary proxy auth headers', () => {
      const headers: OllamaHeaders = {
        'X-Proxy-Auth': 'custom-token',
      };
      expect(headers['X-Proxy-Auth']).toBe('custom-token');
    });
  });

  describe('ProviderConfig headers integration', () => {
    test('accepts headers in config', () => {
      const config: ProviderConfig = {
        apiKey: 'test-key',
        headers: {
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        },
      };
      expect(config.headers).toBeDefined();
      expect(config.headers?.['anthropic-beta']).toBe('extended-cache-ttl-2025-04-11');
    });

    test('accepts OpenRouter headers in config', () => {
      const config: ProviderConfig = {
        apiKey: 'test-key',
        headers: {
          'HTTP-Referer': 'https://myapp.com',
          'X-Title': 'My App',
        },
      };
      expect(config.headers?.['HTTP-Referer']).toBe('https://myapp.com');
      expect(config.headers?.['X-Title']).toBe('My App');
    });

    test('config headers is optional', () => {
      const config: ProviderConfig = {
        apiKey: 'test-key',
      };
      expect(config.headers).toBeUndefined();
    });
  });
});
