/**
 * KoshurKart — Planner Engine barrel
 * =================================================================
 * Clean public surface for the planning layer. Import from here rather
 * than reaching into individual files:
 *
 *   import {
 *     SequentialPlanner,
 *     createSequentialPlanner,
 *     validatePlan,
 *     createRetryStrategy,
 *   } from "@/ai/planner";
 *   import type { Goal, Plan, PlannerContext, PlannerResult } from "@/ai/planner";
 *
 * The Planner Engine is the *reasoning layer* between `AIService` and the
 * tool system: it turns a `Goal` into a validated `Plan` and drives the
 * execution lifecycle (validation → retry → cancellation → events → state).
 *
 * This module ships only the *reusable architecture* — the `Planner`
 * contract, a `BasePlanner` to build on, a `SequentialPlanner` reference
 * implementation, plus validation, retry, cancellation, and event helpers.
 * It is provider-agnostic and free of marketplace logic: nothing here
 * touches the network, holds API keys, or executes a real tool. Future
 * customer, vendor, and admin agents compose these pieces.
 */

/* ---- Core types & result helpers -------------------------------- */
export type {
  Goal,
  Plan,
  PlanStatus,
  PlanStep,
  AnyPlanStep,
  PlanStepKind,
  PlanStepStatus,
  Planner,
  PlannerContext,
  PlannerResult,
  PlannerState,
  PlannerPhase,
  PlannerError,
  PlannerErrorCode,
  StepResult,
  PlanValidationIssue,
  PlanValidationResult,
  PlanValidationSeverity,
} from "./types";
export { stepOk, stepErr, isStepOk } from "./types";

/* ---- Base class & reference planner ----------------------------- */
export { BasePlanner } from "./base.planner";
export type { BasePlannerConfig } from "./base.planner";
export { SequentialPlanner, createSequentialPlanner } from "./sequential.planner";
export type { SequentialStepSpec } from "./sequential.planner";
export { DecompositionPlanner, createDecompositionPlanner } from "./decomposition.planner";

/* ---- Plan validation -------------------------------------------- */
export { validatePlan } from "./validator";
export type { ValidatePlanOptions } from "./validator";

/* ---- Dependency-graph utilities (reusable cycle detection) ------- */
export { detectCycles, isAcyclic } from "./graph";
export type { DependencyNode, CycleDetectionResult } from "./graph";

/* ---- Retry strategy hooks --------------------------------------- */
export { createRetryStrategy, NO_RETRY } from "./retry";
export type {
  RetryStrategy,
  RetryContext,
  RetryDecision,
  DefaultRetryOptions,
} from "./retry";

/* ---- Cancellation hooks ----------------------------------------- */
export {
  createCancellationSource,
  CancellationError,
  isCancellationError,
} from "./cancellation";
export type {
  CancellationToken,
  CancellationSource,
  CancellationReason,
  CancellationListener,
} from "./cancellation";

/* ---- Planner events --------------------------------------------- */
export { SimplePlannerEventEmitter } from "./events";
export type {
  PlannerEvent,
  PlannerEventType,
  PlannerEventEmitter,
  PlannerEventListener,
  Unsubscribe,
} from "./events";
