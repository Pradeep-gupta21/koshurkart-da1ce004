/**
 * KoshurKart — Agent stream event protocol
 * =================================================================
 * The full, forward-compatible vocabulary the frontend understands on the
 * chat SSE stream. It is a strict *superset* of the backend's current
 * `AIStreamEvent` (`delta` / `tool_call` / `done` / `error`): those still flow
 * exactly as before, plus a set of AI-Operating-System orchestration events
 * (memory, planner, delegation, reflection, background jobs, tool results).
 *
 * Why a superset: the `ai-chat` edge function forwards whatever the agent
 * yields verbatim, and `AIClient` is a pure pass-through that JSON-parses each
 * `data:` line. Widening the *type* here — not the networking — lets the UI
 * render orchestration events the moment the backend agent begins emitting
 * them, with zero further client changes. Events the backend does not (yet)
 * emit simply never arrive; nothing breaks.
 *
 * These types are provider-agnostic and presentation-free. The reduction from
 * events → UI state happens in `useAgent`; components only read the result.
 */

import type { AIStreamEvent, ToolCall } from "@/ai/types/chat";

/* Re-export the base wire union for convenience. */
export type { AIStreamEvent, ToolCall } from "@/ai/types/chat";

/* ------------------------------------------------------------------ *
 * Orchestration payloads
 * ------------------------------------------------------------------ */

/** A memory recall/persist signal — surfaces what the agent remembered. */
export interface MemoryEventData {
  /** Whether memory was read (`recall`) or written (`persist`). */
  phase: "recall" | "persist";
  /** Which memory tier the event concerns. */
  scope?: "session" | "conversation" | "user";
  /** How many items were recalled/persisted, when known. */
  count?: number;
  /** Human-readable summary safe to show inline. */
  note?: string;
}

/** Lifecycle status of a single planner step (mirrors backend `PlanStepStatus`). */
export type PlanStepStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

/** A planner step as surfaced to the UI. */
export interface PlanStepInfo {
  id: string;
  description: string;
  status: PlanStepStatus;
  /** For tool steps, the tool the step will call. */
  toolName?: string;
}

/** A snapshot of the current execution plan. */
export interface PlanInfo {
  id: string;
  /** The goal objective the plan pursues, when provided. */
  objective?: string;
  steps: PlanStepInfo[];
}

/** Background-job status (mirrors the backend jobs subsystem). */
export interface JobInfo {
  id: string;
  /** Job type/name, e.g. `"reindex-products"`. */
  kind?: string;
  status: "queued" | "running" | "succeeded" | "failed";
  note?: string;
}

/* ------------------------------------------------------------------ *
 * The stream event union
 * ------------------------------------------------------------------ */

/**
 * Every event the chat stream may carry. `AIStreamEvent` covers assistant
 * text/tool-request/done/error; the remaining variants describe orchestration.
 */
export type AgentStreamEvent =
  | AIStreamEvent
  | { type: "memory"; data: MemoryEventData }
  | { type: "plan"; phase: "start" | "update" | "complete" | "failed"; plan: PlanInfo }
  | { type: "delegation"; phase: "start" | "complete"; agent: string; objective?: string }
  | {
      type: "reflection";
      phase: "start" | "complete";
      success?: boolean;
      feedback?: string;
      selfCorrected?: boolean;
    }
  | { type: "job"; job: JobInfo }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName?: string;
      result?: unknown;
      isError?: boolean;
    };

/** All non-base (orchestration) event `type` discriminants. */
export type AgentOrchestrationEventType =
  | "memory"
  | "plan"
  | "delegation"
  | "reflection"
  | "job"
  | "tool_result";

/* ------------------------------------------------------------------ *
 * Reduced UI state (produced by useAgent, consumed by components)
 * ------------------------------------------------------------------ */

/** Runtime status of a tool invocation as the UI tracks it. */
export type ToolInvocationStatus = "running" | "succeeded" | "failed";

/** A tool call merged with its eventual result — what a `ToolCard` renders. */
export interface ToolInvocationState {
  /** The originating `ToolCall.id`. */
  id: string;
  /** Tool machine name. */
  name: string;
  /** Arguments the model supplied, when known. */
  arguments?: Record<string, unknown>;
  status: ToolInvocationStatus;
  /** Result payload once the tool resolves. */
  result?: unknown;
  /** True when the tool reported an error. */
  isError?: boolean;
}

/**
 * One ordered entry in the turn's activity timeline. A discriminated union so
 * a renderer switches on `kind`. `plan`, `tool`, and `job` entries are updated
 * in place (by their natural id) as new events arrive; the rest are appended.
 */
export type ActivityEntry =
  | { id: string; at: number; kind: "memory"; data: MemoryEventData }
  | {
      id: string;
      at: number;
      kind: "delegation";
      agent: string;
      phase: "start" | "complete";
      objective?: string;
    }
  | { id: string; at: number; kind: "plan"; plan: PlanInfo }
  | { id: string; at: number; kind: "tool"; invocation: ToolInvocationState }
  | {
      id: string;
      at: number;
      kind: "reflection";
      phase: "start" | "complete";
      success?: boolean;
      feedback?: string;
      selfCorrected?: boolean;
    }
  | { id: string; at: number; kind: "job"; job: JobInfo };

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/** The base `AIStreamEvent` discriminants that map onto message state. */
const BASE_EVENT_TYPES = new Set<AIStreamEvent["type"]>([
  "delta",
  "tool_call",
  "done",
  "error",
]);

/** True for the original text/tool/done/error events (vs. orchestration). */
export function isBaseStreamEvent(
  event: AgentStreamEvent,
): event is AIStreamEvent {
  return BASE_EVENT_TYPES.has(event.type as AIStreamEvent["type"]);
}

/** Narrow a base `tool_call` event's payload. */
export function toolCallOf(event: {
  type: "tool_call";
  toolCall: ToolCall;
}): ToolCall {
  return event.toolCall;
}
