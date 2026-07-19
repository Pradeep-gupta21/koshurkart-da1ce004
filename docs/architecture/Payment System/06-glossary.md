Status: Final
Version: 1.0
Owner: Fariha Asif (Product & Architecture)
Last Updated: 2026-07-19
Architecture Scope: Payment, Ledger, Payout, Return, and Reconciliation Subsystems

# KoshurKart Payment System — Glossary

**Purpose:** Concise, consistent definitions for terms used throughout the architecture documents. Definitions here do not introduce new concepts — each term is drawn directly from its usage in docs 01–04.

**Companion documents:** `01-core-architecture-specification.md` · `02-state-machines.md` · `03-database-ledger-specification.md` · `04-operational-standards.md` · `05-architecture-decisions.md` · `07-sequence-diagrams.md`

---

**Adjustment**
A ledger entry `type` used for corrections, credit-backs, or manual balance changes made through the standard RPC path (e.g. reversing a payout reservation on rejection). Never a direct edit to an existing row — a correction is always a new row. (`03-database-ledger-specification.md` §1.2)

**Client Nonce**
A client-generated, opaque value created once per user-initiated money-moving action and reused on retry. Used purely for transport-layer retry correlation — "is this the same request I already sent?" Distinct from the server-generated operation key. (`01-core-architecture-specification.md` P9; `03-database-ledger-specification.md` §4)

**Confirm (Confirm RPC)**
The third step of the intent → execute → confirm pattern: after an Edge Function calls an external Razorpay API, it calls a confirm RPC with the result, which finalizes the corresponding ledger entry's status (`confirmed` or `failed`) and performs any resulting state transition. (`01-core-architecture-specification.md` P8)

**Edge Function**
A Supabase Edge Function (Deno/TypeScript). In this architecture, limited to authentication, request validation, orchestration between RPC calls, and calls to external APIs (Razorpay, email, SMS). Never contains business logic, commission math, or direct writes to money-affecting tables. (`01-core-architecture-specification.md` P2, §3)

**Escalation**
A workflow state (not a ledger entry) representing an operation that cannot proceed automatically — today, specifically a return reversal blocked by insufficient vendor balance. Recorded in the `payment_escalations` table, referencing the blocked ledger entry, and resolved only by a `finance_admin` via an audited admin-override RPC. (`02-state-machines.md` §3–4; `03-database-ledger-specification.md` §2.1)

**Failed**
A terminal or intermediate ledger entry status indicating the corresponding operation did not succeed (e.g. a Razorpay transfer that errored). Distinct from `pending` (not yet resolved) and `confirmed` (succeeded). (`03-database-ledger-specification.md` §1.2)

**Finance Admin**
A platform role, narrower and more privileged than general `admin` specifically for money-affecting actions. The only role permitted to resolve escalations or invoke admin-override RPCs. Assignable independently of general admin access. (`01-core-architecture-specification.md` §4; `04-operational-standards.md` §3)

**Idempotency**
The property that performing the same operation multiple times (e.g. due to a client retry or a webhook redelivery) produces the same result as performing it once, without duplicate financial effect. Achieved in this architecture through the two-key model (client nonce + operation key) and the ledger's unique constraint on `operation_key`. (`01-core-architecture-specification.md` P9; `03-database-ledger-specification.md` §4, §6)

**Intent (Intent RPC)**
The first step of the intent → execute → confirm pattern: an RPC call that records an operation's intent in the ledger (status `pending`) and performs all pre-condition checks (balance sufficiency, state validity) before any external call is made. (`01-core-architecture-specification.md` P8; `02-state-machines.md` §1–3)

**Ledger**
Short for the unified financial ledger — see **Ledger Entry** and **`ledger_entries`**. The single source of truth for KoshurKart's internal financial state (what is owed to each vendor and why), as distinct from Razorpay's external settlement state. (`01-core-architecture-specification.md` P5; `03-database-ledger-specification.md` §1)

**Ledger Entry**
A single row in the `ledger_entries` table, representing one financial event (credit, debit, reservation, refund, reversal, payout, or adjustment). Immutable except for its `status` transition and `confirmed_at` timestamp; a correction is always a new row, never an edit. (`03-database-ledger-specification.md` §1.2)

