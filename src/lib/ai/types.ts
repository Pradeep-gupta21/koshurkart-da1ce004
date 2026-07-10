/**
 * KoshurKart — Frontend AI types
 * =================================================================
 * The type surface the React layer speaks in. It deliberately builds on the
 * *backend* wire contract (`@/ai/types/chat`) rather than redefining it, so
 * the frontend and the AI Operating System can never drift apart: the exact
 * `ChatMessage`, `AIStreamEvent`, and `AIError` the `ai-chat` edge function
 * emits are the ones the client parses and the hook renders.
 *
 * Everything here is presentation-agnostic. These types describe *data*, not
 * components — the networking layer (`client.ts`) produces them and the
 * `useAgent` hook holds them; no React or DOM concept appears in this file.
 */

import type {
  AIError,
  AIStreamEvent,
  ChatAudience,
  ChatMessage,
  ChatRole,
  FinishReason,
  TokenUsage,
  ToolCall,
} from "@/ai/types/chat";

/* Re-export the backend wire types so consumers import AI types from one
 * place and never reach into the backend module directly. */
export type {
  AIError,
  AIErrorCode,
  AIStreamEvent,
  ChatAudience,
  ChatMessage,
  ChatRole,
  FinishReason,
  TokenUsage,
  ToolCall,
} from "@/ai/types/chat";

/* ------------------------------------------------------------------ *
 * UI message model
 * ------------------------------------------------------------------ */

/**
 * Lifecycle of a message as the UI sees it. Backend `ChatMessage`s have no
 * notion of "still arriving"; the frontend needs one to drive spinners,
 * streaming cursors, and optimistic placeholders.
 *  - `pending`   — sent/created locally, not yet acknowledged by the server.
 *  - `streaming` — assistant reply is actively receiving deltas.
 *  - `complete`  — finished successfully (terminal).
 *  - `error`     — generation failed for this message (terminal).
 *  - `cancelled` — aborted by the user before completion (terminal).
 */
export type AgentMessageStatus =
  | "pending"
  | "streaming"
  | "complete"
  | "error"
  | "cancelled";

/**
 * A `ChatMessage` enriched with the UI-only state the renderer needs. It
 * *extends* the backend message (never mutates its shape), so an
 * `AgentMessage` is always a valid `ChatMessage` and can be sent straight
 * back to the backend if needed.
 */
export interface AgentMessage extends ChatMessage {
  /** Where this message is in its lifecycle. */
  status: AgentMessageStatus;
  /** Populated only when `status === "error"`. */
  error?: AIError;
}

/* ------------------------------------------------------------------ *
 * Request payload
 * ------------------------------------------------------------------ */

/**
 * The body accepted by the backend `ai-chat` endpoint. Mirrors the edge
 * function's request schema exactly (audience + message + optional
 * correlation ids), keeping the frontend honest about the backend contract.
 */
export interface AgentChatPayload {
  /** Which surface is talking — selects the agent + system prompt server-side. */
  audience: ChatAudience;
  /** The user's natural-language turn. */
  message: string;
  /** Conversation to continue, when resuming an existing thread. */
  conversationId?: string;
  /** Session correlation id, when the caller tracks one. */
  sessionId?: string;
}

/* Convenience aliases so hook consumers don't import the wire union name. */
export type { AIStreamEvent as AgentStreamEvent };
