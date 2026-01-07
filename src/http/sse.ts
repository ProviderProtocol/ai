/**
 * Server-Sent Events (SSE) stream parsing utilities.
 * @module http/sse
 */

/**
 * Parses a Server-Sent Events stream into JSON objects.
 *
 * This async generator handles the standard SSE wire format:
 * - Lines prefixed with "data:" contain event data
 * - Lines prefixed with "event:" specify event types
 * - Lines prefixed with ":" are comments (used for keep-alive)
 * - Events are separated by double newlines
 * - Stream terminates on "[DONE]" message (OpenAI convention)
 *
 * Also handles non-standard formats used by some providers:
 * - Raw JSON without "data:" prefix (Google)
 * - Multi-line data fields
 *
 * @param body - ReadableStream from fetch response body
 * @yields Parsed JSON objects from each SSE event
 *
 * @example
 * ```typescript
 * const response = await doStreamFetch(url, init, config, 'openai', 'llm');
 *
 * for await (const event of parseSSEStream(response.body!)) {
 *   // event is parsed JSON from each SSE data field
 *   const chunk = event as OpenAIStreamChunk;
 *   const delta = chunk.choices[0]?.delta?.content;
 *   if (delta) {
 *     process.stdout.write(delta);
 *   }
 * }
 * ```
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<unknown, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          const event = parseSSEEvent(buffer);
          if (event !== null && event !== undefined) {
            yield event;
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete events (separated by double newlines or \r\n\r\n)
      const events = buffer.split(/\r?\n\r?\n/);

      // Keep the last partial event in the buffer
      buffer = events.pop() ?? '';

      for (const eventText of events) {
        if (!eventText.trim()) continue;

        const event = parseSSEEvent(eventText);
        if (event === 'DONE') {
          return;
        }
        if (event !== null && event !== undefined) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parses a single SSE event block into a JSON object.
 *
 * Handles the following line prefixes:
 * - "data:" - Event data (multiple data lines are concatenated)
 * - "event:" - Event type (added to result as _eventType)
 * - ":" - Comment (ignored, often used for keep-alive)
 * - Raw JSON starting with { or [ (provider-specific fallback)
 *
 * @param eventText - Raw text of a single SSE event block
 * @returns Parsed JSON object, 'DONE' for termination signal, or null for invalid/empty events
 */
function parseSSEEvent(eventText: string): unknown | 'DONE' | null {
  const lines = eventText.split('\n');
  let data = '';
  let eventType = '';

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('event:')) {
      eventType = trimmedLine.slice(6).trim();
    } else if (trimmedLine.startsWith('data:')) {
      const lineData = trimmedLine.slice(5).trim();
      data += (data ? '\n' : '') + lineData;
    } else if (trimmedLine.startsWith(':')) {
      continue;
    } else if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
      data += (data ? '\n' : '') + trimmedLine;
    }
  }

  if (!data) {
    return null;
  }

  if (data === '[DONE]') {
    return 'DONE';
  }

  try {
    const parsed = JSON.parse(data);

    if (eventType) {
      return { _eventType: eventType, ...parsed };
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parses a simple text stream without SSE formatting.
 *
 * This is a simpler alternative to {@link parseSSEStream} for providers
 * that stream raw text deltas without SSE event wrappers. Each chunk
 * from the response body is decoded and yielded as-is.
 *
 * Use this for:
 * - Plain text streaming responses
 * - Providers with custom streaming formats
 * - Testing and debugging stream handling
 *
 * @param body - ReadableStream from fetch response body
 * @yields Decoded text strings from each stream chunk
 *
 * @example
 * ```typescript
 * const response = await doStreamFetch(url, init, config, 'custom', 'llm');
 *
 * for await (const text of parseSimpleTextStream(response.body!)) {
 *   process.stdout.write(text);
 * }
 * ```
 */
export async function* parseSimpleTextStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const text = decoder.decode(value, { stream: true });
      if (text) {
        yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
