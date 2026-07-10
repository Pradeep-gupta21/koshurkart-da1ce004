/**
 * KoshurKart — Planner Engine types
 * =================================================================
 * Provider-agnostic type foundation for the *planning layer* — the
 * reasoning seam that sits between the AI service (which produces
 * intent) and the tool system (which takes action). A planner turns a
 * `Goal` into a validated, ordered `Plan` and drives its execution
 * lifecycle.
 *
 * This file defines the runtime contract for planning: what a `Goal`,
 * `Plan`, and `PlanStep` are; the `PlannerContext` a plan runs inside;
 * the `PlannerResult` it produces; and the `Planner` interface every
 * concrete planner satisfies. It is intentionally free of any concrete
 * planner and of any real data source — no network, no API keys, no
 * Supabase, no marketplace specifics. Those live in customer / vendor /
 * admin agents built on top of this framework later.
 *
 * Relationship to the rest of the AI module:
 *  - `AIService` (src/ai/services/ai.service.ts) is the *reasoning source*
 *    a planner may consult to decompose a goal. Referenced by type only.
 *  - `ToolRegistry` (src/ai/tools/registry.ts) is how a planner discovers
 *    which tools a step could call; used during validation.
 *  - `ToolExecutor` (src/ai/tools/executor.ts) is where a `tool` step will
 *    *eventually* be run. The framework wires the seam but does not execute
 *    real tools yet — execution is a documented future override.
 *
 * Design goals:
 *  - Plans are strongly typed, serializable, and inspectable.
 *  - The planner is reusable by future customer, vendor, and admin agents.
 *  - Dependencies (AI, tools, executor) are injected via `PlannerContext`,
 *    never imported, so the framework stays provider-agnostic and testable.
 */

import type { AIService } from "@/ai/services/ai.service";
import type { ToolExecutor } from "@/ai/tools/executor";
import type { ToolRegistry } from "@/ai/tools/registry";
import type { ChatAudience } from "@/ai/types/chat";
import type { ToolLogger } from "@/ai/tools/types";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Normalized error categories a planner run can fail with. Kept
 * provider-neutral so agents can react to failure classes without
 * parsing free-form strings.
 */
export type PlannerErrorCode =
  | "planning_failed" // the planner could not turn the goal into a plan
  | "invalid_plan" // the produced/supplied plan failed validation
  | "step_failed" // a step exhausted its retries and could not complete
  | "cancelled" // the run was cancelled via signal or token
  | "unavailable" // an injected dependency (tools/executor/ai) was missing
  | "unknown"; // anything not otherwise classified

/**
 * A provider-neutral planner error. Returned inside a failed
 * `PlannerResult`; planners should not throw for expected failures.
 */
