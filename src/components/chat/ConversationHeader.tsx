/**
 * KoshurKart — ConversationHeader
 * =================================================================
 * The chat's title bar. Reads the conversation title/audience and the
 * `reset()` action from `useChat()` and offers a "New chat" control. Purely
 * presentational; accepts optional slots so a host can inject extra actions
 * without this component growing feature-specific logic.
 */

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChat } from "./ChatProvider";

const AUDIENCE_LABELS: Record<string, string> = {
  customer: "Shopping assistant",
  vendor: "Vendor assistant",
  admin: "Admin assistant",
};

export interface ConversationHeaderProps {
  className?: string;
  /** Optional extra controls rendered on the right (e.g. settings). */
  actions?: React.ReactNode;
  /** Hide the built-in "New chat" reset button. */
  hideReset?: boolean;
}

export function ConversationHeader({
  className,
  actions,
  hideReset = false,
}: ConversationHeaderProps): JSX.Element {
  const { title, audience, reset, loading } = useChat();
  const heading = title ?? AUDIENCE_LABELS[audience] ?? "Assistant";

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-foreground">{heading}</h2>
        <p className="text-xs capitalize text-muted-foreground">{audience}</p>
      </div>

      <div className="flex items-center gap-1">
        {actions}
        {!hideReset && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={loading}
            className="gap-1"
            aria-label="Start a new chat"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New chat
          </Button>
        )}
      </div>
    </header>
  );
}
