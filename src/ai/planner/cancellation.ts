/**
 * KoshurKart — Planner cancellation hooks
 * =================================================================
 * A tiny, provider-neutral cancellation primitive the execution lifecycle
 * checks between steps (and before retries) so a run can stop promptly when
 * the caller aborts. It bridges the standard `AbortSignal` carried on
 * `PlannerContext` into a first-class `CancellationToken` the planner can
 * poll, subscribe to, or trip itself.
 *
 * No network, no keys, no marketplace specifics. Pure control-flow.
 */

/** Reason a run was cancelled, surfaced to observers and results. */
export interface CancellationReason {
  /** Short machine-readable slug, e.g. `signal`, `manual`, `timeout`. */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/** Callback invoked once when a token transitions to cancelled. */
export type CancellationListener = (reason: CancellationReason) => void;

/** Unsubscribe handle returned by `onCancel`; idempotent. */
export type Unsubscribe = () => void;

/**
 * A pollable, subscribable cancellation flag. Read-only from the planner's
 * point of view: it inspects `cancelled`, may `throwIfCancelled()` at a
 * safe point, or subscribe via `onCancel`.
 */
export interface CancellationToken {
  /** Whether cancellation has been requested. */
  readonly cancelled: boolean;
  /** The reason, once cancelled; `undefined` while still active. */
  readonly reason?: CancellationReason;
  /** Subscribe to the (single) cancellation transition. */
  onCancel(listener: CancellationListener): Unsubscribe;
  /** Throw a `CancellationError` if already cancelled; otherwise no-op. */
  throwIfCancelled(): void;
}

/**
 * A `CancellationToken` plus the ability to trip it. The planner holds the
 * source; it hands the plain `CancellationToken` view to collaborators.
 */
export interface CancellationSource {
  /** The read-only token to share with code that only needs to observe. */
  readonly token: CancellationToken;
  /** Request cancellation. Idempotent — only the first call takes effect. */
  cancel(reason?: CancellationReason): void;
  /** Detach any bridged `AbortSignal` listener. Safe to call multiple times. */
  dispose(): void;
}

/** Error thrown by `throwIfCancelled()`; carries the cancellation reason. */
export class CancellationError extends Error {
  readonly reason: CancellationReason;
  constructor(reason: CancellationReason) {
    super(reason.message);
    this.name = "CancellationError";
    this.reason = reason;
  }
}

/** Type guard for a `CancellationError`. */
export function isCancellationError(value: unknown): value is CancellationError {
  return value instanceof CancellationError;
}

/**
 * Create a cancellation source, optionally bridged to an existing
 * `AbortSignal`. When a signal is supplied, an abort trips the token with a
 * `signal` reason (and an already-aborted signal trips it immediately).
 *
 * The planner should `dispose()` the source when a run ends so no listener
 * lingers on a long-lived signal.
 */
export function createCancellationSource(
  signal?: AbortSignal,
): CancellationSource {
  const listeners = new Set<CancellationListener>();
  let cancelled = false;
  let reason: CancellationReason | undefined;
  let detachSignal: (() => void) | undefined;

  const trip = (next: CancellationReason): void => {
    if (cancelled) return;
    cancelled = true;
    reason = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        // Observers must never break cancellation propagation.
      }
    }
    listeners.clear();
  };

  const token: CancellationToken = {
    get cancelled() {
      return cancelled;
    },
    get reason() {
      return reason;
    },
    onCancel(listener) {
      // Already cancelled → notify immediately, nothing to unsubscribe.
      if (cancelled && reason) {
        listener(reason);
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    throwIfCancelled() {
      if (cancelled && reason) throw new CancellationError(reason);
    },
  };

  if (signal) {
    if (signal.aborted) {
      trip({ code: "signal", message: "Aborted before start." });
    } else {
      const onAbort = () =>
        trip({ code: "signal", message: "Aborted by caller signal." });
      signal.addEventListener("abort", onAbort, { once: true });
      detachSignal = () => signal.removeEventListener("abort", onAbort);
    }
  }

  return {
    token,
    cancel(next?: CancellationReason) {
      trip(next ?? { code: "manual", message: "Cancelled by caller." });
    },
    dispose() {
      if (detachSignal) {
        detachSignal();
        detachSignal = undefined;
      }
      listeners.clear();
    },
  };
}
