/**
 * KoshurKart — ActivityTimeline
 * =================================================================
 * Renders the current turn's orchestration activity — memory recalls, agent
 * delegation, planner progress, tool invocations, reflection, and background
 * jobs — in the order the backend emitted them. It reads the reduced state
 * from `useChat()` and delegates each entry to a dedicated presentational
 * component. No networking, no reduction logic (that lives in `useAgent`).
 *
 * It renders nothing when there is no activity, so a plain streaming reply is
 * visually unaffected.
 */

import { cn } from "@/lib/utils";
import { useChat } from "./ChatProvider";
import { MemoryEvent } from "./MemoryEvent";
import { AgentBadge } from "./AgentBadge";
import { PlannerProgress } from "./PlannerProgress";
import { ToolCard } from "./ToolCard";
import { ReflectionCard } from "./ReflectionCard";
import { JobStatus } from "./JobStatus";

export interface ActivityTimelineProps {
  className?: string;
}

export function ActivityTimeline({ className }: ActivityTimelineProps): JSX.Element | null {
  const { activity } = useChat();

  if (activity.length === 0) return null;

  return (
    <div
      className={cn("flex flex-col gap-2 px-4 pb-2", className)}
      aria-label="Assistant activity"
    >
      {activity.map((entry) => {
        switch (entry.kind) {
          case "memory":
            return <MemoryEvent key={entry.id} data={entry.data} />;
          case "delegation":
            return entry.phase === "start" ? (
              <AgentBadge key={entry.id} agent={entry.agent} objective={entry.objective} />
            ) : null;
          case "plan":
            return <PlannerProgress key={entry.id} plan={entry.plan} />;
          case "tool":
            return <ToolCard key={entry.id} invocation={entry.invocation} />;
          case "reflection":
            return (
              <ReflectionCard
                key={entry.id}
                phase={entry.phase}
                success={entry.success}
                feedback={entry.feedback}
                selfCorrected={entry.selfCorrected}
              />
            );
          case "job":
            return <JobStatus key={entry.id} job={entry.job} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
