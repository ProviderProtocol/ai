/**
 * @fileoverview Partial JSON parser for streaming LLM responses.
 *
 * Enables incremental parsing of JSON data as it streams from LLM providers,
 * allowing consumers to access usable partial objects during streaming rather
 * than waiting for complete JSON.
 *
 * @module utils/partial-json
 */

/**
 * Result of parsing partial JSON.
 *
 * @typeParam T - The expected type of the parsed value
 */
export interface PartialParseResult<T = unknown> {
  /** The parsed value, or undefined if parsing failed */
  value: T | undefined;
  /** Whether the JSON was complete and valid */
  isComplete: boolean;
}

/**
 * Cleans up trailing incomplete elements from JSON.
 * Iteratively handles chained incomplete elements (e.g., trailing colon followed by comma).
 */
function cleanupTrailingIncomplete(json: string): string {
  let result = json.trim();
  let changed = true;

  // Keep cleaning until no more changes
  while (changed) {
    changed = false;
    const trimmed = result.trim();

    // Handle trailing comma - remove it
    if (trimmed.endsWith(',')) {
      result = trimmed.slice(0, -1);
      changed = true;
      continue;
    }

    // Handle trailing colon - remove the incomplete key-value pair
    if (trimmed.endsWith(':')) {
      // Find the start of the key (the opening quote before the colon)
      const colonIndex = trimmed.length - 1;
      let keyStart = colonIndex - 1;
      while (keyStart >= 0 && /\s/.test(trimmed[keyStart]!)) {
        keyStart--;
      }
      // Should now be at closing quote of key
      if (keyStart >= 0 && trimmed[keyStart] === '"') {
        // Find opening quote of key
        keyStart--;
        while (keyStart >= 0 && trimmed[keyStart] !== '"') {
          keyStart--;
        }
        // Now find what's before the key (comma or opening brace)
        keyStart--;
        while (keyStart >= 0 && /\s/.test(trimmed[keyStart]!)) {
          keyStart--;
        }
        if (keyStart >= 0 && trimmed[keyStart] === ',') {
          result = trimmed.slice(0, keyStart);
        } else {
          result = trimmed.slice(0, keyStart + 1);
        }
        changed = true;
        continue;
      }
    }

    // Handle incomplete literals (true, false, null)
    const literalMatch = trimmed.match(/(,?\s*)(t(?:r(?:ue?)?)?|f(?:a(?:l(?:se?)?)?)?|n(?:u(?:ll?)?)?)$/i);
    if (literalMatch && literalMatch[2]) {
      const partial = literalMatch[2].toLowerCase();
      const literals = ['true', 'false', 'null'];
      const match = literals.find((lit) => lit.startsWith(partial) && partial !== lit);
      if (match) {
        result = trimmed.slice(0, -literalMatch[2].length) + match;
        changed = true;
        continue;
      }
    }

    // Handle incomplete numbers at end (e.g., "123." or "1e" or "1e+" or "-")
    const numberMatch = trimmed.match(/(,?\s*)(-?(?:\d+\.|\d*\.?\d+[eE][+-]?|\d+[eE]|-))$/);
    if (numberMatch && numberMatch[2]) {
      const partial = numberMatch[2];
      if (/[.eE+-]$/.test(partial)) {
        if (partial === '-') {
          // Just a minus sign - remove it and any preceding whitespace/comma
          result = trimmed.slice(0, -(numberMatch[0]?.length ?? 0)).trimEnd();
          // If we now end with a colon, the loop will clean that up next iteration
        } else {
          result = trimmed.slice(0, -1);
        }
        changed = true;
        continue;
      }
    }
  }

  return result;
}

/**
 * Attempts to repair incomplete JSON by completing open structures.
 *
 * @param json - The incomplete JSON string
 * @returns A potentially valid JSON string
 */
function repairJson(json: string): string {
  let result = json;

  // Track open structures as we scan
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < result.length; i++) {
    const char = result[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
    }

    if (!inString) {
      if (char === '{') {
        stack.push('{');
      } else if (char === '[') {
        stack.push('[');
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  // If we ended inside a string, close it
  if (inString) {
    // Check if the string ends with incomplete unicode escape
    const unicodeMatch = result.match(/\\u[0-9a-fA-F]{0,3}$/);
    if (unicodeMatch) {
      // Remove incomplete unicode escape
      result = result.slice(0, -unicodeMatch[0].length);
    }
    // Check if string ends with incomplete escape sequence
    if (result.endsWith('\\')) {
      result = result.slice(0, -1);
    }
    result += '"';
    inString = false;
  }

  // Handle trailing incomplete structures
  result = cleanupTrailingIncomplete(result);

  // Close any open structures
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') {
      result += '}';
    } else {
      result += ']';
    }
  }

  return result;
}

/**
 * Parses potentially incomplete JSON, returning as much as can be extracted.
 *
 * Handles common incomplete states during streaming:
 * - Incomplete strings: `{"name":"Jo` → `{name: "Jo"}`
 * - Incomplete objects: `{"a":1,"b":` → `{a: 1}`
 * - Incomplete arrays: `[1,2,` → `[1, 2]`
 * - Incomplete numbers, booleans, null literals
 * - Nested structures with partial completion
 * - Unicode escape sequences
 *
 * @typeParam T - The expected type of the parsed value
 * @param json - The potentially incomplete JSON string
 * @returns A PartialParseResult with the parsed value and completion status
 *
 * @example
 * ```typescript
 * // Complete JSON
 * parsePartialJson('{"name":"John"}');
 * // => { value: { name: "John" }, isComplete: true }
 *
 * // Incomplete object
 * parsePartialJson('{"user":{"firstName":"Jo');
 * // => { value: { user: { firstName: "Jo" } }, isComplete: false }
 *
 * // Incomplete array
 * parsePartialJson('[1, 2, 3');
 * // => { value: [1, 2, 3], isComplete: false }
 * ```
 */
export function parsePartialJson<T = unknown>(json: string): PartialParseResult<T> {
  const trimmed = json.trim();

  if (trimmed === '') {
    return { value: undefined, isComplete: false };
  }

  // Try parsing as complete JSON first
  try {
    const value = JSON.parse(trimmed) as T;
    return { value, isComplete: true };
  } catch {
    // Continue with partial parsing
  }

  // Attempt to repair and parse the incomplete JSON
  try {
    const repaired = repairJson(trimmed);
    const value = JSON.parse(repaired) as T;
    return { value, isComplete: false };
  } catch {
    return { value: undefined, isComplete: false };
  }
}
