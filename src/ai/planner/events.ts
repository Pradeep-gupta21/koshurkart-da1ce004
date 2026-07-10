/**
 * KoshurKart — Planner events
 * =================================================================
 * A small, provider-neutral event system the Planner Engine emits as it
 * moves a `Goal` through planning, validation, and the execution
 * lifecycle. Observers (a dashboard, a log sink, a test spy) subscribe to
 * watch progress without reaching into the planner's internals.
 *
 * It holds no state beyond its listener set — no network, no keys, no
 * marketplace specifics. Events are serializable in spirit so they can be
 * persisted or streamed to a UI.
 */

import type {
  AnyPlanStep,
  Plan,
  PlannerError,
  PlannerState,
  PlanValidationResult,
} from "./types";

/* ------------------------------------------------------------------ *
 * Event shapes
 * ------------------------------------------------------------------ */

/**
 * Discriminated union of everything a planner run can announce. Consumers
 * switch on `type`. Every event carries `at` (epoch millis) so a timeline
 * can be reconstructed from a captured stream.
 *
 *  - `planning:start` / `planning:complete` — goal → plan.
 *  - `validation:complete` — the plan was checked (carries the result).
 *  - `execution:start` / `execution:complete` — the step loop bounds.
 *  - `step:start` / `step:retry` / `step:complete` — per-step progress.
 *  - `state` — a fresh `PlannerState` snapshot after any transition.
 *  - `cancelled` — the run was cancelled via signal or token.
 *  - `error` — a terminal, normalized failure ended the run.
 */
export type PlannerEvent =
  | { type: "planning:start"; at: number; goalId: string }
  | { type: "planning:complete"; at: number; plan: Plan }
  | {
      type: "validation:complete";
      at: number;
      planId: string;
      result: PlanValidationResult;
    }
  | { type: "execution:start"; at: number; planId: string }
  | { type: "execution:complete"; at: number; plan: Plan }
  | { type: "step:start"; at: number; step: AnyPlanStep }
  | {
      type: "step:retry";
      at: number;
      step: AnyPlanStep;
      attempt: number;
      error: PlannerError;
    }
  | { type: "step:complete"; at: number; step: AnyPlanStep }
  | { type: "state"; at: number; state: PlannerState }
  | { type: "cancelled"; at: number; planId?: string }
  | { type: "error"; at: number; error: PlannerError };

/** The `type` discriminants, handy for filtering subscriptions. */
export type PlannerEventType = PlannerEvent["type"];

/** A subscriber notified for each emitted event. Must not throw. */
export type PlannerEventListener = (event: PlannerEvent) => void;

/** Unsubscribe handle returned by `on`; idempotent. */
export type Unsubscribe = () => void;

/* ------------------------------------------------------------------ *
 * Emitter contract
 * ------------------------------------------------------------------ */

/**
 * The minimal emitter surface `BasePlanner` depends on. Kept tiny so any
 * sink can satisfy it and so it composes with existing event systems.
 */
export interface PlannerEventEmitter {
  /** Subscribe to every event; returns an unsubscribe handle. */
  on(listener: PlannerEventListener): Unsubscribe;
  /** Broadcast an event to all current listeners. */
  emit(event: PlannerEvent): void;
}

/* ------------------------------------------------------------------ *
 * Default implementation
 * ------------------------------------------------------------------ */

/**
 * A dependency-free synchronous emitter. Listeners are invoked in
 * subscription order; a throwing listener is isolated so it cannot break
 * the run or starve other subscribers.
 */
export class SimplePlannerEventEmitter implements PlannerEventEmitter {
  private readonly listeners = new Set<PlannerEventListener>();

  on(listener: PlannerEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: PlannerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A misbehaving observer must never derail planning; swallow.
      }
    }
  }

  /** Drop all subscribers. Primarily useful in tests. */
  clear(): void {
    this.listeners.clear();
  }
}
