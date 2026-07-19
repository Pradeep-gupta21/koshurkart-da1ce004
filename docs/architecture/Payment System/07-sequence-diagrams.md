Status: Final
Version: 1.0
Owner: Fariha Asif (Product & Architecture)
Last Updated: 2026-07-19
Architecture Scope: Payment, Ledger, Payout, Return, and Reconciliation Subsystems

# KoshurKart Payment System — Sequence Diagrams

**Purpose:** Visual (Mermaid) representations of the workflows already defined in `02-state-machines.md`. These diagrams are a rendering aid for onboarding and review — they do not define new behavior. Where a diagram and `02-state-machines.md` ever appear to differ, the text in `02-state-machines.md` is authoritative and this document should be corrected to match it.

**Companion documents:** `01-core-architecture-specification.md` · `02-state-machines.md` (source of truth for all flows below) · `03-database-ledger-specification.md` · `04-operational-standards.md` · `05-architecture-decisions.md` · `06-glossary.md`

---

## 1. Customer Checkout (Razorpay Path)

Source: `02-state-machines.md` §1

```mermaid
sequenceDiagram
    participant C as Customer (Frontend)
    participant EF as Edge Function
    participant IR as Intent RPC (create_order)
    participant L as Ledger
    participant RP as Razorpay
    participant CR as Confirm RPC (verify_payment)
    participant WH as Razorpay Webhook

    C->>EF: Submit checkout
    EF->>IR: Create order (intent)
    IR->>IR: Re-price server-side
    IR->>IR: Reserve stock
    IR->>IR: Compute per-vendor commission (P4)
    IR->>L: Write ledger intent rows (status: pending)
    IR-->>EF: order + order_items + payment (status: pending)
    EF->>RP: Create Razorpay Order (external call)
    RP-->>C: Open Razorpay modal

    alt Customer completes payment
        C->>RP: Submits payment
        RP-->>C: onSuccess (payment_id, order_id, signature)
        C->>EF: Submit verification payload
        EF->>CR: Confirm payment
        CR->>CR: HMAC signature check
        CR->>RP: Fetch payment, confirm captured + amount
        CR->>L: Ledger rows → confirmed
        CR-->>EF: payment: success, order: confirmed
    else Customer dismisses modal
        C--xEF: No verification call
        Note over EF,L: payment stays "pending"<br/>No orphan write occurs
    end

    par Webhook races confirm RPC
        RP->>WH: payment.captured event
        WH->>CR: Same finalization path
        Note over CR: Idempotent no-op if<br/>Confirm RPC already ran<br/>(first-writer-wins, P8)
    end

    Note over L: payment: success (terminal)

    RP->>WH: transfer.processed (async, independent)
    WH->>L: Update order_items.transfer_status
    alt transfer.failed
        WH->>EF: Log to payment_transfer_issues
        Note over EF: Visible to finance_admin
    end
```

**COD variant:** Same intent RPC path; no Razorpay Order step. Finalization triggered by `admin-verify-payment` on delivery confirmation, using the same Confirm RPC pattern shown above.

**Manual UPI variant:** See Diagram 5.

---

## 2. Vendor Payout

Source: `02-state-machines.md` §2

```mermaid
sequenceDiagram
    participant V as Vendor (Frontend)
    participant EF as Edge Function
    participant IR as Intent RPC (request_payout)
    participant L as Ledger
    participant FA as Finance Admin
    participant RP as Razorpay Route
    participant CR as Confirm RPC

    V->>EF: Request payout
    EF->>EF: Generate/lookup request-nonce (P9)
    EF->>IR: Request payout (intent)
    IR->>IR: Map nonce → operation key
    IR->>L: Balance check (ledger-derived, P5)
    alt Balance insufficient
        IR-->>EF: Blocked — no overdraft (P6)
        EF-->>V: Payout rejected
    else Balance sufficient
        IR->>L: Reserve amount (type=reservation, status=pending)
        IR->>IR: Method IDOR check (vendor_payment_setup)
        IR-->>EF: payout: pending (debited via reservation)
    end

    EF->>FA: Payout awaiting review
    FA->>EF: Approve or reject

    alt Rejected / cancelled / failed at review
        EF->>CR: Reverse reservation
        CR->>L: Credit row (type=adjustment)
        CR-->>EF: payout: terminal (rejected/cancelled/failed)
    else Approved (processing)
        EF->>RP: Initiate transfer (external call, P8)
        alt Transfer succeeds
            RP-->>EF: Success
            EF->>CR: Confirm success
            CR->>L: Reservation → confirmed
            CR-->>EF: payout: completed (terminal)
        else Transfer fails
            RP-->>EF: Failure
            EF->>CR: Confirm failure
            CR->>L: Reservation → failed; credit-back row (adjustment)
            CR-->>EF: payout: failed (terminal)
        end
    end
```

