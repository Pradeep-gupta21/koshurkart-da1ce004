/**
 * KoshurKart — AI transport seam
 * =================================================================
 * The single, provider-agnostic boundary between the frontend AI client and
 * whatever actually serves the model. A transport's only job is to open a
 * byte stream for a chat turn and hand it back; it knows nothing about SSE
 * framing, event shapes, React, or optimistic UI.
 *
 * This indirection is the crux of the "provider-agnostic frontend" goal:
 *  - production wires `createSupabaseAIChatTransport()` → the `ai-chat` edge
 *    function;
 *  - tests (or a future direct-provider mode) can supply an in-memory
 *    transport that streams canned bytes;
 * …and neither the `AIClient` nor the `useAgent` hook changes.
 */

import type { AgentChatPayload } from "./types";

/**
 * Opens a streaming chat connection to a backend and returns its raw response
 * body. Implementations own authentication and endpoint details; everything
 * downstream (SSE parsing, typing) is handled by the `AIClient`.
 */
export interface AIChatTransport {
  /** Stable identifier for logging/debugging, e.g. `"supabase-edge"`. */
  readonly id: string;

  /**
   * Start a chat turn. Resolves to the response body as a byte stream. Must
   * honour `signal` — aborting it should tear down the in-flight request.
   *
   * @throws {AITransportError} on a non-OK status or a missing body.
   */
  openChatStream(
    payload: AgentChatPayload,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
}

/**
 * A transport-level failure (auth, HTTP status, missing body). Carries the
 * HTTP status when there is one so the client can classify it into an
 * `AIError` without string-parsing.
 */
export class AITransportError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AITransportError";
    this.status = status;
  }
}
