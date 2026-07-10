/**
 * KoshurKart — Plan validation
 * =================================================================
 * Static, provider-neutral checks that a `Plan` is well-formed and safe to
 * execute *before* the lifecycle runs a single step. Validation is pure —
 * it inspects the plan (and, optionally, a `ToolRegistry`) and returns a
 * `PlanValidationResult`; it never mutates the plan, touches the network,
 * or runs a tool.
 *
 * What it checks (blocking `error`s unless noted):
 *  - the plan has at least one step;
 *  - every step id is unique and non-empty;
 *  - every `dependsOn` id resolves to a real step;
 *  - a step does not depend on itself;
 *  - the dependency graph is acyclic;
 *  - a `tool` step carries a `toolName`;
 *  - when a registry is supplied, that tool is registered and visible to
 *    the plan's audience (advisory `warning` for visibility).
 */

import type { ToolRegistry } from "@/ai/tools/registry";
import { detectCycles } from "./graph";
import type {
  AnyPlanStep,
  Plan,
  PlanValidationIssue,
  PlanValidationResult,
} from "./types";

/** Options that widen what the validator can check. */
export interface ValidatePlanOptions {
  /**
   * When provided, `tool` steps are checked against the live catalog: the
   * named tool must exist, and its audience scoping is cross-checked
   * against the plan's goal audience (a mismatch is a warning).
   */
  registry?: ToolRegistry;
}

/**
 * Validate a plan. Returns `{ valid, issues }`; `valid` is false only when
 * at least one `error`-severity issue is present. Warnings never block.
 */
export function validatePlan(
  plan: Plan,
  options: ValidatePlanOptions = {},
): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];

  // A plan with no steps can never accomplish its goal.
  if (!plan.steps || plan.steps.length === 0) {
    issues.push({
      severity: "error",
      code: "empty_plan",
      message: "Plan has no steps.",
    });
    return { valid: false, issues };
  }

  const ids = collectStepIds(plan.steps, issues);

  checkDependencies(plan.steps, ids, issues);
  checkCycles(plan.steps, issues);
  checkToolWiring(plan, options.registry, issues);

  const valid = !issues.some((i) => i.severity === "error");
  return { valid, issues };
}

/* ------------------------------------------------------------------ *
 * Individual checks
 * ------------------------------------------------------------------ */

/** Gather step ids, flagging empty or duplicated ones. Returns the set. */
function collectStepIds(
  steps: readonly AnyPlanStep[],
  issues: PlanValidationIssue[],
): Set<string> {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.id) {
      issues.push({
        severity: "error",
        code: "missing_step_id",
        message: "A step is missing its id.",
      });
      continue;
    }
    if (seen.has(step.id)) {
      issues.push({
        severity: "error",
        code: "duplicate_step_id",
        message: `Duplicate step id "${step.id}".`,
        stepId: step.id,
      });
      continue;
    }
    seen.add(step.id);
  }
  return seen;
}

/** Every `dependsOn` id must resolve to a real, non-self step. */
function checkDependencies(
  steps: readonly AnyPlanStep[],
  ids: Set<string>,
  issues: PlanValidationIssue[],
): void {
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (dep === step.id) {
        issues.push({
          severity: "error",
          code: "self_dependency",
          message: `Step "${step.id}" depends on itself.`,
          stepId: step.id,
        });
        continue;
      }
      if (!ids.has(dep)) {
        issues.push({
          severity: "error",
          code: "unknown_dependency",
          message: `Step "${step.id}" depends on unknown step "${dep}".`,
          stepId: step.id,
        });
      }
    }
  }
}

/**
 * Detect cycles in the `dependsOn` graph and raise a blocking `error` for
 * each one, before a single step can run. The graph traversal itself lives
 * in the reusable, deterministic `detectCycles` utility (Kahn's algorithm to
 * decide acyclicity, DFS to trace the exact loops); this function only maps
 * the traced cycles onto plan-validation issues so the message names the path
 * (e.g. "step_a → step_b → step_c → step_a").
 */
function checkCycles(
  steps: readonly AnyPlanStep[],
  issues: PlanValidationIssue[],
): void {
  const { acyclic, cycles } = detectCycles(steps);
  if (acyclic) return;

  for (const cycle of cycles) {
    issues.push({
      severity: "error",
      code: "cycle",
      message: `Dependency cycle detected: ${cycle.join(" → ")}.`,
      stepId: cycle[0],
    });
  }
}

/**
 * `tool` steps must name a tool; when a registry is supplied the tool must
 * exist, and its audience scoping is cross-checked (mismatch = warning).
 */
function checkToolWiring(
  plan: Plan,
  registry: ToolRegistry | undefined,
  issues: PlanValidationIssue[],
): void {
  const audience = plan.goal.audience;

  for (const step of plan.steps) {
    if (step.kind !== "tool") continue;

    if (!step.toolName) {
      issues.push({
        severity: "error",
        code: "missing_tool_name",
        message: `Tool step "${step.id}" does not name a tool.`,
        stepId: step.id,
      });
      continue;
    }

    if (!registry) continue; // Nothing more we can verify offline.

    const tool = registry.get(step.toolName);
    if (!tool) {
      issues.push({
        severity: "error",
        code: "unknown_tool",
        message: `Tool step "${step.id}" references unregistered tool "${step.toolName}".`,
        stepId: step.id,
      });
      continue;
    }

    const scoped = tool.audiences && !tool.audiences.includes(audience);
    if (scoped) {
      issues.push({
        severity: "warning",
        code: "tool_audience_mismatch",
        message: `Tool "${step.toolName}" is not scoped to audience "${audience}"; the executor will reject it at run time.`,
        stepId: step.id,
      });
    }
  }
}
