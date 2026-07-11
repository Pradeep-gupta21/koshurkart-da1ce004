/**
 * KoshurKart — MemoryEvent
 * =================================================================
 * A one-line indicator that the agent recalled or persisted memory during the
 * turn (e.g. "Recalled 5 memories · conversation"). Presentation only — it
 * renders the `MemoryEventData` the hook surfaces from `memory` stream events.
 */

import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemoryEventData } from "@/lib/ai";

export interface MemoryEventProps {
  data: MemoryEventData;
  className?: string;
}

function summarize(data: MemoryEventData): string {
  if (data.note) return data.note;
  const verb = data.phase === "persist" ? "Saved" : "Recalled";
  const noun =
    data.count === undefined
      ? "memory"
      : `${data.count} ${data.count === 1 ? "memory" : "memories"}`;
  const scope = data.scope ? ` · ${data.scope}` : "";
  return `${verb} ${noun}${scope}`;
}

export function MemoryEvent({ data, className }: MemoryEventProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Brain className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{summarize(data)}</span>
    </div>
  );
}
