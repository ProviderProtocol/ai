/**
 * @fileoverview JSON Schema types for tool parameters and structured outputs.
 *
 * Provides TypeScript interfaces for defining JSON Schema objects used in
 * LLM tool definitions and structured output specifications.
 *
 * @module types/schema
 */

/**
 * Primitive and composite JSON Schema property types.
 *
 * These types correspond to the JSON Schema specification's allowed type values.
 */
export type JSONSchemaPropertyType =
  /** String values */
  | 'string'
  /** Floating point numbers */
  | 'number'
  /** Whole numbers */
  | 'integer'
  /** Boolean true/false values */
  | 'boolean'
  /** Ordered lists of values */
  | 'array'
  /** Key-value mappings */
  | 'object'
  /** Explicit null value */
  | 'null';

/**
 * JSON Schema property definition.
 *
 * Describes a single property within a JSON Schema object, including
 * type constraints, validation rules, and nested structure definitions.
 *
 * @example
 * ```typescript
 * const nameProperty: JSONSchemaProperty = {
 *   type: 'string',
 *   description: 'User name',
 *   minLength: 1,
 *   maxLength: 100
 * };
 * ```
 *
 * @example
 * ```typescript
 * const tagsProperty: JSONSchemaProperty = {
 *   type: 'array',
 *   description: 'List of tags',
 *   items: { type: 'string' },
 *   minItems: 1,
 *   uniqueItems: true
 * };
 * ```
 */
export interface JSONSchemaProperty {
  /** The JSON type of this property */
  type: JSONSchemaPropertyType;

  /** Human-readable description for the LLM */
  description?: string;

  /** Allowed values (enumeration) */
  enum?: unknown[];

  /** Constant value this property must equal */
  const?: unknown;

  /** Default value if not provided */
  default?: unknown;

  /** Minimum string length (string type only) */
  minLength?: number;

  /** Maximum string length (string type only) */
  maxLength?: number;

  /** Regular expression pattern for validation (string type only) */
  pattern?: string;

  /** Semantic format hint (string type only) */
  format?: 'email' | 'uri' | 'date' | 'date-time' | 'uuid';

  /** Minimum value inclusive (number/integer types only) */
  minimum?: number;

  /** Maximum value inclusive (number/integer types only) */
  maximum?: number;

  /** Minimum value exclusive (number/integer types only) */
  exclusiveMinimum?: number;

  /** Maximum value exclusive (number/integer types only) */
  exclusiveMaximum?: number;

  /** Value must be divisible by this (number/integer types only) */
  multipleOf?: number;

  /** Schema for array elements (array type only) */
  items?: JSONSchemaProperty;

  /** Minimum array length (array type only) */
  minItems?: number;

  /** Maximum array length (array type only) */
  maxItems?: number;

  /** Whether array elements must be unique (array type only) */
  uniqueItems?: boolean;

  /** Nested property definitions (object type only) */
  properties?: Record<string, JSONSchemaProperty>;

  /** List of required property names (object type only) */
  required?: string[];

  /** Whether additional properties are allowed (object type only) */
  additionalProperties?: boolean;
}

/**
 * Root JSON Schema for tool parameters or structured outputs.
 *
 * This is the top-level schema definition used when defining tool
 * parameters or requesting structured output from an LLM.
 *
 * @example
 * ```typescript
 * const weatherToolSchema: JSONSchema = {
 *   type: 'object',
 *   description: 'Parameters for getting weather information',
 *   properties: {
 *     location: {
 *       type: 'string',
 *       description: 'City name or coordinates'
 *     },
 *     units: {
 *       type: 'string',
 *       enum: ['celsius', 'fahrenheit'],
 *       description: 'Temperature units'
 *     }
 *   },
 *   required: ['location']
 * };
 * ```
 */
export interface JSONSchema {
  /** Root schemas are always objects */
  type: 'object';

  /** Property definitions for the object */
  properties: Record<string, JSONSchemaProperty>;

  /** List of required property names */
  required?: string[];

  /** Whether additional properties are allowed beyond those defined */
  additionalProperties?: boolean;

  /** Human-readable description of the schema's purpose */
  description?: string;
}
