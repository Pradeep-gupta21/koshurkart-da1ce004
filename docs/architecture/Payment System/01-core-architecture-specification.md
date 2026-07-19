# KoshurKart Payment System — Core Architecture Specification

**Status:** Authoritative target architecture
**Scope:** Describes the desired end-state after all recovery roadmap phases are complete. This is NOT a description of the current implementation.
**Companion documents:**
- `02-state-machines.md` — Payment, Payout, Return lifecycles
- `03-database-ledger-specification.md` — Schema, RPC contracts, locking, idempotency
- `04-operational-standards.md` — Error contracts, testing, deployment, admin overrides

**Scale target this architecture is designed for:** 500–5,000 vendors, 1,000–10,000 orders/day, with occasional concentrated concurrency on individual vendors during high-demand periods (festivals, launches). Row-level locking and atomic RPCs are sufficient at this scale — no sharding or event-sourcing redesign is required.

---

## 1. Purpose

This document is the single source of truth for how money moves through KoshurKart. Every future payment-related change — feature, fix, or refactor — must be evaluated against this specification before implementation. If a proposed change conflicts with a principle stated here, either the change is wrong or this document needs a deliberate, reviewed amendment. It must never be silently overridden by an isolated migration or Edge Function edit.

This document exists because the previous architecture, while fundamentally sound in its security primitives, drifted at contract boundaries between SQL RPCs and their TypeScript callers — repeatedly, across multiple migrations, without the drift being caught until a dedicated audit. The rules in this document are designed specifically to make that class of failure structurally impossible, not just less likely.

---

## 2. Non-Negotiable Principles

These are absolute. They do not get exceptions "just this once," "for testing," or "because Pradeep needs faster access."

### P1 — No client-writable money tables
No table that affects money — balances, payments, payouts, the ledger, order pricing — may ever have a client-writable RLS policy. Zero exceptions. All writes to these tables happen through an Edge Function using `service_role`.

### P2 — RPCs own business logic; Edge Functions orchestrate
All business rules — commission calculation, balance checks, state transitions, ledger writes, any database mutation — live in SQL RPCs (`SECURITY DEFINER`). Edge Functions are thin: authentication, request validation, orchestration between RPC calls, and calls to external APIs (Razorpay, email, SMS). An Edge Function must never contain a commission formula, a balance comparison used for a business decision, or an inline state-transition rule. If TypeScript code is computing money, that computation is either display-only (explicitly marked as such and delegating to the shared module — see P3) or it is a bug.

### P3 — One commission calculation, shared
There is exactly one implementation of commission math in the codebase: a shared pure module using integer paise arithmetic. Both the Deno RPC layer and any client-side display code (e.g. a checkout summary showing "you'll pay X, vendor receives Y") call this same module — not reimplementations of it. Client-side display values are always provisional; the RPC's calculation at write-time is authoritative regardless of what the client displayed.

Today's commission rate is fixed at 95% vendor / 5% platform. This spec does not implement tiered or per-vendor commission rates, but the shared module's signature must accept a vendor/order context rather than being a hardcoded constant, so that tiering can be introduced later without touching every call site.

### P4 — Commission is computed per line item, at write time, never redistributed after the fact
Commission is calculated when an `order_item` is created, individually for that item's vendor, using that vendor's exemption status at that moment. It is never calculated at the order-total level and then proportionally distributed across items after the fact. This rule exists specifically so that a single order containing items from both a commission-exempt and a non-exempt vendor produces correct per-vendor economics automatically, without special-case logic — because the calculation was never aggregated in the first place.

### P5 — The ledger is the source of truth for internal financial state; Razorpay is the source of truth for external settlement state
KoshurKart's internal ledger (see `03-database-ledger-specification.md`) is authoritative for "what does KoshurKart owe this vendor, and why." Razorpay is authoritative for "did the actual transfer/settlement happen." These are deliberately different questions with different owners. Any code that conflates them — treating a ledger write as proof of a completed transfer, or treating a Razorpay API success as proof of correct internal accounting — is architecturally wrong.

`vendors.withdrawable_balance` is a **derived, cached projection** of the ledger. It is never hand-edited, never the target of a business-logic write. It is recomputed or materialized from ledger rows. If the balance column and `SUM(ledger rows)` ever disagree, that is a detectable bug (the reconciliation sweep, see §7, is designed to catch exactly this) — not a matter of "which one is right," because the ledger is always right by definition.

### P6 — Balance may never go negative
`withdrawable_balance` must never be permitted to go below zero. There is no overdraft. An operation (typically a return reversal) that would push a vendor's balance negative does not proceed silently or float to zero — it is blocked and the situation is escalated to a `finance_admin` for manual resolution (see §6 and `02-state-machines.md`).

### P7 — Reversal before refund
For returns, the vendor's share must be successfully reversed (pulled back via Razorpay transfer reversal) before the customer is refunded. This ordering protects KoshurKart from a scenario where a customer is refunded but the corresponding vendor debit fails or is delayed — which would mean KoshurKart pays out of its own margin. This ordering is a hard invariant, not a default that can be reversed for UX reasons.

