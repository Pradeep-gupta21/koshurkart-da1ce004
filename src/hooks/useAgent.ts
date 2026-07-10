/**
 * KoshurKart — useAgent
 * =================================================================
 * The React binding for the AI Operating System. It owns *conversation state*
 * and the *turn lifecycle*; it owns no networking. All transport, SSE parsing,
 * and error normalization live behind the injected `AIClient` (`@/lib/ai`), so
 * this hook stays a thin, strongly-typed state machine that any presentation
 * layer can drive — the networking/presentation separation the architecture
 * requires.
 *
 * Capabilities:
 *  - **Streaming**: assistant text is appended delta-by-delta as it arrives.
 *  - **Cancellation**: every turn runs under an `AbortController`; `cancel()`
 *    tears down the in-flight request and marks the reply `cancelled`.
 *  - **Optimistic UI**: the user message and an assistant placeholder appear
 *    immediately, before the network responds.
 *  - **Retry**: `retry()` re-runs the last user turn without re-typing it.
 *
 * The hook never throws for expected failures — errors surface through the
 * `error` field and the failing message's `status`/`error`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIClient, defaultAIClient } from "@/lib/ai";
import type {
  AgentChatPayload,
  AgentMessage,
  AIError,
  ChatAudience,
} from "@/lib/ai";

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Configuration for {@link useAgent}. Only `audience` is required. */
export interface UseAgentOptions {
  /** Which surface is talking — selects the agent/system prompt server-side. */
  audience: ChatAudience;
  /** Conversation to continue; omit to start a fresh thread. */
  conversationId?: string;
  /** Optional session correlation id passed through to the backend. */
  sessionId?: string;
  /**
   * The networking client. Defaults to the app-wide Supabase-backed client;
   * inject a client built on a fake transport to test consumers offline.
   */
  client?: AIClient;
  /** Seed messages to render on mount (e.g. a restored conversation). */
  initialMessages?: AgentMessage[];
  /** Id generator for new messages. Defaults to `crypto.randomUUID`. */
  generateId?: () => string;
  /** Called once per turn when the assistant reply completes successfully. */
  onFinish?: (message: AgentMessage) => void;
  /** Called when a turn fails, with the normalized error. */
  onError?: (error: AIError) => void;
}

/** The strongly-typed surface returned by {@link useAgent}. */
export interface UseAgentResult {
  /** The full conversation, oldest first, including optimistic placeholders. */
  readonly messages: AgentMessage[];
  /** True from `send()`/`retry()` until the turn fully settles. */
  readonly loading: boolean;
  /** True only while assistant deltas are actively arriving. */
  readonly streaming: boolean;
  /** The most recent turn error, or `null`. Cleared when a new turn starts. */
  readonly error: AIError | null;
  /** Send a user message and stream the assistant reply. No-op if blank. */
  send: (text: string) => Promise<void>;
  /** Abort the in-flight turn (if any) and mark the reply `cancelled`. */
  cancel: () => void;
  /** Re-run the last user turn. No-op if nothing has been sent yet. */
  retry: () => Promise<void>;
  /** Clear all messages/error and abort any in-flight turn. */
  reset: () => void;
}

/* ------------------------------------------------------------------ *
 * Hook
 * ------------------------------------------------------------------ */

