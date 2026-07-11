/**
 * KoshurKart — ReflectionCard
 * =================================================================
 * Surfaces the agent's self-reflection outcome: whether it judged its answer
 * successful, any feedback, and whether it self-corrected. Presentation only —
 * it renders the fields the hook surfaces from `reflection` stream events.
 */

import { Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReflectionCardProps {
  phase: "start" | "complete";
  success?: boolean;
  feedback?: string;
  selfCorrected?: boolean;
  className?: string;
}

export function ReflectionCard({
  phase,
  success,
  feedback,
  selfCorrected,
  className,
}: ReflectionCardProps): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/50 p-2.5 text-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {phase === "start"
          ? "Reviewing the answer…"
          : success
            ? "Self-review passed"
            : "Self-review found gaps"}
        {selfCorrected && (
          <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            self-corrected
          </span>
        )}
      </div>
      {feedback && <p className="mt-1 text-muted-foreground">{feedback}</p>}
    </div>
  );
}
