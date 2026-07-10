/**
 * KoshurKart — Planner retry strategy hooks
 * =================================================================
 * Provider-neutral retry policy for the execution lifecycle. When a step
 * fails, the planner asks a `RetryStrategy` whether to try again and, if
 * so, how long to wait first. Strategies are pure decision functions — they
 * hold no timers and perform no side effects — so they are trivial to test
 * and swap per agent.
 *
 * No network, no keys, no marketplace specifics. The default strategy
 * honors a step's own `maxAttempts` and the error's `retryable` flag.
 */

import type { AnyPlanStep, PlannerError } from "./types";

/* ------------------------------------------------------------------ *
 * Decision inputs & outputs
 * ------------------------------------------------------------------ */

/**
 * Everything a strategy needs to decide the fate of a failed attempt.
 * Provided by the planner; the strategy only reads it.
 */
export interface RetryContext {
  /** The step whose most recent attempt failed. */
  step: AnyPlanStep;
  /** The normalized error from that attempt. */
  error: PlannerError;
  /** How many attempts have been made so far (>= 1 at decision time). */
  attempt: number;
  /**
   * The effective attempt ceiling for this step (its `maxAttempts`,
   * defaulted). The strategy may respect or tighten it, never loosen it.
   */
  maxAttempts: number;
}

/**
 * What to do after a failed attempt. `retry: false` ends the step in
 * `failed`; `retry: true` schedules another attempt after `delayMs`.
 */
export interface RetryDecision {
  /** Whether to make another attempt. */
  retry: boolean;
  /** Milliseconds to wait before the next attempt. Defaults to 0. */
  delayMs?: number;
}

/**
 * A retry policy. Called once per failed attempt. Must be a pure function
 * of its input — no clocks, no I/O — so runs stay deterministic.
 */
export interface RetryStrategy {
  /** Decide whether (and when) to retry a failed step attempt. */
  shouldRetry(context: RetryContext): RetryDecision;
}

/* ------------------------------------------------------------------ *
 * Default strategy
 * ------------------------------------------------------------------ */

/** Tuning knobs for the built-in retry strategy. */
export interface DefaultRetryOptions {
  /**
   * Base backoff in milliseconds used for the first retry. Subsequent
   * retries scale from here. Defaults to 0 (retry immediately).
   */
  baseDelayMs?: number;
  /**
   * Exponential growth factor applied per prior attempt. `1` is a constant
   * delay; `2` doubles each time. Defaults to `2`.
   */
  factor?: number;
  /** Upper bound on any single backoff, in milliseconds. Defaults to 30_000. */
  maxDelayMs?: number;
  /**
   * When true, only errors flagged `retryable` are retried. When false,
   * any error within the attempt budget is retried. Defaults to true.
   */
  respectRetryableFlag?: boolean;
}

/**
 * Build the default retry strategy: retry while attempts remain, optionally
 * gated on the error's `retryable` flag, with exponential backoff derived
 * purely from the attempt number (no wall clock).
 */
export function createRetryStrategy(
  options: DefaultRetryOptions = {},
): RetryStrategy {
  const baseDelayMs = options.baseDelayMs ?? 0;
  const factor = options.factor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const respectRetryableFlag = options.respectRetryableFlag ?? true;

  return {
    shouldRetry({ error, attempt, maxAttempts }): RetryDecision {
      // Out of budget → give up.
      if (attempt >= maxAttempts) return { retry: false };

      // Honor the error's own signal when configured to.
      if (respectRetryableFlag && error.retryable === false) {
        return { retry: false };
      }

      // Backoff grows with the number of prior attempts, capped.
      const raw = baseDelayMs * Math.pow(factor, attempt - 1);
      const delayMs = Math.min(raw, maxDelayMs);
      return { retry: true, delayMs };
    },
  };
}

/**
 * A strategy that never retries — every failure is terminal. Useful for
 * strictly one-shot plans or tests.
 */
export const NO_RETRY: RetryStrategy = {
  shouldRetry() {
    return { retry: false };
  },
};
