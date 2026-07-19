# KoshurKart Payment System — Database & Ledger Specification

**Status:** Authoritative target architecture
**Companion documents:** `01-core-architecture-specification.md` (principles) · `02-state-machines.md` (lifecycles) · `04-operational-standards.md` (error/testing/deployment)

**Scope note:** This document defines the target schema at the level of tables, columns, key constraints, and RPC contracts. It does not include exact SQL DDL or migration syntax — that is implementation work for the relevant roadmap phase. It is detailed enough that an implementer should not need to make architectural judgment calls while writing the migration.

---

## 1. The Unified Financial Ledger

### 1.1 Design rationale

One append-only table for every financial event, across every subsystem (payments, returns, payouts). A single table — rather than `vendor_wallet_ledger`, `payment_audit_log`, and any future per-subsystem ledger kept separately — because:

- It makes `vendors.withdrawable_balance` computable with one query shape regardless of which subsystem produced the row
- It makes the reconciliation sweep (02-state-machines.md §5) able to scan one table for all stuck `pending` rows, rather than needing per-subsystem sweep logic
- It gives a single, complete audit trail per vendor, ordered by time, without needing to UNION multiple tables

Workflow/non-financial state (escalations, admin actions taken) is explicitly **not** stored here — see §2.

### 1.2 Table: `ledger_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `vendor_id` | UUID, FK → vendors | Nullable only for platform-level entries (e.g. commission retained), never nullable for vendor-facing entries |
| `order_id` | UUID, FK → orders | Nullable (payouts are not order-scoped) |
| `order_item_id` | UUID, FK → order_items | Nullable; populated for per-line-item commission/return entries (supports P4) |
| `payout_id` | UUID, FK → payouts | Nullable; populated for payout-related entries |
| `type` | ENUM | `credit`, `debit`, `reservation`, `refund`, `reversal`, `payout`, `adjustment` |
| `status` | ENUM | `pending`, `confirmed`, `failed` |
| `amount_paise` | BIGINT | Always positive; sign/direction is implied by `type`, never by a negative value — avoids sign-convention bugs |
| `operation_key` | TEXT, UNIQUE (with `type`) | The server-generated money-operation idempotency key (P9). Enforces exactly-once semantics per operation via unique constraint, not just application logic |
| `razorpay_reference_id` | TEXT, nullable | Transfer ID / reversal ID / refund ID as applicable — used for the idempotency checks described in `02-state-machines.md` §3 |
| `created_at` | TIMESTAMPTZ | |
| `confirmed_at` | TIMESTAMPTZ, nullable | Set only when status transitions to `confirmed`; this is the field the reconciliation sweep's timeout check is based on (`status = 'pending' AND created_at < threshold`, not `confirmed_at`, since pending rows by definition have no `confirmed_at`) |
| `notes` | TEXT, nullable | Human-readable context, e.g. "return reversal for order_item X" |

**Row immutability:** Rows are never updated except to transition `status` from `pending` → `confirmed`/`failed` and to set `confirmed_at`. No other column is ever modified after insert. A correction is a new row (`type = adjustment`), never an edit to a historical row — this preserves the audit trail's integrity and is what makes the ledger trustworthy as a source of truth (P5).

### 1.3 Derived balance

`vendors.withdrawable_balance` is defined as:

```
SUM(amount_paise WHERE type IN (credit, refund-received-by-vendor... ) AND status = 'confirmed')
  - SUM(amount_paise WHERE type IN (debit, reservation, payout, reversal) AND status IN (pending, confirmed))
```

(Exact sign grouping per `type` is an implementation detail for the migration; the principle is: confirmed credits increase it, and both pending and confirmed debits/reservations decrease it — a reservation must reduce available balance immediately, before confirmation, precisely to prevent a double-spend race between two concurrent payout requests.)

This value is **materialized** (a maintained column, updated by a narrowly-scoped trigger that does nothing but recompute the sum on `ledger_entries` insert/update — this is a permitted trigger use under P11, since it is a pure projection with no business logic, not a decision-making mutation) rather than computed live on every read, for performance at the target scale (§ target: 1,000–10,000 orders/day). The **reconciliation sweep** independently recomputes this sum periodically and compares it to the materialized value, flagging any divergence — this is the mechanism that would catch a bug in the projection trigger itself.

