## Terms & Conditions Page + Signup Consent

### New file
- `src/pages/TermsAndConditionsPage.tsx` — Clean, branded layout (semantic tokens, max-w-3xl prose, sticky table of contents on desktop, mobile responsive). Renders all 12 sections from the spec. Includes "Last updated" date and placeholder support email `support@koshurkart.com`. SEO: `<title>`, meta description, single H1, canonical.

### Route
- `src/App.tsx` — Add `<Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />` (lazy-loaded to match existing pattern).

### Footer link
- `src/components/layout/Footer.tsx` — Add "Terms & Conditions" link in the legal/links column pointing to `/terms-and-conditions`.

### Signup consent checkbox
- `src/pages/AuthPage.tsx` (and/or the signup form component it uses) — Add a required checkbox on the signup tab:  
  *"I agree to the [Terms & Conditions](/terms-and-conditions) and Privacy Policy"*  
  - State: `agreedToTerms` (default false)
  - Submit button disabled until checked
  - Zod schema updated to require `agreedToTerms === true` with message "You must accept the Terms & Conditions to create an account."
  - Login tab unaffected.

### Out of scope
- No new Privacy Policy page (link will point to `/privacy-policy` placeholder or `#` if no page exists — will confirm during build by grepping). No DB column to persist acceptance (can add later if requested).

### Verification
- Visit `/terms-and-conditions` (desktop + mobile viewport), confirm footer link works, confirm signup blocks submission until checkbox ticked.