# KoshurKart Payment System — State Machines

**Status:** Authoritative target architecture
**Companion documents:** `01-core-architecture-specification.md` (principles) · `03-database-ledger-specification.md` (schema/RPCs) · `04-operational-standards.md` (error/testing/deployment)

**Formality level:** These are sequential state machines with defined exception/error branches at each step — not simple linear flows with no error handling, and not fully generalized state machines with recovery states enumerated for every conceivable failure mode. Where a failure mode has a defined recovery path (e.g. reconciliation sweep, escalation), it is shown explicitly. Failure modes not shown are assumed to be handled by the generic reconciliation sweep (§5).

---

## 1. Payment Lifecycle (Razorpay Checkout)

```
                         [created: quote-checkout]
                                    │
                         customer submits checkout
                                    │
                    ┌───────────────▼───────────────┐
                    │  Intent RPC: create_order       │
                    │  - Re-prices server-side          │
                    │  - Reserves stock                 │
                    │  - Computes per-vendor commission │
                    │    (P4: per line item, not total) │
                    │  - Creates order + order_items    │
                    │  - Creates payment row: pending    │
                    │  - Creates ledger intent rows       │
                    │    (status: pending)                │
                    └───────────────┬───────────────┘
                                    │
                          [payment: pending]
                                    │
                    Edge Fn creates Razorpay Order (external call)
                                    │
                          Razorpay modal opens
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                             ▼
     Customer completes payment                   Customer dismisses modal
              │                                             │
              ▼                                    [payment: pending]
   Razorpay SDK onSuccess fires                    (order left pending;
              │                                     resolved by webhook
   ┌──────────▼──────────┐                          timeout or customer
   │ Confirm RPC:          │                          retry — no orphan
   │ verify_payment         │                          write occurs)
   │ - HMAC signature check │
   │ - Fetches Razorpay      │
   │   payment, confirms      │
   │   captured + amount       │
   │ - payment → success         │
   │ - order → confirmed           │
   │ - ledger rows → confirmed       │
   └──────────┬──────────────────────┘
              │
   (races with, does not conflict with:)
              │
   ┌──────────▼──────────────────────┐
   │ Razorpay webhook: payment.captured │
   │ - Same finalization, idempotent    │
   │   no-op if confirm RPC already ran │
   │   (first-writer-wins, P8)          │
   └─────────────────────────────────┘
              │
              ▼
        [payment: success] ── terminal
              │
   (async, independent) Razorpay webhook: transfer.processed
              │
   Updates order_items.transfer_status; on transfer.failed,
   logs to payment_transfer_issues for finance_admin visibility
```

**Terminal states:** `success`, `failed`, `refunded`, `reversed`

**COD variant:** Same intent RPC creates the order and payment row (`pending`), but no Razorpay Order is created. Finalization happens via `admin-verify-payment` on delivery confirmation, calling the same confirm-RPC pattern used by the Razorpay path — not a separate implementation.

**Direct/manual UPI variant:** Customer pays via displayed QR code, uploads proof; `confirm-upi-payment` moves payment to `pending_verification` (not `success` — this state requires human confirmation, unlike the automated Razorpay/COD paths). `finance_admin` (or `admin`, for the UPI-verify checkpoint specifically) approves or rejects via the same confirm-RPC pattern, using the unified `approve`/`reject` action vocabulary (see §6, closing the current `verify`/`approve` naming mismatch).

---

## 2. Payout Lifecycle

```
       Vendor requests payout
                │
   Client generates request-nonce (P9)
                │
   ┌────────────▼────────────────────┐
   │ Intent RPC: request_payout          │
   │ - Nonce → server-generated             │
   │   operation idempotency key (P9)         │
   │ - Balance check (ledger-derived,           │
   │   P5) — must be sufficient, no overdraft     │
   │   (P6)                                          │
   │ - Reserves amount: ledger row                    │
   │   type=reservation, status=pending                │
   │ - vendors.withdrawable_balance                      │
   │   recomputed (reflects reservation)                   │
   │ - Method IDOR check against                             │
   │   vendor_payment_setup                                    │
   └────────────┬───────────────────────────────────────────────┘
                │
        [payout: pending, debited via reservation]
                │
   ┌────────────▼────────────────────┐
   │ finance_admin reviews payout        │
   └────────────┬────────────────────┘
                │
     ┌──────────┴──────────┐
     ▼                      ▼
[processing]         [rejected/cancelled/failed]
     │                      │
     │              Confirm RPC: reverses the
     │              reservation — ledger credit
     │              row (type=adjustment) restores
     │              balance; payout row → terminal
     │
     ▼
   Razorpay Route transfer initiated (external call, P8)
     │
┌────┴─────────────────────┐
▼                            ▼
Transfer succeeds          Transfer fails
     │                            │
Confirm RPC:                Confirm RPC:
ledger reservation           ledger reservation → failed;
→ confirmed (payout);        credit-back row (adjustment);
payout → completed             payout → failed
(terminal)                     (terminal)
```

**Terminal states:** `completed`, `rejected`, `cancelled`, `failed`

**Note on the reservation model:** Under P5/P6, "debiting" a payout is not a separate mutation from "reserving" it — a payout reservation IS a ledger row from the moment of request. There is no longer a `debit_balance_on_payout_complete` trigger that fires later; the reservation at intent-time already reflects in the derived balance. Completion simply confirms the reservation rather than creating a new debit. This eliminates the entire class of bug where a legacy trigger and an RPC-driven path could disagree about whether a debit already happened (previously guarded ad hoc via `debited_at IS NULL`; now structurally impossible because there is one write path).

---

## 3. Return & Refund Lifecycle