**Note:** The reservation created at intent time already reflects in the derived balance — there is no separate later "debit" step. Completion only confirms the existing reservation (see `02-state-machines.md` §2 note on the reservation model).

---

## 3. Return Approval

Source: `02-state-machines.md` §3

```mermaid
sequenceDiagram
    participant Cu as Customer
    participant V as Vendor (Frontend)
    participant EF as Edge Function
    participant IR as Intent RPC (approve_return_intent)
    participant L as Ledger
    participant ES as Escalation Table
    participant FA as Finance Admin
    participant RP as Razorpay
    participant CR as Confirm RPC

    Cu->>V: Requests return
    Note over V: return_status: requested

    V->>EF: Approve return
    EF->>IR: Approve return (intent)
    IR->>IR: Zero-trust vendor_id lookup (P2/§4)
    IR->>IR: Status check: must be 'requested'<br/>(single RPC-owned lock + transition)
    IR->>IR: Compute proportional refund (per line item, P4)
    IR->>L: Balance check — would reversal go negative? (P6)

    alt Balance insufficient
        IR->>ES: Write escalation row (references blocked intent)
        Note over V: return_status: escalated
        ES->>FA: Notify finance_admin
        FA->>ES: Resolve (admin-override RPC only)
        alt Resolved: reject
            ES-->>V: return_status: rejected (terminal)
        else Resolved: proceed
            Note over IR: Rejoins main flow below
        end
    end

    Note over V: return_status: reversing
    EF->>RP: Transfer reversal (external call, P7/P8)
    Note over EF: Idempotency: razorpay_reversal_id checked first
    RP-->>EF: Reversal result
    EF->>CR: Confirm reversal
    CR->>L: Debit row (type=reversal, status=confirmed)
    CR->>L: Recompute vendors.withdrawable_balance

    Note over V: return_status: refunding
    EF->>RP: Refund to customer (external call, P7/P8)
    Note over EF: Idempotency: razorpay_refund_id checked first
    RP-->>EF: Refund result
    EF->>CR: Confirm refund
    CR->>L: Refund row (status=confirmed)

    Note over V: return_status: approved (terminal)
```

**Critical rule preserved:** the status pre-condition check, lock, and transition all happen inside the single Intent RPC — no separate optimistic-lock write occurs in the Edge Function (closes the original BLOCKER-1 defect shape; see `05-architecture-decisions.md` and `02-state-machines.md` §3).

---

## 4. Reconciliation Sweep

Source: `02-state-machines.md` §5

```mermaid
sequenceDiagram
    participant S as Scheduler (cron-invoked Edge Function)
    participant L as Ledger
    participant RP as Razorpay
    participant CR as Confirm RPC
    participant ES as Escalation Table
    participant FA as Finance Admin

    S->>L: Query rows WHERE status='pending'<br/>AND created_at < now() - timeout
    L-->>S: Stuck ledger entries

    loop For each stuck entry
        S->>RP: Query true state of referenced operation
        alt Razorpay confirms definite outcome
            RP-->>S: Definite result
            S->>CR: Apply confirm-RPC path
            CR->>L: Finalize entry (confirmed/failed)
            Note over CR: Idempotent — safe even if the<br/>original confirm also later arrives<br/>(first-writer-wins, P8)
        else No record / ambiguous response
            RP-->>S: Ambiguous
            S->>ES: Write escalation row
            ES->>FA: Notify finance_admin
            Note over S: Never guessed — no auto-fail,<br/>no auto-succeed on ambiguity
        end
    end
```

---

## 5. Manual UPI Verification

Source: `02-state-machines.md` §1 ("Direct/manual UPI variant")

```mermaid
sequenceDiagram
    participant Cu as Customer
    participant EF as Edge Function (confirm-upi-payment)
    participant A as Admin / Finance Admin
    participant CR as Confirm RPC

    Cu->>EF: Upload payment proof (QR-code payment)
    EF->>EF: payment → pending_verification
    Note over EF: Requires human confirmation —<br/>not automated like Razorpay/COD

    A->>EF: Review proof
    A->>CR: Approve or reject<br/>(unified approve/reject vocabulary, §6)

    alt Approve
        CR-->>EF: payment: success
    else Reject
        CR-->>EF: payment: failed
    end
```

**Naming convention note:** this flow uses the same `approve`/`reject` action vocabulary as every other admin decision point in the system (payouts, returns, escalations) — no separate `verify` action exists (`02-state-machines.md` §6).