**Materialized Balance**
See **Projection**. Used interchangeably in this architecture to describe `vendors.withdrawable_balance` as a maintained (not live-computed) sum derived from ledger entries, chosen for performance at target scale. (`03-database-ledger-specification.md` §1.3)

**Operation Key**
The server-generated identifier for a specific financial operation, stored uniquely on its `ledger_entries` row. Used for deduplication (via a unique database constraint, not just application logic) and as the audit identity for that operation. Mapped from the client's request nonce via `nonce_operation_map`. (`01-core-architecture-specification.md` P9; `03-database-ledger-specification.md` §1.2, §2.2, §4)

**Pending**
A ledger entry status indicating an operation's intent has been recorded but not yet confirmed or failed. The reconciliation sweep scans for entries stuck in this status past a defined timeout. (`03-database-ledger-specification.md` §1.2, §5)

**Projection**
A value computed/derived from the ledger rather than independently written to. `vendors.withdrawable_balance` is a projection of `ledger_entries` — it is never the direct target of a business-logic write, only recomputed by a narrowly-scoped trigger reacting to ledger changes. (`01-core-architecture-specification.md` P5; `03-database-ledger-specification.md` §1.3)

**Reconciliation**
The process of detecting and resolving divergence between the internal ledger and Razorpay's actual state, or between the materialized balance and the ledger's true sum. Implemented as a scheduled reconciliation sweep for stuck `pending` entries, and implicitly as an ongoing invariant that the balance projection is expected to match `SUM(ledger rows)`. (`02-state-machines.md` §5; `03-database-ledger-specification.md` §1.3, §5)

**Refund**
A ledger entry `type` representing money returned to a customer via Razorpay, occurring only after a successful reversal in the return flow (per the reversal-before-refund invariant). (`01-core-architecture-specification.md` P7; `02-state-machines.md` §3; `03-database-ledger-specification.md` §1.2)

**Reservation**
A ledger entry `type` representing funds set aside (e.g. at payout request time) before the corresponding operation is confirmed. A reservation reduces the derived/available balance immediately, even while `pending`, specifically to prevent a double-spend race between concurrent requests. (`02-state-machines.md` §2; `03-database-ledger-specification.md` §1.3)

**Retryable Error**
An error condition where the client is expected to be able to safely retry the operation (e.g. a transient gateway timeout), as opposed to a non-retryable error (e.g. a validation failure) that requires the client to change something first. Indicated explicitly by the `retryable` boolean in the standard error response contract. (`04-operational-standards.md` §1)

**Reversal (Transfer Reversal)**
A ledger entry `type`, and the corresponding Razorpay API action, that pulls a vendor's previously transferred share back via Razorpay Route — the first money-movement step in a return, required to complete successfully before the customer refund is issued. (`01-core-architecture-specification.md` P7; `02-state-machines.md` §3; `03-database-ledger-specification.md` §1.2)

**RPC (Remote Procedure Call)**
In this architecture, specifically a Postgres function called from an Edge Function, typically `SECURITY DEFINER`. Owns all business logic — commission calculation, balance checks, state transitions, ledger writes. (`01-core-architecture-specification.md` P2, §3)

**SECURITY DEFINER**
A Postgres function attribute causing the function to execute with the privileges of its owner rather than its caller. Used for all business-logic RPCs so that a client (which never holds direct table-write privileges on money-affecting tables) can still trigger a privileged, controlled mutation — with the RPC itself performing zero-trust authorization checks rather than relying on the caller's claimed identity. (`01-core-architecture-specification.md` §3–4)

**Service Role**
The privileged Supabase role used exclusively by Edge Functions server-side to perform writes to money-affecting tables. Never exposed to any client under any circumstance. No money-mutating RPC is ever granted to `authenticated`; all are `service_role`-only. (`01-core-architecture-specification.md` P1, §4)

**Transfer**
The Razorpay Route mechanism by which a vendor's share of a payment is moved toward the vendor's linked account, subject to Razorpay's own delayed/batched settlement schedule. (`01-core-architecture-specification.md` §"Money custody" discussion, P5)

**Zero-Trust Authorization**
The principle that every RPC independently verifies a caller's authorization to act on a given resource by looking up ownership from the database (e.g. an order item's actual `vendor_id`), rather than trusting an identity claimed by the Edge Function or client request payload. Applied uniformly across customer, vendor, and admin actions. (`01-core-architecture-specification.md` §4, §6; `02-state-machines.md` §3)
