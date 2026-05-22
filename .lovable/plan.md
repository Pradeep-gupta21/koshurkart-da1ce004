## Goal

Replace the failing Supabase Auth phone OTP with **Twilio Verify via the Lovable Twilio connector** — no manual secrets, no Firebase, no changes to RLS or roles.

## How it works

1. User enters phone → frontend calls `otp-send` edge function.
2. `otp-send` calls Twilio Verify (`/Verifications`) through the connector gateway → Twilio sends SMS.
3. User enters code → frontend calls `otp-verify` edge function.
4. `otp-verify` calls Twilio Verify (`/VerificationCheck`). If `approved`, it uses the Supabase service role to find/create a `auth.users` row keyed by phone and returns a Supabase session (`access_token`, `refresh_token`).
5. Frontend calls `supabase.auth.setSession(...)` → user is logged in, existing roles/RLS keep working unchanged.

Resend = same `otp-send` call. Expiration = Twilio Verify enforces 10-min default server-side. No OTP storage in our DB needed — Twilio handles hashing, attempts, and expiry.

## Steps

1. **Connect Twilio** via `standard_connectors--connect` (one-click — you pick/create the connection in the picker; no manual secrets).
2. Rewrite `supabase/functions/otp-send/index.ts` → call `POST {gateway}/twilio/Verify/v2/Services/{SID}/Verifications` with `To`, `Channel=sms`.
3. Rewrite `supabase/functions/otp-verify/index.ts` → call `POST {gateway}/twilio/Verify/v2/Services/{SID}/VerificationCheck`. On `approved` → mint Supabase session via service role + return tokens.
4. Update `src/lib/otpClient.ts` to consume the session tokens and call `supabase.auth.setSession`.
5. Drop the previous Supabase-Auth phone signup path that caused the "Unable to get SMS provider" error.

## What you'll need to provide once connected

- A **Twilio Verify Service SID** (one-time create in Twilio Console → Verify → Services → "Create new"). I'll ask for it as a single secret `TWILIO_VERIFY_SERVICE_SID` after the connector is linked. Account SID + auth are handled by the connector — you don't supply them.

## Things unchanged

- All RLS, roles, profiles, vendor/admin flows.
- Existing OTP UI, countdown, resend.
- Email/password and Google sign-in (Google can be added later via Lovable Cloud's managed OAuth — say the word).

Ready to switch to build mode and run the connector picker?