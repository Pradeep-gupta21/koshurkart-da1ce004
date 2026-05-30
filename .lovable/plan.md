## Status

A full OTP login screen already exists — `/auth/verify` (`src/pages/auth/OtpVerifyPage.tsx`) — with 6-digit input, 30s resend countdown (3-resend cap), success toasts, inline error, masked phone, and a "use a different number" back link. The phone-entry step is on `/auth` (`AuthPage.tsx` → `PhoneInput.tsx`) and posts to the Twilio-backed `otp-send` / `otp-verify` edge functions we just wired.

So rather than build a new screen, this plan **polishes the existing one** to fully match your ask.

## Changes

1. **Switch toasts to `sonner`** on `OtpVerifyPage.tsx` (project preferred). Replace `useToast` with `import { toast } from "sonner"`.
2. **Add an error toast on every failure** (verify failure, resend failure, expired/invalid code) in addition to the existing inline message — so the user gets the same feedback pattern regardless of where they're looking.
3. **Success toast on send/resend** with description (`"Code sent to +91 •••• 210"`).
4. **Disable the OTP input** while verifying to prevent double-submits and clear the code on failure so the user can retype cleanly.
5. **Auto-submit** when the 6th digit is entered (still keeps the explicit button).
6. **Clearer countdown copy**: `Resend available in 0:30` (mm:ss) and a subtle "Didn't get it? Check spam/SMS filters" hint after the first failed resend.

## Files touched

- `src/pages/auth/OtpVerifyPage.tsx` — toast swap, error toasts, auto-submit, disabled state, copy tweaks.

No backend, no routing, no schema changes. No new components needed.

## Out of scope

- The phone-entry step (`AuthPage`) — already exists and works.
- Roles routing after sign-in — already in place.
- Edge functions — Twilio integration just shipped in the previous step.

Approve to apply.