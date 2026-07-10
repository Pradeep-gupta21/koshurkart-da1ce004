/**
 * KoshurKart — SequentialPlanner
 * =================================================================
 * The simplest concrete planner: it decomposes a `Goal` into a straight
 * line of steps, each depending on the one before it, so execution runs
 * strictly in order. It inherits the entire lifecycle — validation, retry,
 * cancellation, events, and state — from `BasePlanner`; all it supplies is
 * `createPlan()`.
 *
 * This is the reference planner future customer / vendor / admin agents can
 * use directly or subclass. It stays provider-agnostic: it does not call the
 * AI service or run any tool. When a caller pre-supplies steps (via
 * `goal.inputs.steps`) it chains them; otherwise it emits a single
 * `reason` step standing in for "figure out how to achieve the objective",
 * which a smarter planner (or an override) would later expand.
 *
 * No network, no keys, no marketplace specifics.
 */

import { BasePlanner, type BasePlannerConfig } from "./base.planner";
import type {
  AnyPlanStep,
  Goal,
  Plan,
  PlannerContext,
  PlanStep,
  PlanStepKind,
} from "./types";

/**
 * Shape a caller may pass through `goal.inputs.steps` to describe the steps
 * up front. Everything except `description` is optional; the planner fills
 * in ids, ordering (`dependsOn`), and lifecycle fields.
 */
export interface SequentialStepSpec {
  /** Human-readable description of the step. */
  description: string;
  /** Kind of work; defaults to `reason` when omitted. */
  kind?: PlanStepKind;
  /** For `tool` steps, the tool to call. */
  toolName?: string;
  /** For `tool` steps, the arguments to pass. */
  input?: Record<string, unknown>;
  /** Optional explicit id; auto-generated when omitted. */
  id?: string;
  /** Attempt ceiling for this step. Defaults to 1. */
  maxAttempts?: number;
}

export class SequentialPlanner<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> extends BasePlanner<TServices> {
  readonly id = "sequential";

  constructor(config: BasePlannerConfig = {}) {
    super(config);
  }

  /**
   * Build a linear plan from the goal. Each step is wired to `dependsOn` the
   * previous one, guaranteeing sequential execution while still flowing
   * through the base class's generic dependency-aware engine.
   */
  async createPlan(
    goal: Goal,
    context: PlannerContext<TServices>,
  ): Promise<Plan> {
    const now = context.now ? context.now() : 0;
    const specs = this.resolveSpecs(goal);

    const steps: AnyPlanStep[] = specs.map((spec, index) => {
      const prev = index > 0 ? specs[index - 1] : undefined;
      const id = spec.id ?? this.stepId(goal, index);
      const step: PlanStep = {
        id,
        description: spec.description,
        kind: spec.kind ?? "reason",
        toolName: spec.toolName,
        input: spec.input,
        dependsOn: prev ? [prev.resolvedId] : [],
        maxAttempts: spec.maxAttempts ?? 1,
        status: "pending",
        attempts: 0,
      };
      // Stash the resolved id so the *next* step can depend on it.
      spec.resolvedId = id;
      return step;
    });

    return {
      id: this.planId(goal),
      goal,
      steps,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      metadata: { planner: this.id },
    };
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /**
   * Resolve the step specs to build the plan from. Prefers caller-supplied
   * `goal.inputs.steps`; falls back to a single reasoning step that names
   * the objective, so a bare goal still yields a runnable (dry-run) plan.
   */
  private resolveSpecs(goal: Goal): ResolvedSpec[] {
    const provided = goal.inputs?.steps;
    if (Array.isArray(provided) && provided.length > 0) {
      return provided
        .filter((s): s is SequentialStepSpec =>
          Boolean(s && typeof (s as SequentialStepSpec).description === "string"),
        )
        .map((s) => ({ ...s, resolvedId: "" }));
    }

    return [
      {
        description: `Determine how to achieve: ${goal.objective}`,
        kind: "reason",
        resolvedId: "",
      },
    ];
  }

  /** Deterministic step id derived from the goal and position. */
  private stepId(goal: Goal, index: number): string {
    return `${goal.id}-step-${index + 1}`;
  }

  /** Deterministic plan id derived from the goal. */
  private planId(goal: Goal): string {
    return `plan-${goal.id}`;
  }
}

/** Internal spec with the resolved id threaded through for `dependsOn`. */
interface ResolvedSpec extends SequentialStepSpec {
  resolvedId: string;
}

/**
 * Convenience factory mirroring the providers/tools modules' style, so an
 * agent can spin up a planner without `new`.
 */
export function createSequentialPlanner<
  TServices extends Record<string, unknown> = Record<string, unknown>,
>(config: BasePlannerConfig = {}): SequentialPlanner<TServices> {
  return new SequentialPlanner<TServices>(config);
}