---

## 2. Workflow Tables (separate from the ledger)

Per P5 and the design decision in the interview: financial facts live in the ledger; workflow/process state lives in its own tables that reference ledger rows.

### 2.1 Table: `payment_escalations`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `ledger_entry_id` | UUID, FK → ledger_entries | The blocked/pending intent that triggered escalation |
| `vendor_id` | UUID, FK → vendors | |
| `reason` | ENUM | `insufficient_balance` (today's only case; extensible) |
| `status` | ENUM | `open`, `resolved_approved`, `resolved_rejected` |
| `resolved_by` | UUID, FK → users, nullable | Must be a user holding `finance_admin` — enforced by the admin-override RPC, not just a UI convention |
| `resolved_at` | TIMESTAMPTZ, nullable | |
| `resolution_notes` | TEXT, nullable | |
| `created_at` | TIMESTAMPTZ | |

Mutation of `status`/`resolved_by`/`resolved_at`/`resolution_notes` is blocked for any caller except `service_role`, mirroring the existing `prevent_direct_return_status_update` trigger pattern, generalized to this table.

### 2.2 Table: `nonce_operation_map` (supports P9)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `client_nonce` | TEXT, UNIQUE | Client-generated, opaque |
| `operation_key` | TEXT | Server-generated; corresponds to `ledger_entries.operation_key` for the resulting entry (or entries, for multi-row operations like a payout that reserves and later confirms) |
| `operation_type` | TEXT | e.g. `payout_request`, `return_approval` — namespacing so nonces from different flows can't collide |
| `created_at` | TIMESTAMPTZ | |

On a retried request bearing an already-seen `client_nonce`, the Edge Function looks up the existing `operation_key` and returns the cached result of that operation rather than invoking the intent RPC again.

---

## 3. RPC Contract Standard

Every `SECURITY DEFINER` RPC that reads or writes a money-affecting table returns exactly this JSONB shape:

```
{
  "success": boolean,
  "data": object | null,
  "isIdempotentReplay": boolean,
  "errorCode": string | null
}
```

- `success: false` implies `errorCode` is populated and `data` is `null`.
- `isIdempotentReplay: true` indicates the RPC detected an already-completed operation (matched by `operation_key`) and returned the cached result rather than re-executing — this must be `true` whenever it applies, so callers can distinguish "this just happened" from "this already happened and you're seeing the same result again," which matters for UI messaging and for the CI contract test.
- `errorCode` values are drawn from the shared `errorCodes.ts`-equivalent enum defined in `04-operational-standards.md` §1 — never an ad hoc string.

**No RPC returns `SETOF <table>`, a bare row, or `void` for a money-affecting operation.** This is the direct closure of the audit's DRIFT-02 finding (a RPC's return type changed from `SETOF payouts` to `JSONB` across several migrations without the caller being updated in lockstep). Under this contract, that specific class of drift cannot recur, because there is only ever one valid return shape to target.

### 3.1 The CI contract test (implements P10)

A test (run in CI, not merely documented as a convention) that:

1. Parses the latest migration for each money-affecting RPC's declared `RETURNS` clause
2. Parses the TypeScript Edge Function(s) that call it, extracting how the response is destructured
3. Fails the build if the destructuring assumes a shape other than the standard contract above, or if a RPC's return type in the migration doesn't match `JSONB`/the expected structure

This is intentionally described here at the specification level (what it must check) rather than as a specific tool choice — the implementation (e.g. a custom script vs. a typed RPC-client generation step) is a Phase 4/5 implementation decision, not an architectural one.

---

## 4. Idempotency Key Storage (supports P9)

Two distinct identifiers exist per money-moving client action:

| Identifier | Generated by | Stored where | Purpose |
|---|---|---|---|
| `client_nonce` | Client, once per user-initiated action | `nonce_operation_map.client_nonce` | Transport-layer retry correlation — "is this the same request I already sent?" |
| `operation_key` | Server, on first successful processing of a nonce | `ledger_entries.operation_key` (unique) | Application-layer dedup and audit identity — "has this financial operation already been performed?" |

