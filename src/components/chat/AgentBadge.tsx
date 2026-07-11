/**
 * KoshurKart — AgentBadge
 * =================================================================
 * A small pill showing which sub-agent is handling the turn when the primary
 * agent delegates. Presentation only — it renders the agent name/objective the
 * hook surfaces from `delegation` events.
 */

import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentBadgeProps {
  /** Machine/display name of the agent currently handling the turn. */
  agent: string;
  /** Optional objective the agent was delegated. */
  objective?: string;
  className?: string;
}

export function AgentBadge({ agent, objective, className }: AgentBadgeProps): JSX.Element {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground",
        className,
      )}
    >
      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        <span className="sr-only">Delegated to </span>
        <span className="font-medium">{agent}</span>
        {objective && <span className="text-muted-foreground"> · {objective}</span>}
      </span>
    </div>
  );
}
