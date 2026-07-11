/**
 * KoshurKart — ChatProvider
 * =================================================================
 * The single owner of chat conversation state. It instantiates the `useAgent`
 * hook exactly once and exposes its result (messages, loading, streaming,
 * error, and the send/cancel/retry/reset actions) to the component tree via
 * React context.
 *
 * This is the ONLY place in the chat UI that touches the networking layer.
 * Every presentational component below reads state through `useChat()` and
 * never imports `useAgent`, `AIClient`, `fetch`, or Supabase — that keeps
 * presentation and networking cleanly separated and makes the whole UI
 * testable by wrapping it in a provider backed by a fake client.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAgent, type UseAgentOptions, type UseAgentResult } from "@/hooks/useAgent";
import type { ChatAudience } from "@/lib/ai";

/**
 * Everything the chat UI can read. Extends the hook's result with a little
 * presentational context (the surface it serves and an optional title).
 */
export interface ChatContextValue extends UseAgentResult {
  /** Which surface this conversation belongs to (customer/vendor/admin). */
  readonly audience: ChatAudience;
  /** Optional human-readable conversation title, shown in the header. */
  readonly title?: string;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/** Props for {@link ChatProvider}: the hook's options plus a title. */
export interface ChatProviderProps extends UseAgentOptions {
  /** Optional conversation title surfaced by `ConversationHeader`. */
  title?: string;
  children: ReactNode;
}

export function ChatProvider({
  title,
  children,
  ...agentOptions
}: ChatProviderProps): JSX.Element {
  const agent = useAgent(agentOptions);

  const value = useMemo<ChatContextValue>(
    () => ({ ...agent, audience: agentOptions.audience, title }),
    [agent, agentOptions.audience, title],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/**
 * Read chat state/actions from the nearest {@link ChatProvider}. Throws if
 * used outside one, so misuse fails loudly during development.
 */
export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a <ChatProvider>.");
  }
  return ctx;
}
