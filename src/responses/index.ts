/**
 * OpenResponses Provider for UPP
 *
 * Implements the OpenResponses specification for multi-provider,
 * interoperable LLM interfaces. Works with any OpenResponses-compatible
 * server including OpenAI, OpenRouter, and self-hosted implementations.
 *
 * @see {@link https://www.openresponses.org OpenResponses Specification}
 * @packageDocumentation
 */

export { responses } from '../providers/responses/index.ts';

export type {
  ResponsesProviderOptions,
  ResponsesParams,
  ResponsesRequest,
  ResponsesResponse,
  ResponsesStreamEvent,
  ResponsesUsage,
  ResponsesInputItem,
  ResponsesOutputItem,
  ResponsesContentPart,
  ResponsesFunctionTool,
  ResponsesBuiltInTool,
  ResponsesToolUnion,
  ResponsesHeaders,
} from '../providers/responses/index.ts';
