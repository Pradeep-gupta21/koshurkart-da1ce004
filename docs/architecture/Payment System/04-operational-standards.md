# KoshurKart Payment System — Operational Standards

**Status:** Authoritative target architecture
**Companion documents:** `01-core-architecture-specification.md` (principles) · `02-state-machines.md` (lifecycles) · `03-database-ledger-specification.md` (schema/RPCs)

---

## 1. Error Handling Contract

### 1.1 Scope

The mandated error contract below applies to every **money-affecting** Edge Function: checkout, payment verification, webhooks, returns, payouts, escalations, admin payment/payout actions. It does not apply to non-money endpoints (menu, location, sidebar config, etc.), which may use a looser, function-specific error shape.

### 1.2 Required response shape

Every money-affecting Edge Function error response includes:

```
{
  "errorCode": string,     // from the shared errorCodes enum — never an ad hoc string
  "httpStatus": number,    // the actual HTTP status returned, matching errorCode's category
  "retryable": boolean,    // whether the client should offer a retry
  "message": string        // client-safe, sanitized — never a raw DB error or stack trace
}
```

### 1.3 Rules

- **One error code per error category, no catch-all.** Every distinct failure reason (unauthorized, forbidden, not-found, validation, conflict, upstream/gateway failure, internal) maps to its own `errorCode`. Collapsing everything to a single generic code (the audit's confirmed DRIFT-07 finding in `confirm-upi-payment` and `verify-upi-payment`) is not permitted for money-affecting functions going forward.
- **HTTP status must match error category**, not be uniformly 200 or uniformly 500 regardless of cause: 400 for validation, 401/403 for auth, 404 for not-found, 409 for conflict/lock contention, 5xx for genuine upstream/internal failure. A RPC failure is never masked as a 200 response with an error embedded only in the body.
- **`retryable` must be accurate.** A validation failure is not retryable without client changes; a transient gateway timeout typically is. The frontend's retry logic (per `01-core-architecture-specification.md` §5) depends on this flag being correct, not guessed at the UI layer.
- **RPC errors are normalized before reaching the client.** Raw PostgreSQL error messages, constraint names, or SQLSTATEs are never returned directly to the client — they pass through the shared RPC-error-normalizer, which maps them to the standard shape above. Full detail is logged server-side only.

---

## 2. Testing Philosophy

### 2.1 Standard for new code

All new payment-related code (RPCs, Edge Functions, shared modules) is expected to include:

- **Unit tests** for pure logic (commission calculation across paise-boundary amounts, error-code mapping, state-transition validity checks)
- **Integration tests** for the full Edge Function → RPC → DB round trip for each defined flow in `02-state-machines.md`
- **Concurrency tests** for anything touching a locked resource — double-click/duplicate-submission scenarios, concurrent payout requests against the same vendor, concurrent return approvals on the same order item
- **Idempotency/retry tests** — same nonce submitted twice returns the cached result without a duplicate ledger entry; a RPC's `operation_key` unique constraint is exercised, not just its application-level check
- **Webhook tests** — webhook arriving before, after, and never (reconciliation sweep path) relative to the Edge Function's own confirm step

This is **aspirational for new code**, not retroactively enforced against the existing codebase as a blocking gate. Existing untested code is not required to gain full coverage before this specification takes effect; it is expected to gain coverage incrementally as it's touched during the recovery roadmap phases.

### 2.2 What "done" means for a payment feature

A payment-related change is not considered complete until its corresponding state-machine diagram (in `02-state-machines.md`, or an update to it if the change alters a flow) matches the shipped behavior, and at minimum the concurrency and idempotency test categories above have been exercised for that specific change — even if broader coverage is still building out.

---

## 3. Admin Override Model

- Admin-override RPCs (used to resolve `payment_escalations`, force a stuck state, or otherwise deviate from the normal automated flow) are callable only by users holding the `finance_admin` role — never general `admin`, and never via a direct table write regardless of role.
- Every admin-override action writes an immutable audit row recording: who, when, which escalation/entity, what action was taken, and any notes provided.
- There is no "temporary" or "emergency" bypass of this pattern. If an override capability is needed that doesn't exist yet, it is added as a proper audited RPC — not worked around with a direct SQL update, `service_role` key sharing, or a Supabase dashboard edit.

---

## 4. Deployment Standards for Payment-Affecting Migrations

Given the recovery audit's root cause (contract drift across separately-deployed migrations), payment-affecting migrations follow a stricter gate than general schema changes:

1. **Atomic commit requirement (P10):** any migration changing a money-affecting RPC's contract is committed together with its Edge Function caller update, in the same commit — enforced by the CI contract test (`03-database-ledger-specification.md` §3.1), not just reviewer discipline.
2. **Staging replica with production-like data volume:** before Pradeep applies any payment-affecting migration to production, it is first validated against a staging replica seeded with data at a realistic scale (order count, vendor count, ledger row volume approximating the target scale in `01-core-architecture-specification.md`) — not just a smoke-test-sized staging dataset. This specifically exists to catch performance regressions in balance-derivation queries or lock contention that wouldn't surface with a handful of test rows.
3. **CodeRabbit review, as already practiced**, remains a required step before any migration or Edge Function change is considered mergeable — this specification does not relax that existing discipline, only adds to it.
4. **Sequential, granular commits** — the existing convention (`fix(scope): description` / `feat(scope): description`, one logical change per commit) continues to apply to payment code without exception.
5. **Dual-remote push discipline** (`origin/main` and `personal/main`) continues unchanged.

---

## 5. Coding Conventions Specific to Payment Code

- **No inline commission math anywhere outside the shared module.** A grep for hardcoded percentages (`0.95`, `0.05`, `95`, `5%`, etc.) in payment-related files during code review is a legitimate review check — any hit outside the shared commission module is a defect.
- **No `SETOF`, bare row, or `void` return types on money-affecting RPCs** — the standard JSONB contract (`03-database-ledger-specification.md` §3) is the only permitted shape.
- **No RPC grant to `authenticated` for any money-mutating function** — `service_role` only, enforced at `GRANT` time and checked as part of migration review.
- **Action vocabulary is `approve`/`reject`, never a synonym** (`02-state-machines.md` §6) — code review should flag any new action string that isn't one of these two for an approve/reject-shaped decision.
- **No direct writes to `ledger_entries`, `vendors.withdrawable_balance`, `payments`, `payouts`, `order_items.return_status`, or `payment_escalations` from anywhere except the designated `service_role` RPC for that table** — this includes ad hoc admin scripts, Supabase dashboard edits, or "just this once" manual fixes. If a manual correction is genuinely needed, it happens via a `type = adjustment` ledger row inserted through the standard RPC path, preserving the audit trail, never a raw UPDATE.
- **Shared modules (`_shared/*`) never import browser-only or Deno-only globals** — per the audit's existing `[!IMPORTANT]` flag on this exact risk, since these files are bundled by both Vite and Deno simultaneously.

---

## 6. Summary Checklist for Reviewing Any New Payment PR

A reviewer (human or CodeRabbit) checks a payment-related change against this list before approval:

- [ ] Does this change follow the intent→execute→confirm pattern if it involves a Razorpay money-moving call?
- [ ] Does the RPC involved return the standard JSONB contract?
- [ ] If this changes a RPC's contract, is the Edge Function caller updated in the same commit, and does the CI contract test pass?
- [ ] Is commission math delegated to the shared module, with no inline reimplementation?
- [ ] Is the balance check performed against the ledger-derived value, and does it correctly block/escalate rather than allow overdraft?
- [ ] Does every error path return the standard error contract with an accurate `errorCode` and `retryable` flag?
- [ ] Is the RPC's authorization check zero-trust (looked up from the DB row, not the caller's claim)?
- [ ] Is any new money-mutating RPC granted to `service_role` only?
- [ ] Does this introduce or touch a state machine — and if so, does `02-state-machines.md` need a corresponding update?
- [ ] Are concurrency and idempotency tests included for this specific change?
