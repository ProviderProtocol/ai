import { describe, it, expect } from 'bun:test';
import { parsePartialJson } from '../../../src/utils/partial-json.ts';

describe('parsePartialJson', () => {
  describe('complete JSON', () => {
    it('parses complete object', () => {
      const result = parsePartialJson('{"name":"John","age":30}');
      expect(result.value).toEqual({ name: 'John', age: 30 });
      expect(result.isComplete).toBe(true);
    });

    it('parses complete array', () => {
      const result = parsePartialJson('[1, 2, 3]');
      expect(result.value).toEqual([1, 2, 3]);
      expect(result.isComplete).toBe(true);
    });

    it('parses complete string', () => {
      const result = parsePartialJson('"hello"');
      expect(result.value).toBe('hello');
      expect(result.isComplete).toBe(true);
    });

    it('parses complete number', () => {
      const result = parsePartialJson('42');
      expect(result.value).toBe(42);
      expect(result.isComplete).toBe(true);
    });

    it('parses complete boolean', () => {
      const result = parsePartialJson('true');
      expect(result.value).toBe(true);
      expect(result.isComplete).toBe(true);
    });

    it('parses complete null', () => {
      const result = parsePartialJson('null');
      expect(result.value).toBe(null);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('incomplete strings', () => {
    it('completes incomplete string in object', () => {
      const result = parsePartialJson('{"name":"Jo');
      expect(result.value).toEqual({ name: 'Jo' });
      expect(result.isComplete).toBe(false);
    });

    it('handles string with escape sequence at end', () => {
      const result = parsePartialJson('{"text":"hello\\');
      expect(result.value).toEqual({ text: 'hello' });
      expect(result.isComplete).toBe(false);
    });

    it('handles incomplete unicode escape', () => {
      const result = parsePartialJson('{"text":"hello\\u00');
      expect(result.value).toEqual({ text: 'hello' });
      expect(result.isComplete).toBe(false);
    });
  });

  describe('incomplete objects', () => {
    it('completes object with trailing comma', () => {
      const result = parsePartialJson('{"a":1,"b":2,');
      expect(result.value).toEqual({ a: 1, b: 2 });
      expect(result.isComplete).toBe(false);
    });

    it('completes object with trailing colon', () => {
      const result = parsePartialJson('{"a":1,"b":');
      expect(result.value).toEqual({ a: 1 });
      expect(result.isComplete).toBe(false);
    });

    it('completes deeply nested object', () => {
      const result = parsePartialJson('{"user":{"firstName":"Jo');
      expect(result.value).toEqual({ user: { firstName: 'Jo' } });
      expect(result.isComplete).toBe(false);
    });

    it('handles unclosed nested objects', () => {
      const result = parsePartialJson('{"a":{"b":{"c":1');
      expect(result.value).toEqual({ a: { b: { c: 1 } } });
      expect(result.isComplete).toBe(false);
    });
  });

  describe('incomplete arrays', () => {
    it('completes array with trailing comma', () => {
      const result = parsePartialJson('[1, 2, 3,');
      expect(result.value).toEqual([1, 2, 3]);
      expect(result.isComplete).toBe(false);
    });

    it('completes nested array', () => {
      const result = parsePartialJson('[[1, 2], [3');
      expect(result.value).toEqual([[1, 2], [3]]);
      expect(result.isComplete).toBe(false);
    });

    it('handles array of objects', () => {
      const result = parsePartialJson('[{"a":1},{"b":2');
      expect(result.value).toEqual([{ a: 1 }, { b: 2 }]);
      expect(result.isComplete).toBe(false);
    });
  });

  describe('incomplete primitives', () => {
    it('completes partial true', () => {
      const result = parsePartialJson('{"flag":tr');
      expect(result.value).toEqual({ flag: true });
      expect(result.isComplete).toBe(false);
    });

    it('completes partial false', () => {
      const result = parsePartialJson('{"flag":fal');
      expect(result.value).toEqual({ flag: false });
      expect(result.isComplete).toBe(false);
    });

    it('completes partial null', () => {
      const result = parsePartialJson('{"value":nul');
      expect(result.value).toEqual({ value: null });
      expect(result.isComplete).toBe(false);
    });

    it('handles incomplete number with decimal', () => {
      const result = parsePartialJson('{"value":123.');
      expect(result.value).toEqual({ value: 123 });
      expect(result.isComplete).toBe(false);
    });

    it('handles incomplete number with exponent', () => {
      const result = parsePartialJson('{"value":1e');
      expect(result.value).toEqual({ value: 1 });
      expect(result.isComplete).toBe(false);
    });

    it('handles standalone minus sign', () => {
      const result = parsePartialJson('{"value":-');
      expect(result.value).toEqual({});
      expect(result.isComplete).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parsePartialJson('');
      expect(result.value).toBeUndefined();
      expect(result.isComplete).toBe(false);
    });

    it('handles whitespace only', () => {
      const result = parsePartialJson('   ');
      expect(result.value).toBeUndefined();
      expect(result.isComplete).toBe(false);
    });

    it('handles malformed JSON', () => {
      const result = parsePartialJson('{{{');
      expect(result.value).toBeUndefined();
      expect(result.isComplete).toBe(false);
    });

    it('preserves whitespace in strings', () => {
      const result = parsePartialJson('{"text":"hello world');
      expect(result.value).toEqual({ text: 'hello world' });
      expect(result.isComplete).toBe(false);
    });

    it('handles mixed nested structures', () => {
      const result = parsePartialJson('{"items":[{"id":1},{"id":2');
      expect(result.value).toEqual({ items: [{ id: 1 }, { id: 2 }] });
      expect(result.isComplete).toBe(false);
    });
  });

  describe('type inference', () => {
    it('infers type from generic parameter', () => {
      interface User {
        name: string;
        age: number;
      }
      const result = parsePartialJson<User>('{"name":"John","age":30}');
      expect(result.value?.name).toBe('John');
      expect(result.value?.age).toBe(30);
      expect(result.isComplete).toBe(true);
    });
  });
});
