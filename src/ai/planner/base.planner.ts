/**
 * KoshurKart — BasePlanner
 * =================================================================
 * Abstract base class that implements the shared plumbing every `Planner`
 * (see src/ai/planner/types.ts) needs, so concrete planners only have to
 * decide *how to decompose a goal* by implementing `createPlan()`.
 *
 * What the base owns:
 *  - the execution-lifecycle state machine
 *    (idle → planning → validating → executing → completed/failed/cancelled);
 *  - planner state snapshots emitted on every transition;
 *  - a dependency-aware sequential step loop with topological ordering;
 *  - a retry loop wired to an injectable `RetryStrategy`;
 *  - cancellation checks between steps and before retries, bridged from the
 *    context's `AbortSignal`;
 *  - event emission through a `PlannerEventEmitter`.
 *
 * IMPORTANT — reasoning layer only, no real execution yet:
 *  - It reaches no network and holds no keys.
 *  - The default `executeStep()` is a DRY RUN. For a `tool` step it will,
 *    when a `ToolRegistry` is present, confirm the tool exists — but it
 *    never calls `ToolExecutor.run`. Wiring real execution is a deliberate
 *    future override, keeping the framework free of marketplace logic.
 */

import {
  createCancellationSource,
  isCancellationError,
  type CancellationSource,
  type CancellationToken,
} from "./cancellation";
import {
  SimplePlannerEventEmitter,
  type PlannerEvent,
  type PlannerEventEmitter,
  type PlannerEventListener,
  type Unsubscribe,
} from "./events";
import {
  createRetryStrategy,
  type RetryStrategy,
} from "./retry";
import {
  stepErr,
  type AnyPlanStep,
  type Goal,
  type Plan,
  type Planner,
  type PlannerContext,
  type PlannerError,
  type PlannerResult,
  type PlannerState,
  type PlanStepStatus,
  type StepResult,
} from "./types";
import { validatePlan } from "./validator";

/** Construction-time configuration shared by all planners. */
export interface BasePlannerConfig {
  /** Retry policy for failed steps. Defaults to `createRetryStrategy()`. */
  retryStrategy?: RetryStrategy;
  /** Event sink. Defaults to a fresh `SimplePlannerEventEmitter`. */
  events?: PlannerEventEmitter;
}

export abstract class BasePlanner<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> implements Planner<TServices>
{
  /** Stable identifier, e.g. "sequential". */
  abstract readonly id: string;

  /** Retry policy consulted after each failed step attempt. */
  protected readonly retryStrategy: RetryStrategy;

  /** Event emitter the lifecycle broadcasts through. */
  protected readonly events: PlannerEventEmitter;

  /** Latest immutable state snapshot. Replaced on every transition. */
  private state: PlannerState;

  constructor(config: BasePlannerConfig = {}) {
    this.retryStrategy = config.retryStrategy ?? createRetryStrategy();
    this.events = config.events ?? new SimplePlannerEventEmitter();
    this.state = {
      phase: "idle",
      completedStepIds: [],
      failedStepIds: [],
      updatedAt: 0,
    };
  }

  /* -------------------------------------------------------------- *
   * Public API
   * -------------------------------------------------------------- */

  /** Subscribe to lifecycle events; returns an unsubscribe handle. */
  on(listener: PlannerEventListener): Unsubscribe {
    return this.events.on(listener);
  }

  /** The latest state snapshot for this planner instance. */
  getState(): PlannerState {
    return this.state;
  }

  /**
   * Decompose a goal into a plan. Implemented by concrete planners. The
   * returned plan must start in `draft` status with each step `pending`.
   */
  abstract createPlan(
    goal: Goal,
    context: PlannerContext<TServices>,
  ): Promise<Plan>;