export interface PlannerError {
  /** Stable, machine-readable failure category. */
  code: PlannerErrorCode;
  /** Human-readable explanation, safe to surface in logs. */
  message: string;
  /** True when retrying the whole run might succeed. */
  retryable?: boolean;
  /** Id of the step that caused the failure, when applicable. */
  stepId?: string;
  /** Original error/detail, retained for debugging. Not sent to a model. */
  cause?: unknown;
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

/**
 * A single, high-level objective handed to a planner. This is the *input*
 * to planning — an agent describes what it wants; the planner decides how.
 *
 * Deliberately small and serializable so a goal can be persisted, logged,
 * or reconstructed from a conversation turn.
 */
export interface Goal {
  /** Stable unique id (uuid). */
  id: string;
  /** Natural-language statement of what should be accomplished. */
  objective: string;
  /** Which surface the goal originates from — scopes tools/authorization. */
  audience: ChatAudience;
  /**
   * Optional hard constraints the plan must respect (e.g. "read-only",
   * "no external spend"). Free-form; interpreted by concrete planners.
   */
  constraints?: readonly string[];
  /**
   * Optional structured inputs the planner may use when decomposing the
   * objective (ids, filters, prior context). JSON-serializable in spirit.
   */
  inputs?: Record<string, unknown>;
  /** Optional free-form metadata (trace ids, source turn, locale, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Plan steps
 * ------------------------------------------------------------------ */

/**
 * What kind of work a step represents. Kept small; concrete planners can
 * lean on `tool` for actions and `reason` for model-only thinking.
 * - `tool`     — will invoke a registered tool (via the executor, later).
 * - `reason`   — a model-only reasoning step (no side effects).
 * - `decision` — a branch/gate that decides whether later steps run.
 * - `noop`     — a placeholder/synchronization step that does nothing.
 */
export type PlanStepKind = "tool" | "reason" | "decision" | "noop";

/** Lifecycle status of an individual step within a plan run. */
export type PlanStepStatus =
  | "pending" // not started yet
  | "ready" // dependencies satisfied; eligible to run
  | "running" // currently executing
  | "succeeded" // completed successfully
  | "failed" // exhausted retries without success
  | "skipped" // bypassed (e.g. an upstream decision excluded it)
  | "cancelled"; // aborted before or during execution

/**
 * A single unit of work in a `Plan`. Steps form a dependency graph via
 * `dependsOn`; the planner resolves a safe execution order from it.
 *
 * A `tool` step names the tool it intends to call and the arguments it
 * would pass — but the framework only *validates* this wiring; it does
 * not run the tool yet.
 */
export interface PlanStep<TInput = Record<string, unknown>, TOutput = unknown> {
  /** Stable id, unique within its plan. Used for dependency references. */
  id: string;
  /** Short, human-readable description of what the step does. */
  description: string;
  /** The category of work this step performs. */
  kind: PlanStepKind;
  /**
   * For `tool` steps: the machine name of the tool to run (matches a
   * `ToolDefinition.name` in the `ToolRegistry`). Ignored for other kinds.
   */
  toolName?: string;
  /**
   * For `tool` steps: the arguments that would be passed to the tool. Held
   * as-is; validated but not executed by this framework.
   */
  input?: TInput;
  /**
   * Ids of steps that must reach a terminal success before this one is
   * eligible to run. Empty/omitted means the step has no prerequisites.
   */
  dependsOn?: readonly string[];
  /**
   * Max attempts (including the first) the executor may make for this step
   * before giving up. Retry strategies read this. Defaults to 1.
   */
  maxAttempts?: number;
  /** Current lifecycle status; managed by the planner during a run. */
  status: PlanStepStatus;
  /** How many attempts have been made so far. Starts at 0. */
  attempts: number;
  /** The step's output once it succeeds (dry-run placeholder for now). */
  output?: TOutput;
  /** The failure detail if the step ended in `failed`. */
  error?: PlannerError;
  /** Optional free-form metadata (labels, cost hints, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * A `PlanStep` with its generics erased. Useful for plans and executors
 * that hold heterogeneous steps side by side.
 */
export type AnyPlanStep = PlanStep<Record<string, unknown>, unknown>;

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

/** Overall lifecycle status of a plan. */
export type PlanStatus =
  | "draft" // created but not yet validated
  | "validated" // passed validation; ready to execute
  | "executing" // steps are running
  | "completed" // all executable steps succeeded (or were skipped)
  | "failed" // a step failed terminally and stopped the run
  | "cancelled"; // the run was cancelled

/**
 * An ordered, dependency-aware collection of steps produced by a planner
 * from a `Goal`. The plan is the *unit of execution* the lifecycle drives.
 */
export interface Plan {
  /** Stable unique id (uuid). */
  id: string;
  /** The goal this plan was produced to accomplish. */
  goal: Goal;
  /** The steps, in the planner's preferred (topologically valid) order. */
  steps: AnyPlanStep[];
  /** Current plan-level status; managed across the lifecycle. */
  status: PlanStatus;
  /** Epoch millis the plan was created / last updated. */
  createdAt: number;
  updatedAt: number;
  /** Optional free-form metadata (planner id, reasoning trace, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Step results
 * ------------------------------------------------------------------ */

/**
 * The runtime outcome of executing a single step. A discriminated union
 * so callers narrow on `ok`, mirroring the tool layer's `ToolResult`.
 */
export type StepResult<T = unknown> =
  | { readonly ok: true; readonly output: T }
  | { readonly ok: false; readonly error: PlannerError };

/** Construct a successful `StepResult`. */
export function stepOk<T>(output: T): StepResult<T> {
  return { ok: true, output };
}

/**
 * Construct a failed `StepResult`. Accepts either a ready-made
 * `PlannerError` or a message (defaulting the code to `step_failed`).
 */
export function stepErr<T = never>(
  error: PlannerError | string,
  code: PlannerErrorCode = "step_failed",
): StepResult<T> {
  if (typeof error === "string") {
    return { ok: false, error: { code, message: error } };
  }
  return { ok: false, error };
}

/** Type guard narrowing a `StepResult` to its success branch. */
export function isStepOk<T>(
  result: StepResult<T>,
): result is { ok: true; output: T } {
  return result.ok === true;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** Severity of a single validation finding. */
export type PlanValidationSeverity = "error" | "warning";

/** One problem found while validating a plan. */
export interface PlanValidationIssue {
  /** `error` blocks execution; `warning` is advisory. */
  severity: PlanValidationSeverity;
  /** Short machine-readable slug, e.g. `duplicate_step_id`, `cycle`. */
  code: string;
  /** Human-readable explanation. */
  message: string;
  /** The step id the issue relates to, when applicable. */
  stepId?: string;
}

/**
 * The result of validating a plan. `valid` is true only when there are no
 * `error`-severity issues; warnings never block execution on their own.
 */
export interface PlanValidationResult {
  /** True when the plan has no blocking (`error`) issues. */
  valid: boolean;
  /** All findings, blocking and advisory, in discovery order. */
  issues: PlanValidationIssue[];
}

/* ------------------------------------------------------------------ *
 * Planner state
 * ------------------------------------------------------------------ */

/**
 * The phase a planner is in. Drives the execution lifecycle state machine
 * inside `BasePlanner` and is surfaced on `PlannerState`.
 */
export type PlannerPhase =
  | "idle" // constructed, nothing running
  | "planning" // turning a goal into a plan
  | "validating" // checking the plan before execution
  | "executing" // running steps
  | "completed" // finished successfully
  | "failed" // finished with a terminal error
  | "cancelled"; // stopped by cancellation

/**
 * A snapshot of a planner's progress through a run. Immutable in spirit —
 * `BasePlanner` produces a fresh snapshot on each transition so observers
 * (UI, logs, tests) can diff without sharing mutable state.
 */
export interface PlannerState {
  /** Current phase of the lifecycle. */
  phase: PlannerPhase;
  /** The plan under execution, once one exists. */
  plan?: Plan;
  /** Id of the step currently running, when in the `executing` phase. */
  currentStepId?: string;
  /** Ids of steps that have reached a terminal success. */
  completedStepIds: readonly string[];
  /** Ids of steps that failed terminally. */
  failedStepIds: readonly string[];
  /** The terminal error, when the phase is `failed`. */
  error?: PlannerError;
  /** Epoch millis this snapshot was produced. */
  updatedAt: number;
}

/* ------------------------------------------------------------------ *
 * Planner context
 * ------------------------------------------------------------------ */

/**
 * Everything a planner needs to plan and (eventually) execute, injected by
 * the caller — an agent. This is the dependency-injection seam: the planner
 * reads the AI service, tool registry, and executor from here rather than
 * importing concrete instances, which keeps the framework provider-agnostic
 * and every planner unit-testable.
 *
 * All integration points are optional so a planner can be exercised in
 * isolation (e.g. plan-only, or a dry run with no tools wired).
 *
 * `TServices` mirrors the tool layer so an agent can thread its own typed
 * service bag through to the tools its steps will eventually call.
 */
export interface PlannerContext<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Which surface is planning — used for scoping/authorization. */
  audience: ChatAudience;
  /** Authenticated user id, when the caller is signed in. */
  userId?: string;
  /** Id of the conversation this planning run belongs to, for correlation. */
  conversationId?: string;

  /**
   * The reasoning source. A planner *may* consult it to decompose a goal
   * into steps. Referenced by type only — the framework wires no real
   * provider and makes no API calls.
   */
  ai?: AIService;
  /**
   * Catalog of tools a `tool` step could call. Used during validation to
   * confirm a named tool exists. Never mutated by the planner.
   */
  tools?: ToolRegistry;
  /**
   * Where a `tool` step will *eventually* run. Present so the seam is typed
   * end-to-end; the default execution path does NOT invoke it yet.
   */
  executor?: ToolExecutor<TServices>;

  /**
   * Abort signal so a long-running plan can cancel promptly when the caller
   * (or the model turn) is cancelled. Bridged onto a `CancellationToken`.
   */
  signal?: AbortSignal;
  /**
   * Injected clock. Planners should prefer this over `Date.now()` so
   * behavior stays testable/deterministic.
   */
  now?: () => number;
  /** Optional structured logger. Planners must tolerate its absence. */
  logger?: ToolLogger;
  /** Injected dependencies for the tools this plan's steps will call. */
  services?: TServices;
  /** Free-form request-scoped metadata (trace ids, locale, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Planner result
 * ------------------------------------------------------------------ */

/**
 * The outcome of a full planner run: the (possibly partially executed)
 * plan, the final state snapshot, and — on failure — a normalized error.
 *
 * A discriminated union on `ok` so agents narrow cleanly:
 * ```ts
 * const res = await planner.run(goal, ctx);
 * if (res.ok) use(res.plan);
 * else handle(res.error);
 * ```
 */
export type PlannerResult =
  | {
      readonly ok: true;
      /** The executed plan in its terminal (`completed`) form. */
      readonly plan: Plan;
      /** Final state snapshot at the end of the run. */
      readonly state: PlannerState;
    }
  | {
      readonly ok: false;
      /** The plan as far as it got (may be undefined if planning failed). */
      readonly plan?: Plan;
      /** Final state snapshot at the point of failure/cancellation. */
      readonly state: PlannerState;
      /** Normalized failure detail. */
      readonly error: PlannerError;
    };

/* ------------------------------------------------------------------ *
 * Planner contract
 * ------------------------------------------------------------------ */

/**
 * The contract every planner satisfies. Implementing this interface (by
 * extending `BasePlanner`) is all it takes to give an agent a reasoning
 * layer over the tool system.
 *
 * The two responsibilities are deliberately separable:
 *  - `createPlan` — turn a goal into a validated-shaped plan (pure-ish).
 *  - `run` — plan, validate, and drive the execution lifecycle to a result.
 */
export interface Planner<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Stable identifier, e.g. `"sequential"`. */
  readonly id: string;

  /**
   * Decompose a goal into a `Plan`. Does not execute anything; the returned
   * plan starts in `draft` status and is safe to inspect or validate.
   */
  createPlan(goal: Goal, context: PlannerContext<TServices>): Promise<Plan>;

  /**
   * Plan → validate → execute lifecycle, resolving to a `PlannerResult`.
   * Never rejects for expected failures; those are returned as the failed
   * branch of the result.
   */
  run(goal: Goal, context: PlannerContext<TServices>): Promise<PlannerResult>;

  /** The latest state snapshot for this planner instance. */
  getState(): PlannerState;
}
