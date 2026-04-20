

## Goal
Refine the existing top nav with an Amazon-style structure customized for J&K — premium glassmorphism, Kashmiri search placeholder, mountain motif, and J&K-flavored category strip. No structural rewrite; tighten what's there.

## Changes

### 1. `Header.tsx` — premium polish
- **Glass top bar**: Navy at `90%` opacity + `backdrop-blur-md` + soft saffron-tinted bottom shadow (`shadow-[0_1px_0_hsl(var(--accent)/0.15)]`).
- **Logo**: Add a tiny inline mountain SVG (3 triangles) next to the "K" badge for regional identity. Keep serif "Kashmir Bazaar" wordmark.
- **Main bar**: `bg-background/80 backdrop-blur-md` with a subtle wood-tinted shadow on scroll feel (always-on soft shadow `shadow-sm`).
- **Action buttons** (Account / Cart / Theme): wrap each in a subtle hover treatment — `hover:bg-accent/10 hover:text-accent transition-all duration-200 hover:-translate-y-0.5`. Cart badge gets a soft saffron glow (`shadow-[0_0_8px_hsl(var(--accent)/0.5)]`).
- **Account dropdown**: Replace the bare `User` icon link with a dropdown showing "Hello, Sign in" / "Account & Orders" / "Profile" / "Wishlist" — Amazon-style two-line label on `md+`.
- **Category bar**: Replace generic categories with **J&K-local set**: Pashmina · Saffron · Dry Fruits · Walnut Wood · Papier-mâché · Kahwa · Handicrafts · Carpets. First item ("All") opens the existing ShopSidebar. Add a leading `Mountain` lucide icon as a subtle local marker.

### 2. `LocationPill.tsx` — clearer J&K copy
- Two-line layout already exists. When pincode resolves to J&K (state === "Jammu and Kashmir" or city in {Srinagar, Jammu, ...}), show **"Delivering to {City}"** in saffron; otherwise keep current behavior.
- Add chevron-down indicator and `hover:bg-primary-foreground/15` for affordance.
- Show on mobile too (currently `hidden md:flex`) — compact variant with just icon + city.

### 3. `SearchBar.tsx` — J&K placeholder + premium shell
- Placeholder: `"Search for Pashmina, Dry Fruits, Handicrafts…"`
- Wrap input in a premium shell: `rounded-full` (or keep `rounded-md` to match radius), `ring-1 ring-wood/30 focus-within:ring-2 focus-within:ring-accent shadow-sm hover:shadow-md transition-shadow`.
- Add a saffron **Search button** appended on the right (Amazon-style) that submits the query: `bg-accent text-accent-foreground rounded-r-md px-4`.
- Dropdown: `backdrop-blur-md bg-popover/95` for glass feel.

### 4. Mobile responsiveness
- `< sm`: Hide wordmark (keep K badge), hide top utility row (currency stays in profile menu later — out of scope), search shrinks to full width on a second row.
- `sm–md`: Keep current single-row, hide category bar.
- `lg+`: Full layout with category bar.
- LocationPill mobile variant: compact icon + city only.

## Out of scope
- Language toggle (project uses currency toggle; adding i18n is a separate feature)
- Wishlist page (would require new route)
- Restructuring search service or ShopSidebar
- Animated hero, re-skinning other pages

## Files

**Edit**
- `src/components/layout/Header.tsx` — glass effect, mountain logo mark, account dropdown, J&K category list, hover polish
- `src/components/location/LocationPill.tsx` — J&K-aware copy, mobile variant, chevron
- `src/components/search/SearchBar.tsx` — Kashmiri placeholder, saffron submit button, glass dropdown, focus ring