An Edge Function receiving a request:
1. Checks `nonce_operation_map` for the incoming `client_nonce`
2. If found: returns the cached result associated with that `operation_key` (no RPC re-invocation)
3. If not found: calls the intent RPC, which generates a new `operation_key`, writes the ledger row, and the Edge Function records the nonce→key mapping before returning

This structurally prevents the scenario where a client retry (e.g. after a dropped connection) creates a duplicate financial operation, without requiring the client to understand or construct the server's key format — closing a real gap in the previous client-generated-key-only design.

---

## 5. Reconciliation Sweep — Implementation Parameters

(Mechanism described at the principle level in `02-state-machines.md` §5; concrete parameters specified here.)

- **Trigger mechanism:** scheduled Edge Function (cron-invoked), consistent with the existing `process-email-queue` pattern already proven in this codebase — no new infrastructure pattern introduced.
- **Scan query:** `ledger_entries WHERE status = 'pending' AND created_at < now() - <timeout>`, timeout configurable per `type` (e.g. a payout transfer may reasonably take longer to confirm than a UPI verification).
- **Resolution attempt:** for each stuck row, query Razorpay's API directly using the stored `razorpay_reference_id` (if present) for the true state.
- **Outcome handling:** definite Razorpay confirmation → apply the same confirm-RPC path a webhook would have used (idempotent, safe under first-writer-wins per P8). No definite answer → write a `payment_escalations` row (§2.1) with `reason` extended to include a `reconciliation_timeout` value alongside `insufficient_balance`, notifying `finance_admin`.
- **Never:** the sweep does not guess an outcome, does not mark an ambiguous row as failed or succeeded on a timeout basis alone — ambiguity always routes to human review, consistent with P6's "block and escalate rather than proceed unsafely" pattern.

---

## 6. Locking & Concurrency

- **Vendor balance mutations** acquire a `FOR UPDATE` lock on the relevant `vendors` row before any read used for a balance decision, consistent with the existing (audit-verified-correct) pattern.
- **Lock ordering** for any operation touching more than one lockable row (e.g. a payout locks both a new `payouts`/ledger row and the `vendors` row) is fixed and consistent across all RPCs to prevent deadlocks — the existing "payout row first, vendor row second" convention is retained as the platform-wide standard.
- **`operation_key` uniqueness** (via the ledger's unique constraint, §1.2) is the primary idempotency enforcement mechanism, not merely an application-level check — this means even a bug in application logic that attempts a duplicate insert fails at the database level, a stronger guarantee than a `SELECT`-then-`INSERT` check alone.
- **At target scale** (500–5,000 vendors, 1,000–10,000 orders/day, occasional per-vendor concentration during festivals): row-level locking on `vendors` is sufficient. A festival-driven spike concentrated on one vendor produces lock contention on that vendor's row specifically, not a system-wide bottleneck — acceptable at this scale. This is re-evaluated only if actual production metrics show sustained contention beyond what `FOR UPDATE` handles gracefully; it is not something this architecture pre-optimizes for today.

---

## 7. What Changes From the Current Schema (summary for implementers)

This is a pointer for Phase-by-Phase implementation, not new architecture — it restates the target relative to the audited current state:

- `vendor_wallet_ledger` and `payment_audit_log` are superseded by the single `ledger_entries` table. Whether `payment_logs` (referenced separately in `AdminPayments.tsx` per the audit) is a genuine third table or a naming inconsistency for one of the above must be resolved during Phase 0 reconnaissance (per the recovery roadmap) before migration design begins — this specification assumes it is resolved to either "merge into `ledger_entries`" or "confirmed as a distinct non-financial log," not left ambiguous.
- `debit_balance_on_payout_complete` and `on_payment_success` triggers are removed; their logic moves into explicit RPC calls (confirm-payment RPC, confirm-payout RPC) per P11.
- `payment_escalations` is new (§2.1).
- `nonce_operation_map` is new (§2.2).
- `vendors.withdrawable_balance` remains as a column, but its write path changes from "mutated by triggers from multiple independent call sites" to "recomputed by a single narrowly-scoped projection trigger reacting only to `ledger_entries` changes."
- `audit-payment-reconciliation`'s hardcoded `payout_requests` table reference and hardcoded 5% commission rate are retired in favor of querying `payouts`/`ledger_entries` directly and calling the shared commission module (P3) — this Edge Function's *shape* is unchanged, only its data sources.
