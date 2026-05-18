# Rebrand: Kashmir Bazaar → Koshur Kart

Scope: brand name only. Regional "Kashmir" references (badges, copy about the valley, KashmirCategories component, "Sell on Kashmir" link, file names, region utils) stay as-is per your choice.

## Files to update

1. **`index.html`** — replace placeholder Lovable meta with real branding:
   - `<title>` → `Koshur Kart — Authentic crafts from Kashmir`
   - `<meta name="description">` → short premium tagline (Pashmina, saffron, walnut wood from verified Kashmiri artisans)
   - `<meta name="author">` → `Koshur Kart`
   - `og:title`, `og:description` → match above
   - Drop `og:image` (current value is a Lovable placeholder; better to omit until we have a real asset — per head-meta guidance)
   - Add `<link rel="canonical" href="/" />`
   - Add Organization JSON-LD with `name: "Koshur Kart"`

2. **`src/components/layout/Header.tsx`** (line 91)
   - Logo wordmark: `Kashmir Bazaar` → `Koshur Kart` (keep the two-tone styling: `Koshur <span class="text-accent">Kart</span>`)
   - The `K` logo monogram stays (still works).

3. **`src/components/layout/Footer.tsx`** (lines 13, 47)
   - Logo wordmark same treatment as header
   - Copyright: `© 2026 Koshur Kart. Crafted in the valley.`

4. **`src/components/home/StorySection.tsx`** (line 18)
   - `Every product on Kashmir Bazaar carries…` → `Every product on Koshur Kart carries…`

5. **`src/pages/HomePage.tsx`** (line 91)
   - Hero image `alt` → `Koshur Kart — crafts from the valley`

## Out of scope (intentionally untouched)

- "Sell on Kashmir" header link, "Discover Kashmir's…" hero, From-Kashmir badges, KashmirCategories component, regionUtils, vendor onboarding region copy, docs/VENDOR_API.md region examples, and all file/component names — these are regional, not brand.
- `package.json` `name` field, supabase project id, edge functions — these are internal identifiers, not user-facing branding.
- Admin/Vendor dashboards, AuthPage, notifications, invoices — checked, they don't carry a hardcoded "Kashmir Bazaar" string today, so they automatically reflect the new brand via Header/Footer/meta.
- Email templates — none currently scaffolded in the project; nothing to rename. (If you want branded auth emails later, that's a separate setup.)

## Verification after implementation

- Grep `Kashmir Bazaar` returns zero matches.
- Browser tab title shows "Koshur Kart …".
- Header + Footer wordmark reads "Koshur Kart".

Approve and I'll apply the edits.
