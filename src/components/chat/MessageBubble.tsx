/**
 * KoshurKart — MessageBubble
 * =================================================================
 * Renders a single conversation message. Presentation only: it receives an
 * `AgentMessage` and styles it by `role` (user / assistant / system / tool)
 * and `status` (streaming / error / cancelled). It never fetches, mutates, or
 * derives business data — the bubble is a pure function of its message.
 *
 * Memoized: because `useAgent` preserves object identity for unchanged
 * messages, only the bubble whose message actually changed (the streaming
 * assistant reply) re-renders as tokens arrive.
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { AgentMessage, ToolInvocationState } from "@/lib/ai";
import { Markdown } from "./Markdown";
import { StreamingCursor } from "./StreamingCursor";
import { TypingIndicator } from "./TypingIndicator";
import { ToolCard } from "./ToolCard";

export interface MessageBubbleProps {
  message: AgentMessage;
}

/** Per-role container + bubble styling (text-bearing roles only). */
const ROLE_STYLES: Record<
  "user" | "assistant" | "system",
  { row: string; bubble: string; label: string }
> = {
  user: {
    row: "justify-end",
    bubble: "bg-primary text-primary-foreground rounded-br-sm",
    label: "You",
  },
  assistant: {
    row: "justify-start",
    bubble: "bg-muted text-foreground rounded-bl-sm",
    label: "Assistant",
  },
  system: {
    row: "justify-center",
    bubble:
      "bg-transparent text-muted-foreground text-xs italic border border-dashed border-border",
    label: "System",
  },
};

/** Adapt a persisted `role: "tool"` message into a `ToolInvocationState`. */
function toolInvocationFromMessage(message: AgentMessage): ToolInvocationState {
  const toolName =
    typeof message.metadata?.toolName === "string"
      ? (message.metadata.toolName as string)
      : "tool";
  return {
    id: message.toolCallId ?? message.id,
    name: toolName,
    status: message.status === "error" ? "failed" : "succeeded",
    result: message.content,
    isError: message.status === "error",
  };
}

function MessageBubbleImpl({ message }: MessageBubbleProps): JSX.Element {
  // Tool messages get a dedicated card rather than a chat bubble.
  if (message.role === "tool") {
    return (
      <li className="flex w-full justify-start" data-role="tool">
        <div className="max-w-[85%]">
          <ToolCard invocation={toolInvocationFromMessage(message)} />
        </div>
      </li>
    );
  }

  const styles = ROLE_STYLES[message.role];
  const isStreaming = message.status === "streaming";
  const isPending = message.status === "pending";
  const isError = message.status === "error";
  const isCancelled = message.status === "cancelled";
  const isEmpty = message.content.trim().length === 0;
  // A freshly-created assistant reply with no tokens yet: show typing dots.
  const isAwaitingFirstToken = isPending && isEmpty && message.role === "assistant";

  return (
    <li
      className={cn("flex w-full", styles.row)}
      data-role={message.role}
      data-status={message.status}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm",
          styles.bubble,
          isError && "border border-destructive/50",
        )}
      >
        <span className="sr-only">{styles.label} said: </span>

        {/* Content */}
        {isAwaitingFirstToken ? (
          <TypingIndicator />
        ) : (
          <div className="inline">
            {!isEmpty && <Markdown content={message.content} />}
            {isStreaming && <StreamingCursor />}
          </div>
        )}

        {/* Status footnotes */}
        {isError && message.error && (
          <p className="mt-1.5 text-xs text-destructive">
            {message.error.message}
          </p>
        )}
        {isCancelled && (
          <p className="mt-1.5 text-xs text-muted-foreground">Stopped.</p>
        )}
      </div>
    </li>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