### P8 — External money-moving calls follow intent → execute → confirm
Any Razorpay call that moves money (transfer, reversal, refund, payout) follows a strict three-step orchestration pattern between the Edge Function and RPC layer:

1. **Intent RPC** — records the operation's intent in the ledger (status: `pending`) and performs all pre-condition checks (balance sufficiency, state validity) *before* any external call is made.
2. **External call** — the Edge Function calls Razorpay.
3. **Confirm RPC** — the Edge Function calls back into a confirm/finalize RPC with the Razorpay result, which updates the ledger row's status to `confirmed` or `failed` and performs any resulting state transition.

This pattern is mandatory for money-moving Razorpay calls. It is not required for read-only calls (e.g. fetching payment status), which may be called directly without an intent/confirm wrapper.

The webhook and the Edge Function's own confirm-RPC call are two independent paths that can both attempt to finalize the same operation. Whichever arrives first wins; the second is treated as an idempotent replay (a no-op that returns the already-finalized result), following the same `credited_at`/`debited_at`-style guard pattern used throughout the system today. See `02-state-machines.md` §5 for the reconciliation sweep that recovers operations stuck at "intent recorded, never confirmed."

### P9 — Idempotency is two-layered: request-nonce and money-operation-key
Every money-moving client request carries a **client-generated request-nonce** — a value the client creates once and reuses on retry, used purely for request-level retry correlation (e.g. "did my last network call actually reach the server"). The server, on first successful processing of a given nonce, generates and owns the **money-operation idempotency key** — the identity used for ledger deduplication, audit, and the RPC's own idempotent-replay logic. The server maps nonce → operation key, so a client retrying with the same nonce always receives the result of the original operation, without the client ever needing to construct or reason about the operation-key format itself. See `03-database-ledger-specification.md` §4 for the storage shape of this mapping.

### P10 — RPC/Edge Function contract changes are atomic and CI-enforced
Any migration that changes a money-affecting RPC's input contract or return shape must be committed together with the update to its Edge Function caller, in the same commit. This is enforced by an automated contract test in CI — not just commit-message discipline — that asserts each RPC's declared return type in the latest migration matches what its Edge Function caller destructures. A migration that breaks this contract must fail CI, not reach staging. This single rule is the direct structural fix for the root cause identified in the recovery audit (RPC and caller evolving independently across separate migrations).

### P11 — Triggers are for cross-cutting invariants only, never for money mutation
Database triggers remain appropriate for cross-cutting concerns like audit logging. They are not used to implicitly mutate balances or trigger business logic on status change (the pattern previously used by `on_payment_success` and `debit_balance_on_payout_complete`). All balance-affecting logic is invoked explicitly: an Edge Function calls an RPC, the RPC performs the mutation. Nothing "just happens" as a side effect of an UPDATE statement. This makes every money-affecting code path traceable to an explicit call, which is a precondition for the CI contract test in P10 to be meaningful.

---

## 3. System Boundaries and Ownership

