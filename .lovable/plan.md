## Goal

On `/payments/:paymentId`, automatically poll for status updates so users see verification results without manually refreshing. Stop polling once the payment reaches a terminal state.

## Behavior

- **Polls while status is non-terminal:** `pending`, `pending_verification`.
- **Stops polling at terminal states:** `success`, `failed`, `rejected`, `reversed`.
- **Polling cadence:** every 5s for the first minute, then 15s afterwards (gentle backoff). Capped at 10 minutes total, then stops with a "Still waiting? Refresh" hint.
- **Pauses when tab is hidden** (`document.visibilityState`) and resumes on focus to avoid wasted requests.
- **Realtime boost:** also subscribe to `postgres_changes` on `payments` filtered by `id=eq.{paymentId}` via existing `useRealtimeSubscription`. Realtime updates re-run the loader immediately; polling remains as a fallback for missed events.
- **Status change UX:** when status transitions to a terminal state, show a subtle toast ("Payment verified" / "Payment failed") and stop polling. The existing verification-result card already renders the new state.
- **No UI layout change** beyond a small inline "Auto-refreshing…" indicator next to the status badge while polling is active.

## Technical details

Edits limited to `src/pages/PaymentDetailPage.tsx`:

1. Add a `useEffect` that:
   - Computes `isTerminal = ["success","failed","rejected","reversed"].includes(status)`.
   - If terminal → no-op.
   - Else sets up a `setTimeout` loop that calls a lightweight reload (selecting only `payment` row, not re-fetching the order) and reschedules with the cadence above.
   - Tracks start time in a ref to enforce the 10-minute cap.
   - Listens to `visibilitychange` to pause/resume.
   - Cleans up timers on unmount and on status change.
2. Refactor `load` slightly: extract `loadPayment()` (payments row only) used by the poller, while initial mount still loads payment + order.
3. Add `useRealtimeSubscription` for `payments` table filtered by `id=eq.${paymentId}`, calling `loadPayment()` on payload.
4. Add a small `<span>` near the status badge: `"Auto-refreshing…"` muted text + spinning `Loader2` icon, only while polling is active.
5. Use `useToast` to announce terminal transitions (compare previous status ref vs new).

No service, schema, route, or other component changes.
