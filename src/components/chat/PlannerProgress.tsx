/**
 * KoshurKart — PlannerProgress
 * =================================================================
 * Visualizes an execution plan produced by the backend planner: the objective
 * plus each step and its live status (pending → running → succeeded/failed…).
 * Presentation only — it renders the `PlanInfo` snapshot the hook derives from
 * `plan` stream events and holds no logic of its own.
 */

import { Check, Circle, Loader2, SkipForward, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanInfo, PlanStepStatus } from "@/lib/ai";

export interface PlannerProgressProps {
  plan: PlanInfo;
  className?: string;
}

function StepIcon({ status }: { status: PlanStepStatus }): JSX.Element {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />;
    case "succeeded":
      return <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    case "cancelled":
      return <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />;
  }
}

export function PlannerProgress({ plan, className }: PlannerProgressProps): JSX.Element {
  const done = plan.steps.filter(
    (s) => s.status === "succeeded" || s.status === "skipped",
  ).length;

  return (
    <section
      aria-label="Execution plan"
      className={cn("rounded-lg border border-border bg-card/50 p-3 text-xs", className)}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">Plan</span>
        <span className="text-muted-foreground" aria-live="polite">
          {done}/{plan.steps.length} steps
        </span>
      </header>

      {plan.objective && (
        <p className="mb-2 text-muted-foreground">{plan.objective}</p>
      )}

      <ol className="space-y-1.5">
        {plan.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2" data-status={step.status}>
            <span className="mt-0.5 shrink-0">
              <StepIcon status={step.status} />
            </span>
            <span
              className={cn(
                "leading-snug",
                step.status === "succeeded" && "text-muted-foreground line-through",
                step.status === "running" && "font-medium text-foreground",
              )}
            >
              {step.description}
              {step.toolName && (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  ({step.toolName})
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
