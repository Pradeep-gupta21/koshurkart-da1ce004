/**
 * KoshurKart — AI Client
 * =================================================================
 * The reusable networking layer for AI chat. It composes a provider-agnostic
 * `AIChatTransport` with the generic SSE parser to expose one clean, typed
 * primitive: an async stream of `AIStreamEvent`s for a chat turn.
 *
 * Responsibilities (networking only — no React, no presentation):
 *  - open the transport stream for a payload;
 *  - decode each SSE `data:` line into a typed `AIStreamEvent`;
 *  - normalize transport/parse/abort failures into the backend `AIError`
 *    shape, surfaced as a terminal `{ type: "error" }` event so consumers
 *    have a single, uniform failure channel;
 *  - propagate `AbortController` cancellation end-to-end.
 *
 * The `useAgent` hook consumes this and never touches `fetch`, SSE, or the
 * transport directly — that is the networking/presentation boundary.
 */

import type { AIError, AIStreamEvent } from "@/ai/types/chat";
import { parseSSEStream } from "./sse";
import { AITransportError, type AIChatTransport } from "./transport";
import { createSupabaseAIChatTransport } from "./supabaseTransport";
import type { AgentChatPayload } from "./types";

/** Options for constructing an {@link AIClient}. */
export interface AIClientConfig {
  /**
   * The transport to stream through. Defaults to the Supabase edge-function
   * transport; inject a fake here to unit-test consumers without a network.
   */
  transport?: AIChatTransport;
}

/**
 * Streams AI chat turns as typed events. Stateless and reusable — construct
 * one and share it across the app (see {@link defaultAIClient}).
 */
export class AIClient {
  private readonly transport: AIChatTransport;

  constructor(config: AIClientConfig = {}) {
    this.transport = config.transport ?? createSupabaseAIChatTransport();
  }

  /** The active transport's id — handy for logging/debugging. */
  get transportId(): string {
    return this.transport.id;
  }

  /**
   * Stream a single chat turn. Yields `delta` / `tool_call` / `done` events as
   * they arrive and always terminates — either naturally (`done`), on
   * cancellation, or with a single `error` event. Never throws for expected
   * failures; unexpected ones are converted to an `error` event too, so a
   * `for await` consumer needs no try/catch.
   */
  async *streamChat(
    payload: AgentChatPayload,
    signal: AbortSignal,
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    let body: ReadableStream<Uint8Array>;
    try {
      body = await this.transport.openChatStream(payload, signal);
    } catch (caught) {
      if (isAbort(caught, signal)) return;
      yield { type: "error", error: toAIError(caught) };
      return;
    }

    try {
      for await (const data of parseSSEStream(body, signal)) {
        const event = safeParseEvent(data);
        if (event) yield event;
      }
    } catch (caught) {
      if (isAbort(caught, signal)) return;
      yield { type: "error", error: toAIError(caught) };
    }
  }
}

/**
 * A lazily-created, app-wide default client backed by the Supabase transport.
 * Consumers that don't inject their own client fall back to this.
 */
let singleton: AIClient | null = null;
export function defaultAIClient(): AIClient {
  if (!singleton) singleton = new AIClient();
  return singleton;
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/** Parse one SSE data payload into an event, tolerating malformed lines. */
function safeParseEvent(data: string): AIStreamEvent | null {
  try {
    return JSON.parse(data) as AIStreamEvent;
  } catch {
    // A stray non-JSON keep-alive or partial line — skip it rather than fail
    // the whole stream.
    return null;
  }
}

/** True when a thrown value represents this signal's cancellation. */
function isAbort(caught: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return caught instanceof DOMException && caught.name === "AbortError";
}

/** Normalize any thrown value into the backend `AIError` shape. */
function toAIError(caught: unknown): AIError {
  if (caught instanceof AITransportError) {
    return {
      code:
        caught.status === 401 || caught.status === 403
          ? "authentication"
          : caught.status === 429
            ? "rate_limit"
            : caught.status && caught.status >= 500
              ? "provider_unavailable"
              : "network",
      message: caught.message,
      retryable:
        caught.status === 429 ||
        (typeof caught.status === "number" && caught.status >= 500) ||
        caught.status === undefined,
      cause: caught,
    };
  }

  if (caught instanceof TypeError) {
    // fetch throws a TypeError for network-level failures (DNS, offline, CORS).
    return {
      code: "network",
      message: "Network error while contacting the AI service.",
      retryable: true,
      cause: caught,
    };
  }

  return {
    code: "unknown",
    message: caught instanceof Error ? caught.message : String(caught),
    retryable: false,
    cause: caught,
  };
}
