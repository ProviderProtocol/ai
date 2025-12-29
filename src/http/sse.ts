/**
 * Server-Sent Events (SSE) stream parser
 */

/**
 * Parse a Server-Sent Events stream into JSON objects
 * Handles standard SSE format with "data:" prefix
 * Yields parsed JSON for each event
 * Terminates on "[DONE]" message (OpenAI style)
 *
 * @param body - ReadableStream from fetch response
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
 * Parse a single SSE event
 * Returns 'DONE' for [DONE] terminator
 * Returns null for empty or unparseable events
 * Returns parsed JSON otherwise
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
      // Append data (some providers send multi-line data)
      const lineData = trimmedLine.slice(5).trim();
      data += (data ? '\n' : '') + lineData;
    } else if (trimmedLine.startsWith(':')) {
      // Comment line, ignore (often used for keep-alive)
      continue;
    } else if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
      // Some providers (like Google) may send raw JSON without data: prefix
      data += (data ? '\n' : '') + trimmedLine;
    }
  }

  if (!data) {
    return null;
  }

  // Check for OpenAI-style termination
  if (data === '[DONE]') {
    return 'DONE';
  }

  try {
    const parsed = JSON.parse(data);

    // If we have an event type, include it
    if (eventType) {
      return { _eventType: eventType, ...parsed };
    }

    return parsed;
  } catch {
    // Failed to parse JSON - could be a ping or malformed event
    return null;
  }
}

/**
 * Create a simple SSE reader that handles basic text streaming
 * For providers that just stream text deltas
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
