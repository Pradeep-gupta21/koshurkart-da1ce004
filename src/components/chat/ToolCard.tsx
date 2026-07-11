/**
 * KoshurKart — ToolCard
 * =================================================================
 * Renders a single tool invocation (a `tool_call` merged with its
 * `tool_result`) as a compact, collapsible card: the tool name, a status
 * indicator (running / succeeded / failed), and — on demand — its arguments
 * and result. Purely presentational: it receives a `ToolInvocationState` and
 * renders it; it never calls a tool or fetches anything.
 *
 * Used both for live tool activity (from the stream) and for persisted
 * `role: "tool"` messages, via the small adapter in `MessageBubble`.
 */

import { CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolInvocationState } from "@/lib/ai";

export interface ToolCardProps {
  invocation: ToolInvocationState;
  className?: string;
}

function StatusIcon({ status }: { status: ToolInvocationState["status"] }): JSX.Element {
  if (status === "running") {
    return (
      <Loader2
        className="h-3.5 w-3.5 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
    );
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
}

const STATUS_LABEL: Record<ToolInvocationState["status"], string> = {
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
};

export function ToolCard({ invocation, className }: ToolCardProps): JSX.Element {
  const { name, arguments: args, result, status } = invocation;
  const hasArgs = args && Object.keys(args).length > 0;
  const hasResult = result !== undefined && result !== null && status !== "running";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/50 text-xs text-card-foreground",
        className,
      )}
      data-status={status}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono font-medium">{name}</span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <StatusIcon status={status} />
          <span className="sr-only">Tool {STATUS_LABEL[status]}</span>
          <span aria-hidden="true">{STATUS_LABEL[status]}</span>
        </span>
      </div>

      {(hasArgs || hasResult) && (
        <details className="border-t border-border/60 px-3 py-2">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Details
          </summary>
          {hasArgs && (
            <div className="mt-2">
              <p className="mb-1 font-medium text-muted-foreground">Arguments</p>
              <JsonBlock value={args} />
            </div>
          )}
          {hasResult && (
            <div className="mt-2">
              <p className="mb-1 font-medium text-muted-foreground">Result</p>
              <JsonBlock value={result} />
            </div>
          )}
        </details>
      )}
    </div>
  );
}

/** Pretty-print a JSON-ish value; falls back to String() for non-serializable input. */
function JsonBlock({ value }: { value: unknown }): JSX.Element {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
      {text}
    </pre>
  );
}
