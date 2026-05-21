# OTP Login System — Plan

The project already has basic phone OTP via Supabase Auth on `/auth`. This plan upgrades it to a production-grade, provider-agnostic OTP flow with a premium UI and a dedicated verification page.

## 1. UX flow

```
/auth (Phone tab)        →  enter phone, "Send code"
        ↓ navigate
/auth/verify-otp?phone=  →  6-digit OTP, countdown, resend, change number
        ↓ on success
role-based redirect (/, /vendor, /admin)
```

- Country-code selector (default `+91`) + number input with live E.164 validation.
- Dedicated `OtpVerifyPage` with: masked phone display, 6 digit OTP slots with auto-advance and paste support, **30s countdown timer** before "Resend code" becomes active, max 3 resends per session, "Change number" link.
- Errors shown inline (invalid code, expired, too many attempts).
- Subtle motion (fade/scale) on send → verify transition; haptic-style focused OTP slots.
- Rate limited client-side via existing `rateLimiter` (`otpSend`, `otpVerify` rules) and server-side by the provider.

## 2. Backend architecture (provider-agnostic)

Default provider = **Supabase Auth phone OTP** (already wired). To support Twilio / MSG91 / Firebase without rewriting the frontend, introduce two edge functions and a `platform_settings` row.

```text
Frontend ──► supabase.functions.invoke("otp-send",   { phone })
Frontend ──► supabase.functions.invoke("otp-verify", { phone, code })
                          │
                          ▼
              ┌──────────────────────┐
              │  Provider Strategy   │  selected via platform_settings.otp_provider
              ├──────────────────────┤
              │ supabase  (default)  │  → supabase.auth.signInWithOtp / verifyOtp
              │ twilio               │  → Verify v2 /Services/{sid}/Verifications(/Check)
              │ msg91                │  → /api/v5/otp + /api/v5/otp/verify
              │ firebase             │  → Identity Toolkit sendVerificationCode + signInWithPhoneNumber
              └──────────────────────┘
```

Both functions:
- Validate input with Zod (`phone` E.164, `code` 4–8 digits).
- CORS handled.
- Rate limit by `phone` + IP (in-memory bucket; documented as best-effort).
- Never log full phone or OTP; log only hashed values.
- On verify success, mint a Supabase session for the user (for non-Supabase providers, use `supabase.auth.admin.generateLink` / signInWithIdToken pattern documented inline; user MUST add provider secret before enabling).

`platform_settings` key `otp_provider` = `"supabase" | "twilio" | "msg91" | "firebase"` (default `supabase`). Admin can switch later.

## 3. Secrets (only added when user enables a provider)

Not requested now — only `supabase` is active. When the user enables another provider we will call `add_secret`:

- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- MSG91: `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`
- Firebase: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`

## 4. OTP expiration / resend rules

- OTP lifetime: 5 minutes (Supabase default; mirrored in providers).
- Resend cooldown: 30s; max 3 resends; then 10-minute lockout per phone.
- Verify attempts: max 5 per code; after that, code is invalidated and user must resend.

## 5. Files

**New**
- `src/pages/auth/OtpVerifyPage.tsx` — OTP entry, timer, resend, change-number.
- `src/components/auth/PhoneInput.tsx` — country code + number, E.164 normalization.
- `src/hooks/useOtpCountdown.ts` — countdown + resend state.
- `src/lib/otpClient.ts` — thin wrapper that calls `otp-send` / `otp-verify` edge functions and falls back to `supabase.auth.signInWithOtp` when provider = supabase.
- `supabase/functions/otp-send/index.ts`
- `supabase/functions/otp-verify/index.ts`

**Edited**
- `src/pages/AuthPage.tsx` — Phone tab uses `PhoneInput`, navigates to `/auth/verify-otp` on send.
- `src/App.tsx` — public route `/auth/verify-otp`.
- `src/lib/rateLimiter.ts` — add `otpSend` and `otpVerify` rules.

**Migration**
- Seed `platform_settings` row `otp_provider = "supabase"` (idempotent upsert).

## Out of scope
- Actual Twilio/MSG91/Firebase secret entry & live testing (provider stays Supabase until user opts in).
- WhatsApp OTP, voice OTP, silent network auth.
- Linking phone to an existing email account (separate flow).
