I’ll fix only authentication redirects, the verification callback, and production branding.

## Plan

1. **Centralize production auth destinations**
   - Keep all auth redirect URLs in `src/lib/authConfig.ts`.
   - Ensure email verification, magic links, Google callback, and any OTP/email auth redirect target use:
     - `https://koshurkart.shop/auth/callback`
   - Ensure password reset uses the production reset route:
     - `https://koshurkart.shop/auth/reset-password`
   - Remove `window.location.origin`, `localhost`, preview, editor, and `lovable.app` redirect usage from auth code.

2. **Harden `/auth/callback` session creation**
   - Update `src/pages/auth/AuthCallbackPage.tsx` so it reliably creates an authenticated session after verification:
     - Exchange `?code=` links with `supabase.auth.exchangeCodeForSession(code)`.
     - Handle token/hash callback links after the auth client stores the session.
     - Verify the session with `supabase.auth.getUser()` before declaring success.
     - Clean sensitive URL params after successful verification.
   - Avoid relying on a race-prone `getSession()` check alone.

3. **Create a professional post-verification success experience**
   - Update the callback success state to display:
     - `Email Verified Successfully`
     - Koshur Kart-only branding.
     - No development or Lovable references.
   - Keep an automatic redirect after a short delay plus a clear `Continue` button.

4. **Redirect verified users to the correct destination**
   - Customer: `/`
   - Vendor with an approved/verified vendor profile: `/vendor`
   - Vendor without completed setup/vendor row: `/vendor/apply`
   - Vendor needing KYC/setup attention: `/vendor/apply/kyc` or `/vendor` where the existing vendor gate shows the right status screen.
   - Admin route behavior remains unchanged only where existing roles already allow it; no role/schema changes.

5. **Remove Lovable branding from production**
   - Hide the published “Edit with Lovable” badge using the project publish setting.
   - Remove preview/editor sample URLs from auth-email code where safe, replacing sample preview values with `https://koshurkart.shop` so auth-related scans no longer surface Lovable URLs.
   - Keep internal package imports if required by the platform, because they are not user-facing redirects.

6. **Audit every auth call site**
   - Search and verify:
     - `emailRedirectTo`
     - `redirectTo`
     - `signUp()`
     - `signInWithOtp()`
     - `resetPasswordForEmail()`
     - OAuth redirect usage
   - Confirm no auth route redirects to `lovable.app`, preview domains, editor domains, localhost, or `window.location.origin`.

7. **Deploy changed auth email function if modified**
   - If `supabase/functions/auth-email-hook/index.ts` changes, deploy `auth-email-hook` so production emails use the updated branding/link behavior.

8. **Final report**
   - List files changed.
   - List previous redirect URLs replaced, including any prior `window.location.origin` and sample Lovable project URLs.
   - List new production redirect URLs.
   - Summarize the final authentication flow after fixes.

## Important production setting to verify

The backend auth URL allowlist must include:

- `https://koshurkart.shop/auth/callback`
- `https://koshurkart.shop/auth/reset-password`

If those are missing, the backend may still rewrite links to its configured site URL before they reach users. I’ll surface this clearly after the code and badge fixes.