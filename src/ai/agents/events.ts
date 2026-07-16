/**
 * KoshurKart — Rich agent stream events
 * =================================================================
 * The provider-agnostic event protocol the AI Operating System streams over
 * SSE while running a turn. It is a strict *superset* of the base
 * `AIStreamEvent` (`delta` / `tool_call` / `done` / `error`) — those still
 * flow unchanged — plus typed orchestration events that let a UI (or any
 * observer) watch the machinery work in real time:
 *
 *   planner     → plan_start · plan_step · plan_complete
 *   memory      → memory_search · memory_hit · memory_store
 *   reflection  → reflection_start · reflection_complete
 *   jobs        → job_start · job_progress · job_complete
 *   tools       → tool_start · tool_result · tool_error
 *
 * Everything here is plain, serializable data — no provider SDKs, no network,
 * no marketplace specifics. Events serialize to the SAME SSE framing the
 * `ai-chat` edge function already uses (`data: <json>\n\n`, `[DONE]`), so the
 * wire protocol is preserved; only the vocabulary of events grows.
 *
 * This module also ships the plumbing that produces these events:
 *  - `AgentEventStream` — a push-to-async-iterable queue that bridges
 *    imperative orchestration (the planner's synchronous emitter, a job
 *    executor's progress callback) into an `AsyncIterable` a generator yields.
 *  - `createPlannerBridge` — maps the planner's `PlannerEvent`s onto `plan_*`.
 *  - `streamJob` — runs a `JobExecutor` while emitting `job_*` events.
 */

import type {
  AIErrorCode,
  AIStreamEvent,
  FinishReason,
  TokenUsage,
} from "@/ai/types/chat";
import type { AnyPlanStep, PlannerEvent, PlannerEventListener } from "@/ai/planner";
import type { Job, JobExecutor } from "@/ai/jobs/types";

/* ------------------------------------------------------------------ *
 * Shared payload shapes
 * ------------------------------------------------------------------ */

/** Which memory tier an event concerns. */
export type MemoryScope = "session" | "conversation" | "user";

/** A planner step as surfaced on a `plan_*` event. */
export interface PlanStepEventInfo {
  id: string;
  description: string;
  status: string;
  toolName?: string;
}

/* ------------------------------------------------------------------ *
 * The event union
 * ------------------------------------------------------------------ */

/**
 * Every event a streamed agent turn can emit. The base `AIStreamEvent`
 * variants cover assistant text/tool-request/done/error; the rest describe
 * orchestration and use flat, self-describing `type` discriminants.
 */
export type AgentStreamEvent =
  | AIStreamEvent
  // --- Planner ---------------------------------------------------------
  | {
      type: "plan_start";
      planId: string;
      objective?: string;
      steps: PlanStepEventInfo[];
    }
  | {
      type: "plan_step";
      planId: string;
      step: PlanStepEventInfo;
      status: string;
    }
  | {
      type: "plan_complete";
      planId: string;
      status: "completed" | "failed" | "cancelled";
      steps: PlanStepEventInfo[];
    }
  // --- Memory ----------------------------------------------------------
  | { type: "memory_search"; scope: MemoryScope; query?: string }
  | { type: "memory_hit"; scope: MemoryScope; count: number; note?: string }
  | { type: "memory_store"; scope: MemoryScope; count: number }
  // --- Reflection ------------------------------------------------------
  | { type: "reflection_start" }
  | {
      type: "reflection_complete";
      success: boolean;
      feedback?: string;
      selfCorrected: boolean;
    }
  // --- Background jobs -------------------------------------------------
  | { type: "job_start"; jobId: string; kind: string }
  | { type: "job_progress"; jobId: string; progress: number }
  | {
      type: "job_complete";
      jobId: string;
      status: "completed" | "failed";
      result?: unknown;
      error?: string;
    }
  // --- Tool execution --------------------------------------------------
  | {
      type: "tool_start";
      toolCallId: string;
      name: string;
      arguments?: Record<string, unknown>;
    }
  | { type: "tool_result"; toolCallId: string; name: string; result: unknown }
  | { type: "tool_error"; toolCallId: string; name: string; error: string };

/** The orchestration-only discriminants (everything except the base events). */
export type AgentOrchestrationEventType = Exclude<
  AgentStreamEvent["type"],
  AIStreamEvent["type"]
>;

/* ------------------------------------------------------------------ *
 * Convenience constructors for the final `done` event
 * ------------------------------------------------------------------ */

/** Build a terminal `done` event. */
export function doneEvent(
  finishReason: FinishReason,
  usage?: TokenUsage,
): AgentStreamEvent {
  return usage
    ? { type: "done", finishReason, usage }
    : { type: "done", finishReason };
}

/** Build an `error` event from a message. */
export function errorEvent(
  message: string,
  code: AIErrorCode = "unknown",
  retryable = false,
): AgentStreamEvent {
  return { type: "error", error: { code, message, retryable } };
}

