/**
 * KoshurKart — StreamingCursor
 * =================================================================
 * A blinking caret appended to an assistant message while its text is still
 * streaming in. Pure decoration: it carries no state and is hidden from
 * assistive tech (the streamed text itself is announced by the message log).
 */

import { cn } from "@/lib/utils";

export interface StreamingCursorProps {
  className?: string;
}

export function StreamingCursor({ className }: StreamingCursorProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-sm bg-current align-middle",
        className,
      )}
    />
  );
}
