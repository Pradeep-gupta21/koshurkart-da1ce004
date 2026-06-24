# Plan — Move `koshurkart.shop` to Lovable hosting

## Why
Google sign-in uses Lovable Cloud Managed OAuth (`@lovable.dev/cloud-auth-js`). That helper navigates to `/~oauth/initiate` on the current origin and depends on Lovable's hosting proxy worker to intercept that path and broker the request to `oauth.lovable.app`. Today `koshurkart.shop` is served by Vercel (`vercel.json` rewrites everything to `index.html`), so `/~oauth/initiate` falls through to the SPA, React Router has no matching route, and the app renders NotFound. Putting the domain behind Lovable hosting makes `/~oauth/*` work, and the custom domain is automatically added to the OAuth redirect allowlist — no code changes required.

## Steps you (the user) need to take

1. **Publish the project from Lovable** (if not already on the latest build). The published URL `https://koshurkart.lovable.app` must be live and current.
2. **Remove `koshurkart.shop` from Vercel** so DNS can be repointed without conflict:
   - In Vercel → the project hosting koshurkart.shop → Settings → Domains → remove both `koshurkart.shop` and `www.koshurkart.shop`.
   - Optional: pause/disable the Vercel deployment so it can't accidentally serve traffic.
3. **Connect the domain in Lovable**: Project Settings → Project → Domains → Connect Domain → enter `koshurkart.shop`. Add `www.koshurkart.shop` as a second entry. Pick one as Primary (recommended: `koshurkart.shop`, with `www` redirecting to it).
4. **Update DNS at your registrar** to the records Lovable shows:
   - `A` `@` → `185.158.133.1`
   - `A` `www` → `185.158.133.1`
   - `TXT` `_lovable` → value shown in the Lovable dialog
   - Remove any old A/CNAME records pointing to Vercel (`cname.vercel-dns.com`, `76.76.21.21`, etc.) and any conflicting records for `@` and `www`.
5. **Wait for verification + SSL** in the Lovable Domains panel. Status will move Verifying → Setting up → Active. This typically completes within minutes but can take up to 72 hours depending on DNS propagation.
6. **Verify Google sign-in** on `https://koshurkart.shop` and `https://www.koshurkart.shop`:
   - Click "Continue with Google" → Google account chooser appears (no NotFound page).
   - After consent, you land on `/auth/callback`, then get routed by `AuthCallbackPage` to `/`, `/vendor`, or `/admin` based on role.
   - The buyer-only OAuth restriction still applies: vendor/admin accounts will be signed out and bounced to `/auth?error=oauth_vendor_restricted`.

## What I will do in build mode
Nothing — this is a hosting / DNS change. No source code, edge functions, or Supabase settings need to change. `lovable.auth.signInWithOAuth("google", { redirect_uri: getAuthCallbackUrl() })`, the `/auth/callback` route, and the `AuthCallbackPage` logic are already correct and will work as soon as the domain is served by Lovable's proxy.

## Technical details (for reference)
- OAuth client: `@lovable.dev/cloud-auth-js` via `src/integrations/lovable/index.ts`.
- Call site: `src/pages/AuthPage.tsx:266` → `lovable.auth.signInWithOAuth("google", { redirect_uri: getAuthCallbackUrl() })`.
- Callback URL helper: `src/lib/authConfig.ts` → `${window.location.origin}/auth/callback`.
- App route: `src/App.tsx:107` registers `/auth/callback` → `AuthCallbackPage`.
- Broker paths required on the serving origin: `/~oauth/initiate`, `/~oauth/callback`. These are intercepted by Lovable's proxy worker on `.lovable.app` and on Lovable-connected custom domains. They are NOT intercepted by Vercel; Vercel's `vercel.json` rewrites them to `index.html`, which is why production currently shows NotFound.
- Lovable hosting includes built-in SPA fallback, so existing client-side routes (`/auth/callback`, `/vendor`, `/admin`, etc.) keep working without `vercel.json` or `_redirects`.
- The Supabase Google provider itself is healthy — auth logs show successful `login_method: "oidc", provider: "google"` events from the `.lovable.app` origins. No Supabase/Cloud Auth setting needs to change.

## Rollback
If anything goes wrong with DNS, revert the registrar records to the previous Vercel values. The Lovable domain entry can stay connected (it will go Offline) until DNS is corrected; nothing is destructive on the Lovable side.
