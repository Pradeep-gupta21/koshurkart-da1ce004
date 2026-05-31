## Goal
Fully retire the Razorpay secret that was committed to `.env` and replace it with a freshly rotated key stored only in Lovable Cloud runtime secrets.

## What you do (in the Razorpay dashboard)
I cannot log into Razorpay for you. You handle these steps:

1. Sign in to https://dashboard.razorpay.com → Account & Settings → API Keys.
2. For the **Test** mode key `rzp_test_SrbTu4FUxhtbwC` (the one currently in `.env`):
   - Click **Regenerate Test Key** (or generate a new key and delete the old one).
   - Copy the new **Key Id** and **Key Secret** immediately — the secret is shown only once.
3. If you also use a Live key, repeat for Live mode.
4. Treat the old secret `2dT6OwJxwCH2ULLFQaAk2aXN` as compromised — it is in git history. Confirm the old key is revoked in the dashboard before continuing.

Tell me when you have the new Key Id + Key Secret ready.

## What I do (in this project)

1. **Update runtime secrets in Lovable Cloud** (server-side, used by all `razorpay-*` edge functions):
   - `RAZORPAY_KEY_ID` → new key id
   - `RAZORPAY_KEY_SECRET` → new key secret
   - `RAZORPAY_WEBHOOK_SECRET` → unchanged unless you also rotated the webhook secret
   
   I will trigger the secure secret input form via the secrets tool — you paste the values directly, I never see them.

2. **Burn the committed `.env` secret**:
   - Remove `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` lines from `.env`.
   - Leave only the auto-managed `VITE_SUPABASE_*` entries (those are publishable/anon and safe).
   - Razorpay secrets must never live in `.env` — edge functions read them from Lovable Cloud secrets at runtime, and `.env` is bundled into the client build.

3. **Verify**:
   - Grep the repo to confirm no remaining references to the old key id/secret or to `import.meta.env.VITE_RAZORPAY*` / `process.env.RAZORPAY*` in client code.
   - Confirm `create-razorpay-order`, `verify-razorpay-payment`, and `razorpay-webhook` edge functions read from `Deno.env.get('RAZORPAY_KEY_SECRET')` only.
   - Ask you to run one test checkout (Razorpay test card) to confirm the new key works end-to-end.

## Important reminder
Even after I remove the lines from `.env`, the old secret remains in **git history**. The only thing that actually neutralizes it is the dashboard rotation in step 1 — which is why that step is non-negotiable and must happen first.

## Ready to start?
Confirm:
- (a) You have rotated the key in the Razorpay dashboard and have the new Key Id + Key Secret in hand, **or**
- (b) You want me to open the secret-input form first so you can paste them as soon as you finish rotating.