  /**
   * Full lifecycle: plan → validate → execute. Never rejects for expected
   * failures; those come back as the failed branch of `PlannerResult`.
   */
  async run(
    goal: Goal,
    context: PlannerContext<TServices>,
  ): Promise<PlannerResult> {
    const cancellation = createCancellationSource(context.signal);
    let plan: Plan | undefined;

    try {
      // --- Planning ------------------------------------------------
      this.transition({ phase: "planning", updatedAt: this.now(context) });
      this.emit({
        type: "planning:start",
        at: this.now(context),
        goalId: goal.id,
      });

      plan = await this.createPlan(goal, context);
      this.emit({ type: "planning:complete", at: this.now(context), plan });
      this.transition({ plan, updatedAt: this.now(context) });

      this.throwIfCancelled(cancellation.token);

      // --- Validation ----------------------------------------------
      this.transition({ phase: "validating", updatedAt: this.now(context) });
      const validation = validatePlan(plan, { registry: context.tools });
      this.emit({
        type: "validation:complete",
        at: this.now(context),
        planId: plan.id,
        result: validation,
      });

      if (!validation.valid) {
        const firstError =
          validation.issues.find((i) => i.severity === "error");
        return this.fail(plan, {
          code: "invalid_plan",
          message: firstError?.message ?? "Plan failed validation.",
          stepId: firstError?.stepId,
          retryable: false,
        }, context);
      }

      plan.status = "validated";
      plan.updatedAt = this.now(context);

      this.throwIfCancelled(cancellation.token);

      // --- Execution -----------------------------------------------
      return await this.executePlan(plan, context, cancellation.token);
    } catch (caught) {
      if (isCancellationError(caught)) {
        return this.cancel(plan, caught.reason.message, context);
      }
      return this.fail(
        plan,
        {
          code: "planning_failed",
          message:
            caught instanceof Error ? caught.message : String(caught),
          retryable: false,
          cause: caught,
        },
        context,
      );
    } finally {
      cancellation.dispose();
    }
  }

  /* -------------------------------------------------------------- *
   * Execution lifecycle
   * -------------------------------------------------------------- */

  /**
   * Drive the validated plan to a terminal state. Runs steps in dependency
   * order; a terminal step failure stops the run and fails the plan.
   */
  private async executePlan(
    plan: Plan,
    context: PlannerContext<TServices>,
    token: CancellationToken,
  ): Promise<PlannerResult> {
    plan.status = "executing";
    plan.updatedAt = this.now(context);
    this.transition({ phase: "executing", plan, updatedAt: this.now(context) });
    this.emit({
      type: "execution:start",
      at: this.now(context),
      planId: plan.id,
    });

    const order = this.resolveOrder(plan.steps);
    const completed: string[] = [];
    const failed: string[] = [];

    for (const step of order) {
      // Cancellation is checked at every step boundary.
      if (token.cancelled) {
        step.status = "cancelled";
        return this.cancel(
          plan,
          token.reason?.message ?? "Cancelled.",
          context,
        );
      }

      // Skip steps whose dependencies did not all succeed.
      if (!this.dependenciesSatisfied(step, completed)) {
        this.setStepStatus(step, "skipped");
        continue;
      }

      const result = await this.runStepWithRetries(step, context, token);

      if (isCancelledStep(step)) {
        return this.cancel(
          plan,
          token.reason?.message ?? "Cancelled.",
          context,
        );
      }

      if (result.ok) {
        step.output = result.output;
        this.setStepStatus(step, "succeeded");
        completed.push(step.id);
        this.emit({ type: "step:complete", at: this.now(context), step });
        this.transition({
          completedStepIds: [...completed],
          currentStepId: undefined,
          updatedAt: this.now(context),
        });
      } else {
        // Explicit extract: negative narrowing of a boolean discriminant is
        // unreliable under this repo's `strictNullChecks: false`.
        const stepError = errorOf(result);
        step.error = stepError;
        this.setStepStatus(step, "failed");
        failed.push(step.id);
        this.emit({ type: "step:complete", at: this.now(context), step });
        return this.fail(
          plan,
          { ...stepError, stepId: step.id },
          context,
          failed,
          completed,
        );
      }
    }

    // --- Completed --------------------------------------------------
    plan.status = "completed";
    plan.updatedAt = this.now(context);
    this.emit({ type: "execution:complete", at: this.now(context), plan });

    const finalState = this.transition({
      phase: "completed",
      plan,
      currentStepId: undefined,
      completedStepIds: [...completed],
      failedStepIds: [...failed],
      updatedAt: this.now(context),
    });

    return { ok: true, plan, state: finalState };
  }

