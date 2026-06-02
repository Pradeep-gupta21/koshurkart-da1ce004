## Goal

Make verification emails reliable and the signup UX honest about what actually happened (new account vs. already-registered).

## 1. Custom verified sender domain (Lovable Emails)

No email domain is currently configured for this workspace, so Supabase auth emails go through the default shared sender (rate-limited, often dropped). To fix delivery, we need to set up a branded sender subdomain.

Step A — user sets up the domain via the in-app dialog:

&nbsp;

Set up email domain
&nbsp;

The user picks a root domain (e.g. `koshurkart.shop`); Lovable provisions `notify.koshurkart.shop` and email queue infrastructure automatically.

Step B (agent, same run, after dialog completes):

- Scaffold branded auth email templates (signup, magic-link, recovery, invite, email-change, reauthentication) under `supabase/functions/_shared/email-templates/` + `supabase/functions/auth-email-hook/`.
- Style templates to match Koshur Kart (Deep Indigo primary, white body background, brand typography, logo from `src/assets` if present).
- Deploy `auth-email-hook`.
- Tell user emails activate automatically once DNS verifies; status visible in Cloud → Emails.

No changes to `handle_new_user`, RLS, or DB schema.

## 2. Frontend signup flow (`src/pages/AuthPage.tsx`)

### 2a. Detect repeated signup

Supabase returns HTTP 200 with `data.user.identities = []` when an email is already registered (no new verification email is sent). Replace the current blanket success toast with:

```ts
const { data, error } = await supabase.auth.signUp({ ... });
const isRepeatedSignup =
  !error && data.user && (data.user.identities?.length ?? 0) === 0;
```

- If `isRepeatedSignup`: show a panel (not just a toast) saying *"This email is already registered."* with two actions:
  - **Sign In** → switches to the Sign In tab and prefills `loginEmail`.
  - **Reset password** → navigates to `/auth/forgot-password?email=…`.
  Also offer a "Resend verification email" button (in case the prior account is still unverified).
- If real new signup: show the success panel described in 2b.
- If `error`: keep current destructive toast.

### 2b. Post-signup panel with Resend button + cooldown

New local state:

- `signupSentEmail: string | null` — set on successful signup; when truthy, replace the signup form with a success panel.
- `resendCooldown: number` — seconds remaining; starts at 60 after signup and after each resend.

Panel content:

- Heading: "Check your inbox"
- Body: *"We've sent a verification link to **{signupSentEmail}**. Click the link to activate your account. Don't forget to check spam/promotions."*
- **Resend verification email** button — disabled while `resendCooldown > 0` or `loading`; label switches to `"Resend in {n}s"` during cooldown.
- Secondary link: *"Use a different email"* → resets the panel state.

Resend handler:

```ts
const { error } = await supabase.auth.resend({
  type: "signup",
  email: signupSentEmail,
  options: { emailRedirectTo: window.location.origin },
});
```

- Success → `toast.success("Verification email resent to {email}")`, restart 60s cooldown, `logAuthEvent("signup_success", { metadata: { resend: true } })`.
- Error → `toast({ variant: "destructive", title: "Couldn't resend", description: error.message })`. Do not restart cooldown on error.
- Apply existing `checkRateLimit` (reuse `RATE_LIMIT_RULES.otpSend` or add a new `resendEmail` rule) for client-side abuse protection.

Cooldown is implemented with a small `useEffect` interval (or reuse `useOtpCountdown`).

### 2c. Misc copy fix

Remove the always-shown "Please check your email" toast in favor of the panel so the message is only displayed when an email actually went out.

## 3. Out of scope

- No DB migrations.
- No changes to phone OTP, Google OAuth, or login flow.
- No Site URL / redirect changes (works via `window.location.origin`; user should still verify Site URL in Cloud → Users after publishing — mentioned in final message, not coded).

## 4. Verification

After step 1 completes and DNS verifies (and step 2 ships):

1. Sign up with a fresh email → success panel shown, verification email arrives from `notify.<domain>`.
2. Click resend within 60s → button disabled with countdown.
3. After 60s → resend works, toast confirms.
4. Sign up again with the same email → repeated-signup panel shown with Sign In / Reset / Resend actions, no misleading "check your email" message.

## Technical notes

- Files touched: `src/pages/AuthPage.tsx` only on the frontend; `supabase/functions/_shared/email-templates/*.tsx` and `supabase/functions/auth-email-hook/` created by scaffold tool.
- `auth-email-hook` is auto-deployed via the tool chain; user does not need to do anything beyond approving the domain dialog.
- If user doesn't have a domain to use, the frontend changes (2a/2b/2c) can still ship — they improve UX even on the default sender — but delivery will remain throttled until a domain is set up.