

## Goal
Re-skin the existing eCommerce app with a J&K-inspired identity (Deep Navy / Snow / Saffron / Soft Green / Walnut Brown) and a serif-headings + sans-body typography system. Keep all existing features and Amazon-like structure intact — purely a design system pass plus a few high-impact surface refinements.

## Approach
Update the design tokens at the root (`index.css` + `tailwind.config.ts`) so every component re-themes automatically. Then refine the most-seen surfaces (Header, Hero, ProductCard, Footer) with subtle Kashmiri visual cues. No layout restructure — that would break tested flows (cart, checkout, location, ads).

## Changes

### 1. Design tokens (`src/index.css`)
- Light mode:
  - `--background`: Snow White `#F8FAFC`
  - `--foreground` / `--primary`: Deep Navy `#0F172A`
  - `--accent` / `--warning`: Saffron `#F59E0B`
  - `--success`: Soft Green `#4ADE80`
  - New: `--wood: 27 39% 39%` (Walnut `#8B5E3C`) for borders/dividers
  - `--radius`: bump to `0.75rem` for premium softness
- Dark mode: invert to navy-dominant with saffron accent retained
- Sidebar tokens recoloured to match navy/snow

### 2. Typography (`tailwind.config.ts` + `index.html`)
- Add Google Fonts: **Fraunces** (serif headings) + **Inter** (body, already in use)
- Tailwind `fontFamily`: `serif: ['Fraunces', ...]`, `sans: ['Inter', ...]`
- Global rule in `index.css`: `h1, h2, h3, h4 { @apply font-serif tracking-tight; }`

### 3. Header polish (`src/components/layout/Header.tsx`)
- Navy background, snow text, saffron hover/active accent
- Subtle 1px walnut-tinted bottom border
- Logo wordmark in serif

### 4. Hero / Homepage top (`src/pages/HomePage.tsx`)
- Replace any generic gradient with a navy → deep-navy gradient + faint saffron radial glow (evoking Dal Lake at dusk)
- Serif headline, snow body, saffron CTA

### 5. ProductCard (`src/components/product/ProductCard.tsx`)
- Card border: walnut at 15% opacity
- Price in navy, discount badge in saffron, "Deliverable" badge in soft green
- Hover: lift + saffron ring

### 6. Footer (`src/components/layout/Footer.tsx`)
- Navy background, snow text, walnut divider, saffron link hover

### 7. Subtle Kashmiri motif
- Add one reusable SVG pattern (paisley-inspired, very low opacity) as an optional `bg-paisley` utility — used only on hero + auth page backgrounds. Tokenized so it's easy to remove.

## Out of scope
- No changes to cart/checkout/location/admin/vendor logic
- No new pages or features
- No image/asset replacements (user can swap hero imagery later)
- No restructuring of navigation or product grid

## Files

**Edit**
- `src/index.css` — token overhaul, serif heading rule, paisley utility
- `tailwind.config.ts` — add `serif` family + `wood` color
- `index.html` — Fraunces font link
- `src/components/layout/Header.tsx` — navy/saffron polish
- `src/components/layout/Footer.tsx` — navy/walnut polish
- `src/pages/HomePage.tsx` — hero gradient + serif headline
- `src/components/product/ProductCard.tsx` — walnut border, saffron accents

**Create**
- `src/assets/paisley-pattern.svg` — single low-opacity motif

