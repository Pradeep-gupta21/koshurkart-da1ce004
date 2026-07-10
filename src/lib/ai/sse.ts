/**
 * KoshurKart — Server-Sent Events parser
 * =================================================================
 * A tiny, dependency-free reader that turns a raw `ReadableStream<Uint8Array>`
 * (an HTTP response body) into an async iterable of SSE `data:` payloads.
 *
 * It is deliberately generic: it knows nothing about AI, agents, or the shape
 * of the JSON it yields. That separation is what lets the AI client sit on top
 * of *any* SSE endpoint, and lets this parser be unit-tested in isolation with
 * a hand-built stream.
 *
 * Scope: handles multi-line events, `data:` field accumulation, chunk
 * boundaries that split an event mid-way, and both `\n\n` and `\r\n\r\n`
 * delimiters. Comment lines (`:`), and non-`data` fields are ignored, matching
 * the subset the `ai-chat` edge function emits (`data: <json>\n\n`).
 */

/** Sentinel the backend sends to mark the end of a stream. */
export const SSE_DONE = "[DONE]";

/**
 * Read an SSE body and yield each event's concatenated `data` payload as a
 * string. Stops when the stream ends, when a `[DONE]` sentinel is seen, or
 * when `signal` aborts (in which case the underlying reader is cancelled).
 *
 * The `[DONE]` sentinel itself is NOT yielded — it is consumed as the natural
 * terminator so callers only ever receive real payloads.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // If the caller aborts, proactively cancel the reader so the network
  // request is torn down rather than left dangling.
  const onAbort = (): void => {
    void reader.cancel().catch(() => {
      /* already closing — nothing to do */
    });
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. Normalize CRLF first.
      const normalized = buffer.replace(/\r\n/g, "\n");
      const events = normalized.split("\n\n");

      // The last element may be an incomplete event — keep it buffered.
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const data = extractData(rawEvent);
        if (data === null) continue;
        if (data === SSE_DONE) return;
        yield data;
      }
    }

    // Flush any trailing event left without a terminating blank line.
    const tail = extractData(buffer.replace(/\r\n/g, "\n"));
    if (tail !== null && tail !== SSE_DONE) yield tail;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

/**
 * Pull the `data` payload out of one raw SSE event block. Concatenates
 * multiple `data:` lines with `\n` per the SSE spec; returns `null` when the
 * block carries no data (e.g. a comment or a keep-alive).
 */
function extractData(rawEvent: string): string | null {
  const lines = rawEvent.split("\n");
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    // A single leading space after the colon is part of the framing, not data.
    const value = line.slice(5);
    dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
  }

  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}
