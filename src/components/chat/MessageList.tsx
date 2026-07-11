/**
 * KoshurKart — MessageList
 * =================================================================
 * Renders the conversation as an accessible message log inside an `AutoScroll`
 * viewport. It reads messages from `useChat()` and delegates each one to a
 * memoized `MessageBubble`, so streaming updates re-render only the single
 * changed bubble rather than the whole list.
 *
 * Presentation only: no networking, no derived business state — just mapping
 * conversation state to bubbles plus an empty state.
 */

import { useChat } from "./ChatProvider";
import { MessageBubble } from "./MessageBubble";
import { AutoScroll } from "./AutoScroll";
import { ActivityTimeline } from "./ActivityTimeline";
import { cn } from "@/lib/utils";

export interface MessageListProps {
  className?: string;
  /** Message shown when the conversation is empty. */
  emptyState?: React.ReactNode;
}

export function MessageList({ className, emptyState }: MessageListProps): JSX.Element {
  const { messages } = useChat();

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {emptyState ?? "Ask me anything to get started."}
      </div>
    );
  }

  return (
    <AutoScroll className={className}>
      <div className="flex flex-col">
        <ol
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation"
          className={cn("flex flex-col gap-3 p-4")}
        >
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ol>
        {/* Orchestration activity for the in-progress turn (memory, plan,
            delegation, tools, reflection, jobs). Renders nothing when idle. */}
        <ActivityTimeline />
      </div>
    </AutoScroll>
  );
}
