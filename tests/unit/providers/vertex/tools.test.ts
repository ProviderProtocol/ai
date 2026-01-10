/**
 * Unit tests for Vertex AI Gemini built-in tool helpers.
 */

import { describe, test, expect } from 'bun:test';
import {
  vertexTools,
  googleSearchTool,
  codeExecutionTool,
  urlContextTool,
  googleMapsTool,
  enterpriseWebSearchTool,
  vertexAiSearchTool,
} from '../../../../src/providers/vertex/types.ts';

describe('Vertex Built-in Tools', () => {
  describe('googleSearchTool()', () => {
    test('returns basic structure with empty options', () => {
      const tool = googleSearchTool();
      expect(tool).toEqual({ googleSearch: {} });
    });

    test('accepts excludeDomains option', () => {
      const tool = googleSearchTool({
        excludeDomains: ['example.com', 'test.org'],
      });
      expect(tool).toEqual({
        googleSearch: {
          excludeDomains: ['example.com', 'test.org'],
        },
      });
    });

    test('accessible via vertexTools namespace', () => {
      const tool = vertexTools.googleSearch();
      expect(tool).toEqual({ googleSearch: {} });
    });
  });

  describe('codeExecutionTool()', () => {
    test('returns correct structure', () => {
      const tool = codeExecutionTool();
      expect(tool).toEqual({ codeExecution: {} });
    });

    test('accessible via vertexTools namespace', () => {
      const tool = vertexTools.codeExecution();
      expect(tool).toEqual({ codeExecution: {} });
    });
  });

  describe('urlContextTool()', () => {
    test('returns correct structure', () => {
      const tool = urlContextTool();
      expect(tool).toEqual({ urlContext: {} });
    });

    test('accessible via vertexTools namespace', () => {
      const tool = vertexTools.urlContext();
      expect(tool).toEqual({ urlContext: {} });
    });
  });

  describe('googleMapsTool()', () => {
    test('returns basic structure with empty options', () => {
      const tool = googleMapsTool();
      expect(tool).toEqual({ googleMaps: {} });
    });

    test('accepts enableWidget option', () => {
      const tool = googleMapsTool({ enableWidget: true });
      expect(tool).toEqual({
        googleMaps: { enableWidget: true },
      });
    });

    test('accessible via vertexTools namespace', () => {
      const tool = vertexTools.googleMaps();
      expect(tool).toEqual({ googleMaps: {} });
    });
  });

  describe('enterpriseWebSearchTool()', () => {
    test('returns correct structure', () => {
      const tool = enterpriseWebSearchTool();
      expect(tool).toEqual({ enterpriseWebSearch: {} });
    });

    test('accessible via vertexTools namespace', () => {
      const tool = vertexTools.enterpriseWebSearch();
      expect(tool).toEqual({ enterpriseWebSearch: {} });
    });
  });

  describe('vertexAiSearchTool()', () => {
    test('returns correct structure with datastore', () => {
      const tool = vertexAiSearchTool({
        datastore: 'projects/my-project/locations/us/collections/default_collection/dataStores/my-store',
      });
      expect(tool).toEqual({
        retrieval: {
          vertexAiSearch: {
            datastore: 'projects/my-project/locations/us/collections/default_collection/dataStores/my-store',
          },
        },
      });
    });

    test('accessible via vertexTools namespace', () => {
      const tool = vertexTools.vertexAiSearch({
        datastore: 'projects/test/locations/global/collections/default/dataStores/test-store',
      });
      expect(tool).toEqual({
        retrieval: {
          vertexAiSearch: {
            datastore: 'projects/test/locations/global/collections/default/dataStores/test-store',
          },
        },
      });
    });
  });

  describe('vertexTools namespace', () => {
    test('contains all tool helpers', () => {
      expect(vertexTools.googleSearch).toBe(googleSearchTool);
      expect(vertexTools.codeExecution).toBe(codeExecutionTool);
      expect(vertexTools.urlContext).toBe(urlContextTool);
      expect(vertexTools.googleMaps).toBe(googleMapsTool);
      expect(vertexTools.enterpriseWebSearch).toBe(enterpriseWebSearchTool);
      expect(vertexTools.vertexAiSearch).toBe(vertexAiSearchTool);
    });

    test('tools can be composed in an array', () => {
      const tools = [
        vertexTools.googleSearch(),
        vertexTools.codeExecution(),
        vertexTools.urlContext(),
      ];

      expect(tools).toHaveLength(3);
      expect(tools[0]).toHaveProperty('googleSearch');
      expect(tools[1]).toHaveProperty('codeExecution');
      expect(tools[2]).toHaveProperty('urlContext');
    });
  });
});
