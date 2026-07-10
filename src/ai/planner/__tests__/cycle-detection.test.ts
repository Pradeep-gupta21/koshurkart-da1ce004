/**
 * Unit tests for DAG cycle detection at the plan-validation and planner-run
 * boundaries.
 *
 * Two layers are covered:
 *  1. `validatePlan` — the static gate — must flag a `cycle` error and mark
 *     the plan invalid, while leaving well-formed DAGs untouched.
 *  2. `BasePlanner.run` — must reject a cyclic plan during its validation
 *     phase and never execute a single step, returning an `invalid_plan`
 *     error. Valid DAGs must still run to completion unchanged.
 */

import { describe, it, expect } from "vitest";
import { BasePlanner } from "../base.planner";
import { validatePlan } from "../validator";
import type {
  AnyPlanStep,
  Goal,
  Plan,
  PlannerContext,
  PlannerResult,
} from "../types";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const goal: Goal = {
  id: "goal-1",
  objective: "test cycle detection",
  audience: "admin",
};

/** Build a `reason` step with explicit dependencies. */
function step(id: string, dependsOn: string[] = []): AnyPlanStep {
  return {
    id,
    description: `step ${id}`,
    kind: "reason",
    dependsOn,
    status: "pending",
    attempts: 0,
  };
}

/** Assemble a draft plan from the given steps. */
function plan(steps: AnyPlanStep[]): Plan {
  return {
    id: "plan-1",
    goal,
    steps,
    status: "draft",
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * A trivial concrete planner that returns a pre-built plan, so we can drive a
 * cyclic plan through the real `run` lifecycle without a decomposition model.
 */
class FixedPlanner extends BasePlanner {
  readonly id = "fixed-test";
  constructor(private readonly fixed: Plan) {
    super();
  }
  async createPlan(): Promise<Plan> {
    return this.fixed;
  }
}

/* ------------------------------------------------------------------ *
 * validatePlan
 * ------------------------------------------------------------------ */

describe("validatePlan — cycle detection", () => {
  it("passes a valid linear DAG", () => {
    const result = validatePlan(
      plan([step("a"), step("b", ["a"]), step("c", ["b"])]),
    );
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "cycle")).toBe(false);
  });

  it("passes a valid diamond DAG", () => {
    const result = validatePlan(
      plan([
        step("a"),
        step("b", ["a"]),
        step("c", ["a"]),
        step("d", ["b", "c"]),
      ]),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a two-node cycle with a blocking cycle error", () => {
    const result = validatePlan(plan([step("a", ["b"]), step("b", ["a"])]));
    expect(result.valid).toBe(false);
    const cycle = result.issues.find((i) => i.code === "cycle");
    expect(cycle).toBeDefined();
    expect(cycle?.severity).toBe("error");
    expect(cycle?.message).toContain("Dependency cycle detected");
  });

  it("rejects a three-node cycle and names the path in the message", () => {
    const result = validatePlan(
      plan([step("a", ["b"]), step("b", ["c"]), step("c", ["a"])]),
    );
    expect(result.valid).toBe(false);
    const cycle = result.issues.find((i) => i.code === "cycle");
    expect(cycle?.message).toMatch(/→/);
    // Message lists the closed loop, e.g. "a → b → c → a".
    for (const id of ["a", "b", "c"]) {
      expect(cycle?.message).toContain(id);
    }
  });

  it("reports each independent cycle once", () => {
    const result = validatePlan(
      plan([
        step("a", ["b"]),
        step("b", ["a"]),
        step("x", ["y"]),
        step("y", ["x"]),
      ]),
    );
    const cycles = result.issues.filter((i) => i.code === "cycle");
    expect(cycles).toHaveLength(2);
  });

  it("keeps self-dependency as its own error alongside the cycle", () => {
    const result = validatePlan(plan([step("a", ["a"])]));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "self_dependency")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * BasePlanner.run — reject before execution
 * ------------------------------------------------------------------ */

describe("BasePlanner.run — cyclic plan rejection", () => {
  const ctx: PlannerContext = { audience: "admin" };

  it("rejects a cyclic plan with invalid_plan and runs no steps", async () => {
    const steps = [step("a", ["b"]), step("b", ["a"])];
    const planner = new FixedPlanner(plan(steps));

    const result = await planner.run(goal, ctx);

    expect(result.ok).toBe(false);
    // Negative narrowing on the `ok` discriminant is unreliable under this
    // repo's `strictNullChecks: false`, so extract the failed branch explicitly
    // (mirrors BasePlanner's own `errorOf` pattern).
    const failed = result as Extract<PlannerResult, { ok: false }>;
    expect(failed.error.code).toBe("invalid_plan");
    expect(failed.error.retryable).toBe(false);
    // Detection happens in the validation phase — no step is ever executed.
    for (const s of steps) {
      expect(s.status).toBe("pending");
      expect(s.attempts).toBe(0);
    }
    expect(planner.getState().phase).toBe("failed");
  });

  it("still executes a valid DAG to completion", async () => {
    const planner = new FixedPlanner(
      plan([step("a"), step("b", ["a"]), step("c", ["b"])]),
    );

    const result = await planner.run(goal, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.status).toBe("completed");
      expect(result.plan.steps.every((s) => s.status === "succeeded")).toBe(
        true,
      );
    }
  });
});