export function useAgent(options: UseAgentOptions): UseAgentResult {
  const { audience, conversationId, sessionId } = options;

  const [messages, setMessages] = useState<AgentMessage[]>(
    () => options.initialMessages ?? [],
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [streaming, setStreaming] = useState<boolean>(false);
  const [error, setError] = useState<AIError | null>(null);

  // Stable dependencies — memoized so they don't re-create the callbacks.
  const client = useMemo<AIClient>(
    () => options.client ?? defaultAIClient(),
    [options.client],
  );
  const generateId = useMemo<() => string>(
    () => options.generateId ?? defaultGenerateId,
    [options.generateId],
  );

  // Refs for values read inside the async loop without re-binding callbacks.
  const abortRef = useRef<AbortController | null>(null);
  const lastUserTextRef = useRef<string | null>(null);
  const onFinishRef = useRef<UseAgentOptions["onFinish"]>(options.onFinish);
  const onErrorRef = useRef<UseAgentOptions["onError"]>(options.onError);
  onFinishRef.current = options.onFinish;
  onErrorRef.current = options.onError;

  // Abort any in-flight turn when the component unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  /**
   * The core turn engine: append an assistant placeholder, stream the reply,
   * and reconcile terminal state. `appendUser` distinguishes a fresh send
   * (append the user message too) from a retry (reuse the existing one).
   */
  const runTurn = useCallback(
    async (text: string, appendUser: boolean): Promise<void> => {
      // Cancel any previous turn before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = generateId();
      lastUserTextRef.current = text;

      setError(null);
      setLoading(true);
      setStreaming(false);
      setMessages((prev) => {
        const next = appendUser
          ? [...prev, makeUserMessage(generateId(), text)]
          : [...prev];
        next.push(makeAssistantPlaceholder(assistantId));
        return next;
      });

      const payload: AgentChatPayload = {
        audience,
        message: text,
        conversationId,
        sessionId,
      };

      // Local accumulators avoid reading React state mid-stream.
      let content = "";
      let errored = false;

      try {
        for await (const event of client.streamChat(payload, controller.signal)) {
          switch (event.type) {
            case "delta": {
              if (!event.content) break;
              content += event.content;
              setStreaming(true);
              setMessages((prev) =>
                patch(prev, assistantId, (m) => ({
                  ...m,
                  content: m.content + event.content,
                  status: "streaming",
                })),
              );
              break;
            }
            case "tool_call": {
              setMessages((prev) =>
                patch(prev, assistantId, (m) => ({
                  ...m,
                  toolCalls: [...(m.toolCalls ?? []), event.toolCall],
                })),
              );
              break;
            }
            case "done": {
              setMessages((prev) =>
                patch(prev, assistantId, (m) => ({
                  ...m,
                  status: "complete",
                  metadata: {
                    ...(m.metadata ?? {}),
                    finishReason: event.finishReason,
                    ...(event.usage ? { usage: event.usage } : {}),
                  },
                })),
              );
              break;
            }
            case "error": {
              errored = true;
              setError(event.error);
              setMessages((prev) =>
                patch(prev, assistantId, (m) => ({
                  ...m,
                  status: "error",
                  error: event.error,
                })),
              );
              onErrorRef.current?.(event.error);
              break;
            }
          }
        }
      } finally {
        setLoading(false);
        setStreaming(false);

        if (controller.signal.aborted) {
          // User cancelled: keep whatever streamed so far, mark it cancelled.
          setMessages((prev) =>
            patch(prev, assistantId, (m) =>
              isPendingOrStreaming(m) ? { ...m, status: "cancelled" } : m,
            ),
          );
        } else if (!errored) {
          // Stream ended cleanly (with or without an explicit `done`).
          setMessages((prev) =>
            patch(prev, assistantId, (m) =>
              isPendingOrStreaming(m) ? { ...m, status: "complete" } : m,
            ),
          );
          onFinishRef.current?.({
            ...makeAssistantPlaceholder(assistantId),
            content,
            status: "complete",
          });
        }

        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [audience, conversationId, sessionId, client, generateId],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await runTurn(trimmed, true);
    },
    [runTurn],
  );

  const retry = useCallback(async (): Promise<void> => {
    const last = lastUserTextRef.current;
    if (!last) return;
    // Drop a trailing failed/cancelled assistant reply so retry replaces it.
    setMessages((prev) => dropTrailingIncompleteAssistant(prev));
    await runTurn(last, false);
  }, [runTurn]);

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    lastUserTextRef.current = null;
    setMessages([]);
    setError(null);
    setLoading(false);
    setStreaming(false);
  }, []);

  return { messages, loading, streaming, error, send, cancel, retry, reset };
}

/* ------------------------------------------------------------------ *
 * Pure helpers (no React) — presentation-free message transforms
 * ------------------------------------------------------------------ */

/** Replace the message with `id` by applying `fn`; others pass through. */
function patch(
  messages: AgentMessage[],
  id: string,
  fn: (m: AgentMessage) => AgentMessage,
): AgentMessage[] {
  return messages.map((m) => (m.id === id ? fn(m) : m));
}

function isPendingOrStreaming(m: AgentMessage): boolean {
  return m.status === "pending" || m.status === "streaming";
}

function makeUserMessage(id: string, content: string): AgentMessage {
  return {
    id,
    role: "user",
    content,
    createdAt: Date.now(),
    status: "complete",
  };
}

function makeAssistantPlaceholder(id: string): AgentMessage {
  return {
    id,
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    status: "pending",
  };
}

/**
 * Remove the last message if it is an assistant reply that ended in
 * `error`/`cancelled` (so `retry()` can regenerate it in place). A successful
 * reply is left untouched.
 */
function dropTrailingIncompleteAssistant(
  messages: AgentMessage[],
): AgentMessage[] {
  const last = messages[messages.length - 1];
  if (
    last &&
    last.role === "assistant" &&
    (last.status === "error" || last.status === "cancelled")
  ) {
    return messages.slice(0, -1);
  }
  return messages;
}

/** Default id generator: `crypto.randomUUID` with a safe fallback. */
function defaultGenerateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
