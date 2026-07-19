Status: Final
Version: 1.0
Owner: Fariha Asif (Product & Architecture)
Last Updated: 2026-07-19
Architecture Scope: Payment, Ledger, Payout, Return, and Reconciliation Subsystems

# KoshurKart Payment System — Architecture Decision Records

**Purpose:** This document explains *why* the target architecture (docs 01–04) made the decisions it made. It does not introduce, modify, or reinterpret any decision — each ADR below documents a choice already stated in the core specification, state machines, database specification, or operational standards, with its rationale and trade-offs made explicit for future maintainers.

**Companion documents:** `01-core-architecture-specification.md` · `02-state-machines.md` · `03-database-ledger-specification.md` · `04-operational-standards.md` · `06-glossary.md` · `07-sequence-diagrams.md`

---

## ADR-001: Unified Financial Ledger

**Context:** The prior implementation split financial history across `vendor_wallet_ledger`, `payment_audit_log`, and possibly a separate `payment_logs` table, with no single table representing "every financial event that happened." This made it hard to compute a trustworthy balance or run one consistent reconciliation pass.

**Decision:** All financial events — credits, debits, reservations, refunds, reversals, payouts, adjustments — are recorded in a single append-only table, `ledger_entries` (`03-database-ledger-specification.md` §1).

**Consequences:**
- One query shape computes balance regardless of which subsystem produced the event.
- One reconciliation sweep can scan a single table instead of coordinating across several.
- Requires every subsystem (returns, payouts, payments) to write through the same table and schema, which constrains flexibility in exchange for consistency.

**Related documents:** `03-database-ledger-specification.md` §1; `01-core-architecture-specification.md` P5

---

## ADR-002: Ledger as Source of Truth (Internal), Razorpay as Source of Truth (External)

**Context:** Razorpay Route settles funds to vendors on a delayed/batched schedule, meaning KoshurKart holds real custody of vendor funds in the interim. The system needed a clear answer to "what does KoshurKart owe a vendor" versus "did the money actually move."

**Decision:** The internal ledger is authoritative for what KoshurKart owes each vendor. Razorpay is authoritative for whether an external transfer or settlement actually happened. These are treated as two distinct questions with two distinct owners, never conflated (`01-core-architecture-specification.md` P5).

**Consequences:**
- A ledger write is never treated as proof a Razorpay transfer completed, and a Razorpay success is never treated as proof the internal accounting is correct — both are checked independently.
- Enables `vendors.withdrawable_balance` to reflect real, not-yet-settled custody rather than acting as a display-only figure.
- Requires the reconciliation sweep (`02-state-machines.md` §5) to exist as a first-class mechanism, since the two sources of truth can temporarily disagree while an operation is in flight.

**Related documents:** `01-core-architecture-specification.md` P5; `03-database-ledger-specification.md` §1.3

---

## ADR-003: Reversal Before Refund

**Context:** In a return, both a vendor debit (reversal) and a customer credit (refund) must happen. If ordering isn't fixed, a failure between the two steps could leave KoshurKart having refunded a customer without having recovered the vendor's share — a loss absorbed by the platform.

**Decision:** The vendor's share must be successfully reversed via Razorpay transfer reversal *before* the customer is refunded (`01-core-architecture-specification.md` P7; `02-state-machines.md` §3).

**Consequences:**
- Protects KoshurKart's margin from being exposed to reversal failures.
- Customer refund is delayed until reversal succeeds or the flow escalates — a deliberate trade-off of platform safety over refund speed.
- This ordering is a hard invariant with no UX-driven exception.

**Related documents:** `01-core-architecture-specification.md` P7; `02-state-machines.md` §3

---

## ADR-004: Intent → Execute → Confirm Pattern for External Calls

**Context:** Razorpay money-moving calls (transfer, reversal, refund, payout) are external HTTP calls that cannot happen inside a SQL transaction, creating a gap between "we decided to do this" and "it actually happened," with risk of the Edge Function crashing mid-flow.

**Decision:** Every money-moving Razorpay call follows a fixed three-step orchestration: an **intent RPC** records the operation and performs pre-condition checks before any external call; the **Edge Function** then calls Razorpay; a **confirm RPC** finalizes the ledger state based on the result (`01-core-architecture-specification.md` P8). Read-only Razorpay calls are exempt.

**Consequences:**
- Creates a well-defined, boundable window ("intent recorded, never confirmed") rather than an unbounded one, which is closed by the reconciliation sweep.
- Webhook and Edge Function confirm calls can race; resolved by first-writer-wins with idempotent replay for the second (`01-core-architecture-specification.md` P8).
- Requires every money-moving Razorpay call site to implement this three-step shape consistently — no shortcuts for "simple" operations.

**Related documents:** `01-core-architecture-specification.md` P8; `02-state-machines.md` §1–3, §5

---

## ADR-005: RPCs Own Business Logic; Edge Functions Orchestrate

**Context:** Business logic previously existed in both TypeScript Edge Functions and SQL RPCs/triggers, with no consistent boundary — this was identified as a root cause of contract drift between callers and callees.

**Decision:** All business rules — commission calculation, balance checks, state transitions, ledger writes — live exclusively in `SECURITY DEFINER` RPCs. Edge Functions are limited to authentication, request validation, orchestration, and external API calls (`01-core-architecture-specification.md` P2, §3).

