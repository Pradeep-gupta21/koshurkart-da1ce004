# Finalize Razorpay Admin UI

The full Razorpay backend (create-order, verify, webhook with signature + idempotency, payment_logs, payment_audit_log, vendor earnings trigger, success/failed pages, admin-resync-payment edge function) is already in place from previous turns. The remaining gap is the admin-facing UI surface.

## Scope

Wire up `src/pages/admin/AdminPayments.tsx` end-to-end so admins can monitor, debug, and recover payments.

## Changes

1. **Tabs view** — Add Tabs: `All`, `Success`, `Pending`, `Failed`, `Refunded`. Each tab filters the payments query by `payment_status`. Show counts as badges.

2. **Payments table enhancements**
   - Columns: created_at, order id (short), user email, method, provider, amount + currency (INR), status badge, razorpay_payment_id, actions.
   - Search by order id / razorpay id / user email.
   - Skeleton loader during fetch; empty state.

3. **Payment Logs timeline drawer**
   - Clicking a row opens a `Sheet` (right-side) with a `ScrollArea` showing chronological `payment_logs` for that payment (event_type, message, metadata JSON, created_at).
   - Realtime subscribe to `payment_logs` filtered by `payment_id` so new webhook events stream in live.

4. **Re-sync with Razorpay button**
   - In the drawer header for any payment with a `razorpay_order_id` or `razorpay_payment_id`.
   - Calls existing `admin-resync-payment` edge function via `supabase.functions.invoke`.
   - Shows `Loader2` while pending, toast on success/failure, refetches the payment + logs.

5. **Failed payment quick actions**
   - In the Failed tab: surface "Re-sync" inline and a "View order" link.

6. **Toasts & error handling** — use existing `useToast`; never block UI on errors.

## Out of scope

- No backend/schema changes — all required tables, triggers, RLS, and edge functions already exist.
- No checkout flow changes.

## Files touched

- `src/pages/admin/AdminPayments.tsx` (only file)

After approval I'll implement in one pass and verify by loading the admin payments route.
