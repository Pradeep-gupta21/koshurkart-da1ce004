/**
 * KoshurKart — TypingIndicator
 * =================================================================
 * The three-dot "assistant is thinking" animation shown after a turn is sent
 * but before the first streamed token arrives. Purely presentational; exposes
 * an accessible label so screen readers announce that a reply is coming.
 */

import { cn } from "@/lib/utils";

export interface TypingIndicatorProps {
  className?: string;
}

const DOT = "h-1.5 w-1.5 rounded-full bg-current animate-bounce";

export function TypingIndicator({ className }: TypingIndicatorProps): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Assistant is typing"
      className={cn("flex items-center gap-1 text-muted-foreground", className)}
    >
      <span className={DOT} style={{ animationDelay: "0ms" }} />
      <span className={DOT} style={{ animationDelay: "150ms" }} />
      <span className={DOT} style={{ animationDelay: "300ms" }} />
      <span className="sr-only">Assistant is typing…</span>
    </div>
  );
}
