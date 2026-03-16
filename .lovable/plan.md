

## Premium UI Polish — Implementation Plan

### What Exists
- Dark mode CSS variables already defined in `index.css` with `.dark` class
- `darkMode: ["class"]` configured in tailwind.config.ts
- Basic skeleton loaders in ProductGrid and SkeletonLoader components
- Hover animations on product cards (translate-y, scale on images)
- Toast system (both Sonner and shadcn toaster) already wired in App.tsx
- Mobile responsive header with Sheet menu, but some pages lack mobile polish
- SponsoredProductCard has a different visual treatment (orange ring, sparkles badge) vs ProductCard

### Plan

#### 1. Dark Mode Toggle
- Create `src/hooks/useTheme.tsx` — context that reads/writes `localStorage` theme preference, toggles `.dark` class on `<html>`
- Add Sun/Moon toggle button to Header (desktop + mobile menu)

#### 2. Enhanced Animations (tailwind.config.ts + index.css)
- Add `fade-in`, `slide-up`, `scale-in` keyframes to tailwind config
- Add staggered animation utility classes for grid children
- Enhance ProductCard and SponsoredProductCard with `animate-fade-in` on mount via intersection observer or simple CSS

#### 3. Unify Ad Cards with Product Cards
- Refactor `SponsoredProductCard` to share the exact same card structure as `ProductCard` — same padding, typography, price display — just with a subtle "Sponsored" badge and a faint accent border, removing the heavy orange ring
- Use `RatingStars` and `PriceDisplay` components consistently in both cards

#### 4. Empty State Component
- Create `src/components/ui/EmptyState.tsx` — reusable component with icon, title, description, optional CTA button
- Apply to: SearchPage (no results), CartPage (empty cart — already has one but enhance with illustration), ProductDetailPage (no reviews), vendor dashboard pages

#### 5. Better Loading States
- Enhance ProductGrid skeleton with shimmer animation and card-shaped containers matching actual card layout
- Add loading spinners/skeletons to: SearchPage filters, ProductDetailPage (already has skeleton — polish it), vendor/admin dashboard pages

#### 6. Toast Notifications
- Add toast feedback for: add to cart, remove from cart, checkout success, vendor actions
- Use Sonner for consistent positioning (already imported)

#### 7. Mobile Responsive Polish
- HomePage hero: adjust text sizes, button layout for small screens
- ProductDetailPage: stack image/details vertically (already grid md:grid-cols-2), fix quantity selector sizing
- CartPage: improve item cards on small screens
- Footer: ensure proper stacking on mobile
- Admin/Vendor dashboards: ensure sidebar collapses properly

### Files to Create/Modify
- **Create**: `src/hooks/useTheme.tsx` — dark mode context + toggle
- **Create**: `src/components/ui/EmptyState.tsx` — reusable empty state
- **Modify**: `src/components/layout/Header.tsx` — add dark mode toggle
- **Modify**: `tailwind.config.ts` — add animation keyframes
- **Modify**: `src/index.css` — add shimmer animation, stagger utilities
- **Modify**: `src/components/product/ProductCard.tsx` — fade-in animation, toast on add-to-cart
- **Modify**: `src/components/product/SponsoredProductCard.tsx` — unify with ProductCard styling
- **Modify**: `src/components/product/ProductGrid.tsx` — enhanced skeleton with shimmer
- **Modify**: `src/pages/SearchPage.tsx` — use EmptyState component
- **Modify**: `src/pages/CartPage.tsx` — use EmptyState, toast on remove
- **Modify**: `src/pages/ProductDetailPage.tsx` — empty state for reviews, polish loading
- **Modify**: `src/pages/NotFound.tsx` — use EmptyState with illustration
- **Modify**: `src/contexts/CartContext.tsx` — add toast notifications for cart actions

