/**
 * KoshurKart — ChatWindow
 * =================================================================
 * The presentational shell that assembles a full chat surface:
 *
 *   ConversationHeader
 *   ErrorBanner
 *   MessageList  (scrolls)
 *   Composer
 *
 * It must be rendered inside a `<ChatProvider>` (which owns the state). The
 * window itself holds no state and does no networking — it is pure layout,
 * wiring the presentational pieces together in a flex column that fills its
 * container.
 */

import { cn } from "@/lib/utils";
import { ConversationHeader } from "./ConversationHeader";
import { ErrorBanner } from "./ErrorBanner";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export interface ChatWindowProps {
  className?: string;
  /** Placeholder text for the composer input. */
  placeholder?: string;
  /** Content shown when the conversation has no messages yet. */
  emptyState?: React.ReactNode;
  /** Extra actions rendered in the header. */
  headerActions?: React.ReactNode;
  /** Hide the conversation header entirely. */
  hideHeader?: boolean;
}

export function ChatWindow({
  className,
  placeholder,
  emptyState,
  headerActions,
  hideHeader = false,
}: ChatWindowProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {!hideHeader && <ConversationHeader actions={headerActions} />}
      <ErrorBanner />
      <MessageList className="flex-1" emptyState={emptyState} />
      <Composer placeholder={placeholder} />
    </div>
  );
}
