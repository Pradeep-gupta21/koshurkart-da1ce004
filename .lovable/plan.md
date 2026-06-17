# Switch Razorpay from Test → Live

## Key insight
The Razorpay key/secret are **not in source code** — they're read from edge function secrets (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`). Switching to live is a **secrets rotation**, not a code change. Order creation, verification, and webhook handling already pull these from `Deno.env.get(...)` and will use live keys automatically once rotated.

## Steps

### 1. Rotate the three secrets (you enter values in the secure form)
- `RAZORPAY_KEY_ID` → live `rzp_live_...` Key ID
- `RAZORPAY_KEY_SECRET` → live Key Secret (paired with the live Key ID)
- `RAZORPAY_WEBHOOK_SECRET` → the secret you set when creating the **live** webhook in the Razorpay Dashboard (see step 2)

I'll trigger `update_secret` for these three; you paste values in the popup. Do **not** mix test and live (live Key ID with test Secret = signature failures).

### 2. Create the live webhook in Razorpay Dashboard
Razorpay Dashboard → **Settings → Webhooks** → switch to **Live mode** → Add webhook:
- **URL:** `https://xlqzbomiuuadxcygnsal.supabase.co/functions/v1/razorpay-webhook`
- **Secret:** generate a strong random string; use the same value in `RAZORPAY_WEBHOOK_SECRET` above
- **Active events:** `payment.captured`, `payment.failed`
- Save

### 3. Verify end-to-end (after rotation)
I'll run these checks and report back:

| Requirement | How it's verified | Code reference |
|---|---|---|
| Order creation uses live creds | `create-razorpay-order` reads `RAZORPAY_KEY_ID/SECRET` from env, calls `api.razorpay.com/v1/orders` | `supabase/functions/create-razorpay-order/index.ts` |
| Payment verification uses live creds | `verify-razorpay-payment` HMAC-validates with `RAZORPAY_KEY_SECRET` + re-fetches order from Razorpay API | `supabase/functions/verify-razorpay-payment/index.ts` |
| Successful payments create/confirm orders | On verified capture → `payments.status='success'` + `orders.status='confirmed'` | verify-razorpay-payment + razorpay-webhook |
| Failed payments do not create orders | Order row is created on checkout (pending). On `payment.failed` → `payments.status='failed'`, `orders.payment_status='failed'`. Order is **not promoted to confirmed**. Existing behavior — no change needed. | razorpay-webhook |
| Webhook signature validation | `verifyWebhookSignature()` does constant-time HMAC-SHA256 compare against `RAZORPAY_WEBHOOK_SECRET`; rejects with 401 on mismatch; dedupes via `webhook_events` table | `supabase/functions/razorpay-webhook/index.ts` |

Verification commands I'll run:
- `supabase--curl_edge_functions` GET-style probe on `create-razorpay-order` (auth required, will return 401 without a session — confirms function is up)
- `supabase--edge_function_logs` for `create-razorpay-order` and `razorpay-webhook` after you run a real ₹1 test transaction
- Check that `keyId` returned from `create-razorpay-order` to the client starts with `rzp_live_`

### 4. Clarify "failed payments do not create orders"
Current architecture creates the `orders` row **before** payment (status `pending`), then promotes to `confirmed` only on verified capture. Failed payments leave the order in `pending`/`failed` state — they're never confirmed and don't appear as completed orders.

**Question:** Is that acceptable, or do you want failed payments to **hard-delete** the pending order row? (I'd recommend leaving it for audit/retry; you already have `RetryPaymentPanel`.)

## Files / secrets touched

**Secrets rotated** (no code changes):
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

**Files inspected, not modified:**
- `supabase/functions/create-razorpay-order/index.ts`
- `supabase/functions/verify-razorpay-payment/index.ts`
- `supabase/functions/razorpay-webhook/index.ts`

**Edge functions redeployed:** none (secret rotation is picked up on next invocation; no redeploy needed).

## Before you approve
1. Have your **live** Razorpay Key ID + Key Secret ready (Razorpay Dashboard → Account & Settings → API Keys → Live mode → Generate)
2. Decide on the webhook secret string (or let Razorpay generate one when you create the webhook)
3. Answer the failed-order question above (default: leave as `failed`, don't delete)