/* ------------------------------------------------------------------ *
 * AgentEventStream — push → async iterable
 * ------------------------------------------------------------------ */

/**
 * An unbounded queue that turns imperative `emit()` calls into an
 * `AsyncIterable<AgentStreamEvent>`. Producers push events (and eventually
 * `close()`); a single consumer iterates them with `for await`. Used to bridge
 * the planner's synchronous emitter and a job executor's progress callback
 * into a generator's output.
 */
export class AgentEventStream implements AsyncIterable<AgentStreamEvent> {
  private readonly buffer: AgentStreamEvent[] = [];
  private readonly waiters: Array<
    (result: IteratorResult<AgentStreamEvent>) => void
  > = [];
  private closed = false;

  /** Push an event to the stream. No-op once closed. */
  emit(event: AgentStreamEvent): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.buffer.push(event);
    }
  }

  /** Signal end-of-stream. Idempotent. Pending/future iterations complete. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    let waiter: ((r: IteratorResult<AgentStreamEvent>) => void) | undefined;
    while ((waiter = this.waiters.shift())) {
      waiter({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentStreamEvent> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as AgentStreamEvent;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<AgentStreamEvent>>(
        (resolve) => this.waiters.push(resolve),
      );
      if (result.done) return;
      yield result.value;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Planner → plan_* bridge
 * ------------------------------------------------------------------ */

/** Project a plan step onto the compact info a `plan_*` event carries. */
export function planStepInfo(step: AnyPlanStep): PlanStepEventInfo {
  return {
    id: step.id,
    description: step.description,
    status: step.status,
    toolName: step.toolName,
  };
}

/** Narrow a planner plan status to the three terminal `plan_complete` states. */
function terminalPlanStatus(
  status: string,
): "completed" | "failed" | "cancelled" {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

/**
 * Build a `PlannerEventListener` that maps the planner's lifecycle events onto
 * `plan_start` / `plan_step` / `plan_complete` and forwards them to `emit`.
 * Stateful only in that it remembers the current plan id so step events (which
 * don't carry it) can be attributed.
 */
export function createPlannerBridge(
  emit: (event: AgentStreamEvent) => void,
): PlannerEventListener {
  let planId = "";

  return (event: PlannerEvent): void => {
    switch (event.type) {
      case "planning:complete":
        planId = event.plan.id;
        emit({
          type: "plan_start",
          planId,
          objective: event.plan.goal.objective,
          steps: event.plan.steps.map(planStepInfo),
        });
        break;
      case "execution:start":
        planId = event.planId;
        break;
      case "step:start":
        emit({
          type: "plan_step",
          planId,
          step: planStepInfo(event.step),
          status: "running",
        });
        break;
      case "step:retry":
        emit({
          type: "plan_step",
          planId,
          step: planStepInfo(event.step),
          status: "running",
        });
        break;
      case "step:complete":
        emit({
          type: "plan_step",
          planId,
          step: planStepInfo(event.step),
          status: event.step.status,
        });
        break;
      case "execution:complete":
        emit({
          type: "plan_complete",
          planId: event.plan.id,
          status: terminalPlanStatus(event.plan.status),
          steps: event.plan.steps.map(planStepInfo),
        });
        break;
      case "cancelled":
        emit({
          type: "plan_complete",
          planId: event.planId ?? planId,
          status: "cancelled",
          steps: [],
        });
        break;
      case "error":
        emit({
          type: "plan_complete",
          planId,
          status: "failed",
          steps: [],
        });
        break;
      // planning:start / validation:complete / state → not surfaced.
      default:
        break;
    }
  };
}

/* ------------------------------------------------------------------ *
 * Jobs → job_* stream
 * ------------------------------------------------------------------ */

/**
 * Run a `JobExecutor` for a claimed `Job`, emitting `job_start`, one
 * `job_progress` per progress report, and a terminal `job_complete`
 * (`completed` or `failed`). Provider-agnostic — it works with any executor
 * and never touches a real queue itself.
 */
export async function* streamJob<TPayload, TResult>(
  executor: JobExecutor<TPayload, TResult>,
  job: Job<TPayload, TResult>,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent> {
  const stream = new AgentEventStream();

  const run = (async () => {
    stream.emit({ type: "job_start", jobId: job.id, kind: job.type });
    try {
      const result = await executor.execute(
        job,
        async (progress: number) => {
          stream.emit({ type: "job_progress", jobId: job.id, progress });
        },
        signal ?? new AbortController().signal,
      );
      stream.emit({
        type: "job_complete",
        jobId: job.id,
        status: "completed",
        result,
      });
    } catch (caught) {
      stream.emit({
        type: "job_complete",
        jobId: job.id,
        status: "failed",
        error: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      stream.close();
    }
  })();

  try {
    for await (const event of stream) yield event;
  } finally {
    await run;
  }
}