  /**
   * Run a single step, retrying per the `RetryStrategy` until it succeeds,
   * exhausts its attempts, or the run is cancelled.
   */
  private async runStepWithRetries(
    step: AnyPlanStep,
    context: PlannerContext<TServices>,
    token: CancellationToken,
  ): Promise<StepResult> {
    const maxAttempts = Math.max(1, step.maxAttempts ?? 1);
    this.setStepStatus(step, "running");
    this.transition({
      currentStepId: step.id,
      updatedAt: this.now(context),
    });
    this.emit({ type: "step:start", at: this.now(context), step });

    let lastError: PlannerError = {
      code: "step_failed",
      message: `Step "${step.id}" did not run.`,
    };

    while (step.attempts < maxAttempts) {
      if (token.cancelled) {
        this.setStepStatus(step, "cancelled");
        return stepErr(lastError);
      }

      step.attempts += 1;

      let result: StepResult;
      try {
        result = await this.executeStep(step, context);
      } catch (caught) {
        if (isCancellationError(caught)) {
          this.setStepStatus(step, "cancelled");
          return stepErr({
            code: "cancelled",
            message: caught.reason.message,
          });
        }
        result = stepErr({
          code: "step_failed",
          message:
            caught instanceof Error ? caught.message : String(caught),
          retryable: true,
          cause: caught,
        });
      }

      if (result.ok) return result;

      // Explicit extract: negative narrowing of a boolean discriminant is
      // unreliable under this repo's `strictNullChecks: false`.
      lastError = errorOf(result);

      // Ask the retry policy what to do with this failed attempt.
      const decision = this.retryStrategy.shouldRetry({
        step,
        error: lastError,
        attempt: step.attempts,
        maxAttempts,
      });

      if (!decision.retry || step.attempts >= maxAttempts) {
        return stepErr(lastError);
      }

      this.emit({
        type: "step:retry",
        at: this.now(context),
        step,
        attempt: step.attempts,
        error: lastError,
      });

      await this.delay(decision.delayMs ?? 0, token);
    }

    return stepErr(lastError);
  }

  /* -------------------------------------------------------------- *
   * Extension points
   * -------------------------------------------------------------- */

  /**
   * Execute a single step and return its outcome.
   *
   * DEFAULT: a dry run. This base implementation performs NO real work — it
   * is the reasoning layer, not the action layer. For a `tool` step it
   * verifies (when a registry is available) that the named tool is
   * registered and returns a placeholder output describing the call it
   * *would* make; it never invokes `ToolExecutor`. `reason`/`decision`/`noop`
   * steps resolve to a benign placeholder.
   *
   * Subclasses (or future agents) override this to wire real execution via
   * `context.executor` once the tool layer is ready.
   */
  protected async executeStep(
    step: AnyPlanStep,
    context: PlannerContext<TServices>,
  ): Promise<StepResult> {
    if (step.kind === "tool") {
      if (!step.toolName) {
        return stepErr({
          code: "invalid_plan",
          message: `Tool step "${step.id}" has no toolName.`,
          retryable: false,
        });
      }
      // Conceptual integration: confirm the tool exists, but do not run it.
      if (context.tools && !context.tools.has(step.toolName)) {
        return stepErr({
          code: "unavailable",
          message: `Tool "${step.toolName}" is not registered.`,
          retryable: false,
        });
      }
      return {
        ok: true,
        output: {
          dryRun: true,
          wouldCall: step.toolName,
          input: step.input ?? {},
        },
      };
    }

    // Non-tool steps have no side effects in the dry-run base.
    return { ok: true, output: { dryRun: true, kind: step.kind } };
  }

  /* -------------------------------------------------------------- *
   * Ordering & dependencies
   * -------------------------------------------------------------- */

  /**
   * Produce a stable, dependency-respecting execution order via Kahn's
   * algorithm. The plan is assumed already validated (acyclic); any residual
   * unresolved nodes are appended in their original order as a safeguard.
   */
  protected resolveOrder(steps: AnyPlanStep[]): AnyPlanStep[] {
    const byId = new Map<string, AnyPlanStep>();
    for (const step of steps) byId.set(step.id, step);

    const indegree = new Map<string, number>();
    for (const step of steps) {
      const deps = (step.dependsOn ?? []).filter((d) => byId.has(d));
      indegree.set(step.id, deps.length);
    }

    // Preserve authoring order among ready nodes for deterministic output.
    const ready = steps.filter((s) => (indegree.get(s.id) ?? 0) === 0);
    const ordered: AnyPlanStep[] = [];
    const emitted = new Set<string>();

    while (ready.length > 0) {
      const step = ready.shift() as AnyPlanStep;
      if (emitted.has(step.id)) continue;
      ordered.push(step);
      emitted.add(step.id);

      for (const candidate of steps) {
        if (emitted.has(candidate.id)) continue;
        if (!(candidate.dependsOn ?? []).includes(step.id)) continue;
        const next = (indegree.get(candidate.id) ?? 0) - 1;
        indegree.set(candidate.id, next);
        if (next <= 0) ready.push(candidate);
      }
    }

    // Safeguard: append anything left (should not happen on a valid plan).
    for (const step of steps) {
      if (!emitted.has(step.id)) ordered.push(step);
    }
    return ordered;
  }

