/**
 * Unit tests for `useAgent`. The hook is driven through a fake `AIClient`
 * built on an in-memory transport, so these exercise the real streaming/
 * optimistic/cancel/retry state machine without any network.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAgent } from "@/hooks/useAgent";
import { AIClient } from "@/lib/ai";
import type { AIChatTransport } from "@/lib/ai";
import { SSE_DONE } from "@/lib/ai";

/** Encode SSE chunks into a readable byte stream. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** Fake transport replaying a scripted delta/done stream. */
function scriptedClient(...chunks: string[]): AIClient {
  const transport: AIChatTransport = {
    id: "fake",
    async openChatStream() {
      return streamOf(...chunks);
    },
  };
  return new AIClient({ transport });
}

const delta = (content: string) =>
  `data: ${JSON.stringify({ type: "delta", content })}\n\n`;
const done = (finishReason = "stop") =>
  `data: ${JSON.stringify({ type: "done", finishReason })}\n\n`;
const errorEvent = (message: string) =>
  `data: ${JSON.stringify({ type: "error", error: { code: "network", message, retryable: true } })}\n\n`;

describe("useAgent", () => {
  it("streams an assistant reply and settles as complete", async () => {
    const client = scriptedClient(delta("Hel"), delta("lo"), done(), `data: ${SSE_DONE}\n\n`);
    const { result } = renderHook(() =>
      useAgent({ audience: "customer", client }),
    );

    await act(async () => {
      await result.current.send("hi");
    });

    const [user, assistant] = result.current.messages;
    expect(user).toMatchObject({ role: "user", content: "hi", status: "complete" });
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "Hello",
      status: "complete",
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("adds optimistic user + assistant messages immediately on send", async () => {
    const client = scriptedClient(delta("ok"), done());
    const { result } = renderHook(() =>
      useAgent({ audience: "customer", client }),
    );

    // Do not await — inspect the synchronous optimistic state first.
    let pending: Promise<void>;
    act(() => {
      pending = result.current.send("question");
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("question");
    expect(result.current.messages[1].role).toBe("assistant");

    await act(async () => {
      await pending;
    });
  });

  it("ignores blank input", async () => {
    const client = scriptedClient(delta("x"), done());
    const { result } = renderHook(() =>
      useAgent({ audience: "customer", client }),
    );
    await act(async () => {
      await result.current.send("   ");
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it("surfaces a stream error on the message and in `error`", async () => {
    const client = scriptedClient(delta("partial"), errorEvent("boom"));
    const { result } = renderHook(() =>
      useAgent({ audience: "vendor", client }),
    );

    await act(async () => {
      await result.current.send("hi");
    });

    expect(result.current.error).toMatchObject({ code: "network", message: "boom" });
    expect(result.current.messages[1]).toMatchObject({
      status: "error",
      content: "partial",
    });
  });

  it("retry() re-runs the last turn and replaces a failed reply", async () => {
    // First a failing client, then swap in a good one for the retry.
    const failing = scriptedClient(errorEvent("temporary"));
    const { result, rerender } = renderHook(
      ({ client }) => useAgent({ audience: "customer", client }),
      { initialProps: { client: failing } },
    );

    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.messages[1].status).toBe("error");

    const good = scriptedClient(delta("recovered"), done());
    rerender({ client: good });

    await act(async () => {
      await result.current.retry();
    });

    // Still one user + one assistant (the failed reply was replaced).
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      status: "complete",
      content: "recovered",
    });
    expect(result.current.error).toBeNull();
  });

  it("reset() clears the conversation", async () => {
    const client = scriptedClient(delta("x"), done());
    const { result } = renderHook(() =>
      useAgent({ audience: "admin", client }),
    );
    await act(async () => {
      await result.current.send("hi");
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => result.current.reset());
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it("cancel() aborts an in-flight turn and marks the reply cancelled", async () => {
    // A transport that never closes until aborted, so the turn stays in-flight.
    const transport: AIChatTransport = {
      id: "hang",
      async openChatStream(_payload, signal) {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode(delta("start")));
            signal.addEventListener("abort", () => {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            });
          },
        });
      },
    };
    const client = new AIClient({ transport });
    const { result } = renderHook(() =>
      useAgent({ audience: "customer", client }),
    );

    let pending: Promise<void>;
    act(() => {
      pending = result.current.send("hi");
    });

    await waitFor(() => expect(result.current.streaming).toBe(true));

    act(() => result.current.cancel());
    await act(async () => {
      await pending;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.streaming).toBe(false);
    const assistant = result.current.messages[1];
    expect(assistant.status).toBe("cancelled");
    expect(assistant.content).toBe("start");
  });
});
