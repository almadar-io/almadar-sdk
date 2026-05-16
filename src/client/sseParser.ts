/**
 * Minimal Server-Sent Events parser. Reads a `ReadableStream<Uint8Array>`
 * (the body of a `fetch` Response) and yields decoded events. Universal:
 * works in browser, Node 18+, Deno, Bun.
 *
 * Spec subset implemented:
 *   - `event:` and `data:` fields
 *   - dispatch on blank line
 *   - newline-tolerant (CRLF + LF)
 *   - skips comments (`:`-prefixed lines)
 *
 * Not implemented (we don't need them):
 *   - `id:` / `retry:` fields
 *   - reconnection / last-event-id
 */

export interface RawSseEvent {
  /** `event:` field value. Empty string when absent — matches the spec default. */
  event: string;
  /** Concatenated `data:` lines, joined by newlines. */
  data: string;
}

export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<RawSseEvent, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = indexOfNewline(buffer)) !== -1) {
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + (buffer[newlineIdx] === '\r' && buffer[newlineIdx + 1] === '\n' ? 2 : 1));

        if (rawLine === '') {
          if (currentData !== '' || currentEvent !== '') {
            yield { event: currentEvent, data: currentData };
            currentEvent = '';
            currentData = '';
          }
          continue;
        }
        if (rawLine.startsWith(':')) continue;

        const colon = rawLine.indexOf(':');
        const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
        const rawValue = colon === -1 ? '' : rawLine.slice(colon + 1);
        const value2 = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

        if (field === 'event') {
          currentEvent = value2;
        } else if (field === 'data') {
          currentData = currentData === '' ? value2 : `${currentData}\n${value2}`;
        }
      }
    }
    if (currentData !== '' || currentEvent !== '') {
      yield { event: currentEvent, data: currentData };
    }
  } finally {
    reader.releaseLock();
  }
}

function indexOfNewline(s: string): number {
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\n' || c === '\r') return i;
  }
  return -1;
}