**Consequences:**
- One source of truth for business logic; no duplication between TypeScript and SQL.
- Simplifies testing (business logic is testable at the RPC layer independent of HTTP concerns).
- Requires discipline to avoid "just this once" logic creeping into an Edge Function, particularly for pre-checks that feel like validation but are actually business decisions.

**Related documents:** `01-core-architecture-specification.md` P2, §3; `04-operational-standards.md` §5

---

## ADR-006: Shared Commission Module

**Context:** Commission math previously existed in at least three places (server paise-integer math, client float math, a hardcoded rate in reconciliation reporting), producing inconsistent results and reconciliation inaccuracy.

**Decision:** Exactly one implementation of commission math exists, using integer paise arithmetic, imported identically by both the RPC layer and any client-side display code (`01-core-architecture-specification.md` P3).

**Consequences:**
- Eliminates float/integer rounding divergence between client display and server-authoritative amounts.
- Client-displayed amounts are always provisional; the RPC's calculation at write time remains authoritative regardless of what was shown.
- The module's signature accepts a vendor/order context (not a hardcoded constant), so future tiered commission does not require touching every call site — without implementing tiering today.

**Related documents:** `01-core-architecture-specification.md` P3, P4; `03-database-ledger-specification.md` §7

---

## ADR-007: No Client-Writable Money Tables

**Context:** Client-writable RLS policies on money-affecting tables were a source of prior security findings (e.g. permissive INSERT/UPDATE policies allowing bypass of server-side validation).

**Decision:** No table affecting money — balances, payments, payouts, the ledger, order pricing — may ever have a client-writable RLS policy. All writes occur through an Edge Function using `service_role` (`01-core-architecture-specification.md` P1).

**Consequences:**
- Removes an entire class of client-side bypass risk categorically, rather than case by case.
- Every money-affecting write path is auditable through Edge Function code, since there is no alternate write route.
- Increases reliance on Edge Functions being correctly implemented, since they become the sole gate — reinforced by RPC-level zero-trust checks as a second layer (ADR not separately numbered; see `01-core-architecture-specification.md` §4).

**Related documents:** `01-core-architecture-specification.md` P1, §3, §4

---

## ADR-008: Finance Admin Role

**Context:** Escalation resolution and admin-override actions (e.g. forcing a stuck state, resolving an insufficient-balance block) require elevated trust beyond general platform administration, but general `admin` privileges are broader than necessary for these specific, high-risk actions.

**Decision:** A new, narrower `finance_admin` role is introduced, distinct from general `admin`. Only `finance_admin` may resolve escalations or invoke admin-override RPCs (`01-core-architecture-specification.md` §4; `02-state-machines.md` §4; `04-operational-standards.md` §3).

**Consequences:**
- Allows assigning escalation/override authority independently of general admin access, narrowing the blast radius of a compromised or misused admin account.
- Every admin-override action is tied to an identifiable `finance_admin` and recorded in an immutable audit row.
- Requires role provisioning and management to distinguish `admin` from `finance_admin` going forward — a governance responsibility, not just a technical one.

**Related documents:** `01-core-architecture-specification.md` §4; `02-state-machines.md` §4; `04-operational-standards.md` §3

---

## ADR-009: Server-Generated Operation Keys (Two-Key Idempotency Model)

**Context:** Client-generated idempotency keys alone leave no clean retry story when a client never receives the server's response (e.g. network drop after the server already created a record) — the client has no key to retry with in that scenario.

**Decision:** A two-key model is used: the client generates a **request-nonce** purely for transport-layer retry correlation; the server generates and owns the **operation key** used for ledger deduplication and audit identity, mapping nonce → operation key (`01-core-architecture-specification.md` P9; `03-database-ledger-specification.md` §4).

**Consequences:**
- A client retry with the same nonce always returns the result of the original operation, without the client needing to construct or understand the server's key format.
- Requires an additional mapping table (`nonce_operation_map`) and an Edge Function lookup step before invoking the intent RPC.
- Structurally prevents duplicate financial operations arising from client retries, closing a gap present in a purely client-generated-key design.

**Related documents:** `01-core-architecture-specification.md` P9; `03-database-ledger-specification.md` §2.2, §4

---

## ADR-010: Projection-Based `withdrawable_balance`

**Context:** Balance mutation previously occurred from multiple independent write paths (triggers and RPCs), which could disagree about whether a debit had already occurred — the exact shape of the confirmed financial-integrity defect identified in the recovery audit.

**Decision:** `vendors.withdrawable_balance` is a derived, cached projection of the ledger — never a target of direct business-logic writes. It is maintained by a narrowly-scoped projection trigger that only recomputes the sum from `ledger_entries` changes, with no decision-making logic of its own (`01-core-architecture-specification.md` P5, P11; `03-database-ledger-specification.md` §1.3).

**Consequences:**
- If the balance column and `SUM(ledger rows)` ever disagree, this is a detectable bug rather than an ambiguous "which one is right" question, since the ledger is authoritative by definition.
- The reconciliation sweep independently recomputes and compares this sum periodically, catching divergence caused by a bug in the projection trigger itself.
- Materializing the value (rather than computing it live on every read) is a deliberate performance choice at the target scale (500–5,000 vendors, 1,000–10,000 orders/day), not a correctness requirement — correctness comes from the ledger being authoritative regardless of how the projection is computed.

**Related documents:** `01-core-architecture-specification.md` P5, P11; `03-database-ledger-specification.md` §1.3, §6
