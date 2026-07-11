/**
 * Unit tests for the frontend AI networking layer: the SSE parser and the
 * `AIClient` that turns a transport's byte stream into typed `AIStreamEvent`s.
 * Everything runs against an in-memory transport — no network, no Supabase.
 */

import { describe, it, expect } from "vitest";
import { parseSSEStream, SSE_DONE } from "../sse";
import { AIClient } from "../client";
import { AITransportError, type AIChatTransport } from "../transport";
import type { AgentStreamEvent } from "../events";

/** Build a `ReadableStream<Uint8Array>` from raw SSE text chunks. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** A transport that replays fixed SSE text for any payload. */
function fakeTransport(...chunks: string[]): AIChatTransport {
  return {
    id: "fake",
    async openChatStream() {
      return streamOf(...chunks);
    },
  };
}

async function collect(
  events: AsyncIterable<AgentStreamEvent>,
): Promise<AgentStreamEvent[]> {
  const out: AgentStreamEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("parseSSEStream", () => {
  it("yields each data payload and stops at [DONE]", async () => {
    const stream = streamOf(
      `data: {"a":1}\n\n`,
      `data: {"b":2}\n\n`,
      `data: ${SSE_DONE}\n\n`,
      `data: {"never":true}\n\n`,
    );
    const out: string[] = [];
    for await (const d of parseSSEStream(stream)) out.push(d);
    expect(out).toEqual([`{"a":1}`, `{"b":2}`]);
  });

  it("reassembles events split across chunk boundaries", async () => {
    const stream = streamOf(`data: {"hel`, `lo":"world"}\n\n`);
    const out: string[] = [];
    for await (const d of parseSSEStream(stream)) out.push(d);
    expect(out).toEqual([`{"hello":"world"}`]);
  });

  it("handles CRLF delimiters", async () => {
    const stream = streamOf(`data: {"x":1}\r\n\r\n`);
    const out: string[] = [];
    for await (const d of parseSSEStream(stream)) out.push(d);
    expect(out).toEqual([`{"x":1}`]);
  });

  it("stops promptly when the signal is aborted", async () => {
    const controller = new AbortController();
    const stream = streamOf(`data: {"a":1}\n\n`, `data: {"b":2}\n\n`);
    const out: string[] = [];
    for await (const d of parseSSEStream(stream, controller.signal)) {
      out.push(d);
      controller.abort();
    }
    expect(out).toEqual([`{"a":1}`]);
  });
});

describe("AIClient.streamChat", () => {
  const payload = { audience: "customer" as const, message: "hi" };

  it("emits typed delta/done events from the transport", async () => {
    const client = new AIClient({
      transport: fakeTransport(
        `data: ${JSON.stringify({ type: "delta", content: "Hel" })}\n\n`,
        `data: ${JSON.stringify({ type: "delta", content: "lo" })}\n\n`,
        `data: ${JSON.stringify({ type: "done", finishReason: "stop" })}\n\n`,
        `data: ${SSE_DONE}\n\n`,
      ),
    });

    const events = await collect(
      client.streamChat(payload, new AbortController().signal),
    );
    expect(events).toEqual([
      { type: "delta", content: "Hel" },
      { type: "delta", content: "lo" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("converts a transport failure into a single error event", async () => {
    const client = new AIClient({
      transport: {
        id: "boom",
        async openChatStream() {
          throw new AITransportError("nope", 401);
        },
      },
    });

    const events = await collect(
      client.streamChat(payload, new AbortController().signal),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      error: { code: "authentication", retryable: false },
    });
  });

  it("skips malformed (non-JSON) data lines without failing the stream", async () => {
    const client = new AIClient({
      transport: fakeTransport(
        `data: not-json\n\n`,
        `data: ${JSON.stringify({ type: "delta", content: "ok" })}\n\n`,
      ),
    });

    const events = await collect(
      client.streamChat(payload, new AbortController().signal),
    );
    expect(events).toEqual([{ type: "delta", content: "ok" }]);
  });

  it("yields nothing when aborted before consumption completes", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new AIClient({
      transport: fakeTransport(
        `data: ${JSON.stringify({ type: "delta", content: "x" })}\n\n`,
      ),
    });
    const events = await collect(client.streamChat(payload, controller.signal));
    expect(events).toEqual([]);
  });
});
