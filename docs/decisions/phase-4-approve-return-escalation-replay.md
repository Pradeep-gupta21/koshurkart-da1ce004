# Phase 4 — approve_return_intent Escalation Replay Decision

## Status

Deferred — Not Currently Actionable

## CodeRabbit Finding

CodeRabbit suggested adding:

`AND pe.status = 'open'::escalation_status`

to the escalated replay lookup in:

`supabase/migrations/20260809144300_fix_approve_return_intent_reversal_replay.sql`

because it believes a resolved escalation could be selected while `order_items.return_status` remains 'escalated'.

## Verified Current Implementation

- `payment_escalations.status` values:
  `open`
  `resolved_approved`
  `resolved_rejected`

- Current application creates escalations only as `open`.

- No current repository code transitions an escalation from `open` to either `resolved_approved` or `resolved_rejected`.

- Phase 6 escalation resolution is not currently implemented.

- Current `order_items.return_status` transitions include:
  `requested` -> `reversing`
  `requested` -> `escalated`
  `requested` -> `rejected`
  `reversing` -> `refunding`
  `refunding` -> `approved`

- There is currently no implemented transition out of `escalated`.

## Decision

The replay query is NOT being changed to filter `payment_escalations.status = 'open'` at this stage.

The CodeRabbit finding is deferred because the repository currently provides no legitimate application path capable of producing a resolved escalation while `order_items.return_status` remains escalated.

Adding the filter now would encode an assumption about the future Phase 6 state machine that has not yet been implemented or verified.

## Phase 6 Follow-Up Requirement

When Phase 6 escalation resolution is implemented, this issue MUST be revisited.

At that time verify:

1. Every payment escalation status transition.
2. Every `order_items.return_status` transition involving escalated.
3. Whether escalation resolution and return-state transition occur atomically.
4. Whether a resolved escalation can ever legitimately coexist with `return_status = 'escalated'`.
5. Whether `approve_return_intent` replay should accept only open escalations or another explicitly defined set of escalation states.
6. Whether the replay query should include an explicit status predicate.
7. Whether additional state-machine constraints are required.

## Evidence

Relevant repository files inspected:
- The `payment_escalations` table creation migration: `20260720142612_create_payment_escalations_table.sql`
- The current `approve_return_intent` migration: `20260809144300_fix_approve_return_intent_reversal_replay.sql`
- The migrations/functions defining return_status transitions: `20260731123319_create_return_reversal_confirm_rpc.sql`, `20260731130000_create_return_refund_confirm_rpc.sql`, `20260727174432_create_return_approve_intent_rpc.sql`, `20260804120000_fix_vendor_reject_return_auth_resolution.sql`
- Relevant security/authorization migrations: `20260728192956_secure_payment_escalations.sql`, `20260728193847_fix_payment_escalations_authorization.sql`

## Important Constraint

This document is a decision record, not an implementation specification for Phase 6.

Future developers/agents must NOT treat this document as proof that `resolved_approved` or `resolved_rejected` can never coexist with escalated after Phase 6 is implemented.

They must re-verify the actual Phase 6 implementation.