  /** True when every dependency of `step` is in the completed set. */
  protected dependenciesSatisfied(
    step: AnyPlanStep,
    completed: readonly string[],
  ): boolean {
    const done = new Set(completed);
    return (step.dependsOn ?? []).every((dep) => done.has(dep));
  }

  /* -------------------------------------------------------------- *
   * Terminal transitions
   * -------------------------------------------------------------- */

  /** Transition to `failed`, emit the error event, and build the result. */
  private fail(
    plan: Plan | undefined,
    error: PlannerError,
    context: PlannerContext<TServices>,
    failedStepIds: string[] = [],
    completedStepIds: string[] = [],
  ): PlannerResult {
    if (plan) {
      plan.status = "failed";
      plan.updatedAt = this.now(context);
    }
    this.emit({ type: "error", at: this.now(context), error });
    const state = this.transition({
      phase: "failed",
      plan,
      error,
      currentStepId: undefined,
      failedStepIds: [...failedStepIds],
      completedStepIds: [...completedStepIds],
      updatedAt: this.now(context),
    });
    return { ok: false, plan, state, error };
  }

  /** Transition to `cancelled`, emit the event, and build the result. */
  private cancel(
    plan: Plan | undefined,
    message: string,
    context: PlannerContext<TServices>,
  ): PlannerResult {
    if (plan) {
      plan.status = "cancelled";
      plan.updatedAt = this.now(context);
    }
    const error: PlannerError = {
      code: "cancelled",
      message,
      retryable: false,
    };
    this.emit({
      type: "cancelled",
      at: this.now(context),
      planId: plan?.id,
    });
    const state = this.transition({
      phase: "cancelled",
      plan,
      error,
      currentStepId: undefined,
      updatedAt: this.now(context),
    });
    return { ok: false, plan, state, error };
  }

  /* -------------------------------------------------------------- *
   * State & helpers
   * -------------------------------------------------------------- */

  /**
   * Apply a partial update to the state snapshot, replacing it wholesale
   * (snapshots are immutable in spirit) and emitting a `state` event.
   * Returns the new snapshot.
   */
  protected transition(patch: Partial<PlannerState>): PlannerState {
    const next: PlannerState = {
      ...this.state,
      ...patch,
      updatedAt: patch.updatedAt ?? this.state.updatedAt,
    };
    this.state = next;
    this.events.emit({ type: "state", at: next.updatedAt, state: next });
    return next;
  }

  /** Set a step's status field (kept as a seam for subclass hooks/logging). */
  protected setStepStatus(step: AnyPlanStep, status: PlanStepStatus): void {
    step.status = status;
  }

  /** Emit a lifecycle event through the configured emitter. */
  protected emit(event: PlannerEvent): void {
    this.events.emit(event);
  }

  /** Injected clock, defaulting to 0 so runs stay deterministic in tests. */
  protected now(context: PlannerContext<TServices>): number {
    return context.now ? context.now() : 0;
  }

  /** Throw a `CancellationError` if the token is already tripped. */
  private throwIfCancelled(token: CancellationToken): void {
    token.throwIfCancelled();
  }

  /**
   * Await a backoff delay that also resolves early if the run is cancelled,
   * so a long delay never delays a cancellation.
   */
  private delay(ms: number, token: CancellationToken): Promise<void> {
    if (ms <= 0 || token.cancelled) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(finish, ms);
      const off = token.onCancel(finish);
      function finish() {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
  }
}

/** Local predicate: a step was cancelled mid-attempt. */
function isCancelledStep(step: AnyPlanStep): boolean {
  return step.status === "cancelled";
}

/**
 * Extract the error from a failed `StepResult`. Mirrors the ToolExecutor's
 * `Extract<...>` pattern: under this repo's `strictNullChecks: false`,
 * narrowing to the `ok: false` branch by elimination is unreliable, so we
 * assert the branch explicitly at the single point of use.
 */
function errorOf(result: StepResult): PlannerError {
  return (result as Extract<StepResult, { ok: false }>).error;
}
