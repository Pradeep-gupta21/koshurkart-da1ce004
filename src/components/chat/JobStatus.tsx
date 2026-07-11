/**
 * KoshurKart — JobStatus
 * =================================================================
 * Shows a background job the agent queued and its current status. Presentation
 * only — it renders the `JobInfo` the hook surfaces from `job` stream events
 * (which update in place as the job progresses).
 */

import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobInfo } from "@/lib/ai";

export interface JobStatusProps {
  job: JobInfo;
  className?: string;
}

function JobIcon({ status }: { status: JobInfo["status"] }): JSX.Element {
  switch (status) {
    case "queued":
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />;
    case "succeeded":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />;
  }
}

export function JobStatus({ job, className }: JobStatusProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs",
        className,
      )}
      data-status={job.status}
    >
      <JobIcon status={job.status} />
      <span className="font-medium">{job.kind ?? "Background job"}</span>
      <span className="ml-auto capitalize text-muted-foreground">{job.status}</span>
      {job.note && <span className="text-muted-foreground">· {job.note}</span>}
    </div>
  );
}
