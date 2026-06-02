## Privacy Policy Page for Koshur Kart

Create a new route `/privacy-policy` with a polished, fully-responsive Privacy Policy page that matches the existing legal pages (Terms, Refund/Return) in tone, layout, and design tokens.

### Files

1. **New: `src/pages/PrivacyPolicyPage.tsx`**
   - Same shell pattern as `TermsAndConditionsPage` / `RefundReturnPolicyPage` (container, serif headings, accent dividers, card sections).
   - Uses semantic tokens (`bg-background`, `text-foreground`, `text-accent`, `border-wood`) — no hard-coded colors.
   - `react-helmet-async` (already wired) for SEO: title, meta description, canonical, og:*, JSON-LD `WebPage`/`PrivacyPolicy`.
   - Accessible: single `<h1>`, semantic `<section>` + `<h2>` per section, `aria-labelledby`, skip-friendly anchors, sufficient contrast.
   - Lucide icons next to each section heading (Shield, Database, UserCog, Store, CreditCard, Cookie, Lock, ScrollText, Plug, Baby, Archive, Globe, RefreshCw, Mail).
   - Sticky in-page Table of Contents on `lg+`, collapsible on mobile.
   - "Last Updated: June 2, 2026" badge at the top.
   - Mailto links for `support@koshurkart.shop` and `koshurkartofficial@gmail.com`.

2. **Edit: `src/App.tsx`**
   - Lazy-load `PrivacyPolicyPage` and add public route `/privacy-policy`.

3. **Edit: `src/components/layout/Footer.tsx`**
   - Add "Privacy Policy" link in the Support column, next to Terms and Refunds.

4. **Edit: `src/config/navigation.ts`**
   - Add a "Privacy Policy" item to the shopper sidebar's "Help & Settings" section so it appears in the sidebar nav as well.

### Content sections (all 14, India-compliant tone)

Introduction · Information We Collect (account, browsing, device, location, transactional) · How We Use Information · Seller/Vendor Information (KYC, GSTIN, payouts) · Payment Information (Razorpay + secure partners, no card storage) · Cookies & Tracking Technologies · Data Security (encryption-in-transit, RLS, access controls) · User Rights (access, correction, deletion, grievance officer) · Third-Party Services (payment, logistics, analytics) · Children's Privacy (under 18 not permitted) · Data Retention · International Data Transfers · Changes to This Policy · Contact Information (both emails + India jurisdiction note).

Explicit statements included: "We never sell customer data to third parties" and India IT Act 2000 / DPDP Act 2023 compliance language.

### Technical notes

- No business-logic or DB changes — pure presentation.
- No new dependencies.
- Page is statically rendered content; no data fetching.
- Reuses existing typography (`font-serif` for headings) and color tokens to stay consistent with Terms/Refund pages.