```
         Customer requests return
                    │
         [return_status: requested]
                    │
         Vendor clicks "Approve Return"
                    │
   ┌────────────────▼────────────────────┐
   │ Intent RPC: approve_return_intent        │
   │ - Zero-trust: vendor_id looked up from     │
   │   order_item row, not caller claim (P2/§4)   │
   │ - Status check: must be 'requested'            │
   │   (single authoritative pre-condition,           │
   │   no separate optimistic-lock write by the         │
   │   Edge Function — the RPC itself performs           │
   │   the FOR UPDATE lock and status transition)          │
   │ - Computes proportional refund from                     │
   │   payment.vendor_earnings (per line item, P4)             │
   │ - BALANCE CHECK (P6): would this reversal                   │
   │   push withdrawable_balance negative?                          │
   └────────────────┬─────────────────────────────────────────────────┘
                     │
        ┌────────────┴─────────────┐
        ▼                            ▼
  Balance sufficient          Balance insufficient
        │                            │
[return_status: reversing]   [return_status: escalated]
        │                     (new terminal-pending state)
        │                            │
        │                     Row written to
        │                     payment_escalations
        │                     (workflow table, NOT
        │                     the ledger — see
        │                     03-database-ledger
        │                     -specification.md §2)
        │                            │
        │                     finance_admin notified;
        │                     resolves via audited
        │                     admin-override RPC only
        │                     (never a direct table
        │                     write) — outcomes:
        │                     approve-with-manual-
        │                     adjustment, or reject
        │                            │
        │              ┌─────────────┴─────────────┐
        │              ▼                             ▼
        │      Resolved: proceed               Resolved: reject
        │      to reversal (rejoin                  │
        │      main flow below)              [return_status: rejected]
        │                                          (terminal)
        ▼
   External call: Razorpay transfer reversal (P7, P8)
   - Idempotency: razorpay_reversal_id checked first
        │
   Confirm RPC: reversal confirmed
   - Ledger: debit row (type=reversal), status=confirmed
   - vendors.withdrawable_balance recomputed
        │
[return_status: refunding]
        │
   External call: Razorpay refund to customer (P7, P8)
   - Idempotency: razorpay_refund_id checked first
        │
   Confirm RPC: refund confirmed
   - Ledger: refund row, status=confirmed
        │
[return_status: approved] ── terminal
```

**Terminal states:** `approved`, `rejected`

**Non-terminal-but-stable state:** `escalated` — the return is not progressing automatically, but it is not lost or silently stuck; it has an owner (`finance_admin`) and a visible queue entry.

**Critical rule carried forward from the recovery audit:** the RPC that performs the state check and the code path that writes the pre-transition state must never be split across two independently-deployable files that can drift (this was the exact shape of the original BLOCKER-1 defect: Edge Function set `'processing'`, RPC expected `'requested'`). In this target architecture, the *entire* pre-condition check, lock, and state transition happen inside a single RPC call — the Edge Function does not perform any preliminary status write of its own.

---

## 4. Escalation Workflow (new subsystem)

Escalations are workflow/metadata, not financial facts (per P5/`03-database-ledger-specification.md` §2's separation of ledger vs. workflow tables). An escalation row:

- References the blocked ledger intent row (foreign key, not duplication)
- Has its own status: `open`, `resolved_approved`, `resolved_rejected`
- Records which `finance_admin` resolved it and when
- Is only ever mutated via the admin-override RPC (P2, P6) — direct table writes are blocked the same way `return_status` mutation is currently protected (`prevent_direct_return_status_update`-style trigger, generalized to this table)

This pattern (insufficient balance → escalate, don't fail silently and don't auto-overdraft) is specific to returns today because that's the identified scenario, but the workflow table and admin-override RPC pattern are generic enough to extend to any future operation that needs the same "block and escalate rather than proceed unsafely" behavior.

---

## 5. Reconciliation Sweep (cross-cutting recovery mechanism)

Applies to any ledger row left in `pending` status past a defined timeout (payment confirm, payout confirm, reversal confirm, refund confirm — any P8 intent that never received its confirm step).

```
Scheduled job (e.g. every N minutes)
        │
   Query: ledger rows WHERE status = 'pending'
          AND created_at < now() - timeout_threshold
        │
   For each stuck row:
        │
   ┌────▼─────────────────────────┐
   │ Query Razorpay directly for      │
   │ the true state of the referenced    │
   │ operation (payment/transfer/refund)   │
   └────┬─────────────────────────────────┘
        │
   ┌────┴──────────────┐
   ▼                     ▼
Razorpay confirms    Razorpay has no record /
definite outcome     ambiguous response
   │                     │
Apply the same        Escalate to finance_admin
confirm-RPC path      (same escalation workflow
as if the webhook     as §4) — do not guess,
or Edge Fn confirm      do not auto-fail, do not
had arrived              auto-succeed
(idempotent — safe
even if it later
turns out the original
confirm also eventually
arrives; first-writer-
wins, P8)
```

This mechanism exists precisely because P8's intent→execute→confirm pattern has a structural gap (the window between intent and confirm) that must have a defined closure — an architecture is not "done" if it has a known unhandled failure window. Implementation detail (job scheduling mechanism, timeout thresholds per operation type) belongs in `03-database-ledger-specification.md` and is intentionally not fixed at the principle level here, since these are tuning parameters, not architecture.

---

## 6. Naming Convention Note (closing DRIFT-06)

All admin approve/reject actions across every payment subsystem (COD, UPI manual verification, returns, payouts, escalations) use the same two-value action vocabulary: `approve` / `reject`. There is no third synonym (`verify`, `confirm`, `accept`, etc.) introduced anywhere in the payment system for what is semantically an approve/reject decision. This is a direct closure of the audit's confirmed UPI action-name mismatch, generalized as a standing convention so it cannot recur elsewhere.