| Layer | Owns | Does NOT own |
|---|---|---|
| **Frontend (React/TS)** | UI state, form validation (client-side, non-authoritative), calling `paymentService.ts`, displaying provisional amounts via the shared commission module | Any authoritative money calculation, any direct table write to a money-affecting table, idempotency key generation (only nonce generation) |
| **`paymentService.ts`** (client-side gateway) | Single point of Edge Function invocation for all payment operations; generates request-nonces | Business logic, RPC calls (never calls Supabase RPCs directly for money operations — always via Edge Function) |
| **Edge Functions** | Auth (JWT validation), request validation, orchestration (intent→external→confirm sequencing), external API calls (Razorpay, Twilio, email), mapping nonce→operation key on first receipt | Business logic, commission math, balance checks used for decisions, direct state-transition rules, direct writes to money tables (writes only via RPC) |
| **RPCs (`SECURITY DEFINER`)** | All business rules, balance checks, state transitions, commission calculation (via shared module), ledger writes, `service_role`-only execution | External API calls (cannot call Razorpay from SQL), authentication (trusts the caller was already authenticated by the Edge Function, but still performs zero-trust authorization checks against the database — see `03-database-ledger-specification.md` §2) |
| **Shared modules** (`_shared/pricing.ts`-equivalent) | Commission math, error codes, error response shape, RPC-error normalization — imported identically by both Deno Edge Functions and the Vite-bundled browser client | Anything environment-specific (no browser globals, no Deno-only APIs) |
| **DB Triggers** | Audit logging, cross-cutting invariants unrelated to business decisions | Balance mutation, state transitions, business logic |
| **Razorpay / Razorpay Route** | External settlement truth, actual fund movement, webhook delivery | Internal accounting truth (KoshurKart's ledger is authoritative for "what is owed," even before Razorpay confirms it moved) |

---

## 4. Authorization Model

| Role | Can do |
|---|---|
| **Anonymous / unauthenticated** | Read public product/vendor listings only. No payment-related access. |
| **Authenticated customer** | Trigger checkout, verify their own payment, request a return on their own order, view their own order/payment history. All via Edge Function; zero-trust checks in RPCs confirm the caller owns the resource — the caller's claimed identity is never trusted without a database lookup. |
| **Authenticated vendor** | Approve/reject returns for their own order items, request payouts against their own balance, view their own ledger. Same zero-trust pattern: vendor identity for any action is looked up from the database row being acted on, never taken from the request payload. |
| **`admin`** | General platform administration: approve/reject COD and UPI payments, manage vendor onboarding, view reconciliation reports. |
| **`finance_admin`** (new role) | Everything `admin` can do for payments, plus: resolve escalations (e.g. insufficient-balance return blocks), invoke admin-override RPCs for stuck states, approve/reject vendor payouts. This is a narrower, more privileged role than general `admin` specifically because it can force state transitions and touch money directly — it must be assignable independently of general admin access. |
| **`service_role`** | Full privileged access. Used exclusively by Edge Functions server-side. Never exposed to any client, ever, under any circumstance. |

No RPC that mutates money is ever `GRANT`ed to `authenticated`. Every privileged RPC is `service_role`-only, called exclusively through an Edge Function that performs its own auth check first. This closes the gap identified in the recovery audit where `admin_update_payout_status` was reachable directly by any authenticated client.

---

## 5. Frontend Responsibilities (explicit)

- Collect and validate user input (client-side validation is a UX convenience, never a security boundary)
- Generate a request-nonce per money-moving action and persist it (e.g. in component state or a short-lived store) so a retry after a dropped response reuses the same nonce
- Display provisional commission/payout amounts using the shared commission module — never inventing its own math
- Handle three distinct error states distinctly: validation failure (fixable by the user), transient/retryable failure (offer retry), and terminal failure (do not offer retry, surface a clear message)
- Never assume a payment or payout succeeded without either a direct success response or a subsequent status poll/webhook-driven state update

## 6. Backend Responsibilities (explicit)

- Every Edge Function validates the caller's JWT and derives identity from it — never trusts a client-supplied user/vendor ID for authorization decisions (only for convenience/logging, always re-verified server-side)
- Every Edge Function that performs a money-moving action follows the intent→execute→confirm pattern (P8) where applicable
- Every RPC performs its own zero-trust authorization check by looking up ownership from the database, independent of what the Edge Function or client claimed
- Every RPC returns the mandated JSONB contract (see `03-database-ledger-specification.md` §3)
- CORS is restricted to a known origin allowlist for every payment-related Edge Function without exception (including `confirm-upi-payment`, which currently uses a wildcard — this is a known gap to close, not an intentional exception)

---

## 7. Reconciliation as a First-Class Concern

Because P8's intent→execute→confirm pattern introduces a window where an operation can be left "in-flight" (Edge Function crashed after the intent RPC but before the confirm RPC, and no webhook ever arrives — e.g. the Razorpay call itself never completed), the architecture includes a **generic reconciliation sweep**: a scheduled job/RPC pattern, reusable across payments, returns, and payouts, that scans for ledger rows stuck in `pending` status past a defined timeout and either resolves them (by querying Razorpay directly for the true state) or escalates them to `finance_admin` if the true state cannot be determined automatically. This is specified in detail in `03-database-ledger-specification.md` §5.

This is not an optional nicety. Every money-moving flow in this architecture must have a defined answer to "what happens if this gets stuck halfway," and that answer is the reconciliation sweep, not silent staleness.

---

## 8. What This Architecture Deliberately Does Not Do

Being explicit about scope avoids future over-engineering:

- **Does not implement tiered/per-vendor commission today** — the shared commission module's interface accommodates it, but the rate remains a fixed 95/5 constant until a separate initiative implements tiering.
- **Does not require distributed transactions or a saga framework** — the intent→execute→confirm pattern plus idempotent replay is sufficient at the target scale (§ preamble) and is implemented with ordinary Postgres transactions and RPC calls, not a distributed-transaction coordinator.
- **Does not require event sourcing or CQRS** — the append-only ledger provides auditability without requiring a full event-sourced rebuild of application state.
- **Does not mandate 100% test coverage retroactively** — coverage expectations are aspirational for new code (see `04-operational-standards.md` §3), not a blocking requirement applied to the existing codebase all at once.
- **Does not redesign the checkout, OTP, or email-queue subsystems** — these were audited as sound and are out of scope for this specification.

---

## 9. Change Control for This Specification

This document, and its three companions, may only be amended deliberately — a proposed change must be written up, reasoned about against the principles in §2, and explicitly approved, the same way this specification itself was produced. It must never be superseded implicitly by a migration or Edge Function that happens to do something different. If an implementation needs to diverge from this spec, the spec is updated first, or the implementation is wrong.
