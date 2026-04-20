

## Reality check

You already have a production-grade sidebar foundation. Here's what exists vs what's needed:

| Spec requirement | Status | Notes |
|---|---|---|
| Slide-in from left + overlay blur | ✅ | Radix `Sheet` (`side="left"`) — already animated |
| Close on outside click + ESC | ✅ | Built into Radix Sheet |
| Global state | ✅ | `SidebarContext` (Cmd/Ctrl+B too) |
| Backend-driven menu | ✅ | `menu` edge function + `menu_items` table (RLS, role-aware, cached 5min) |
| Role-based filtering | ✅ | Server-side (`role_access[]`) + client (`navigation.ts`) |
| Lazy load | ✅ | React Query, `enabled: isOpen && !authLoading` |
| Skeleton loaders | ✅ | `SidebarSkeleton` |
| Focus trap + ARIA | ✅ | Radix Sheet handles trap; ARIA labels present |
| Component arch (Container/Header/Section/Item/Expandable) | ✅ | All exist |
| Badges (`badge_key`) | ✅ schema | Not rendered in `ExpandableMenu` yet |
| **J&K Essentials section** | ❌ | DB has 4 generic items; needs Essentials + Kashmiri Products + Programs + Help & Support |
| **"Hard to get in J&K" / "Authentic from Kashmir" labels** | ❌ | `badge_key` column unused |
| **"Most Ordered Near You"** | ❌ | Trending exists; nothing pincode-aware |

This is a **content + polish pass**, not a rebuild. Reusing the existing system keeps everything tested and admin-editable.

## Plan

### 1. Seed J&K menu structure (data migration)

Replace the 4 generic items with a curated J&K tree via SQL migration. Five top-level groups, each with children, all `is_active=true`, role-filtered where appropriate, with `badge_key` set for visual labels:

```text
A. Essentials                    badge_key: hard-to-get
   ├─ Electronics
   ├─ Appliances
   ├─ Home Essentials
   └─ Groceries

B. Kashmiri Products             badge_key: authentic-kashmir
   ├─ Handicrafts
   ├─ Pashmina & Clothing
   ├─ Dry Fruits
   ├─ Spices (Saffron)
   └─ Home Decor

C. Trending in J&K
   ├─ Bestsellers in J&K     → /search?sort=popularity
   ├─ New Arrivals           → /search?sort=newest
   └─ Most Ordered Near You  → /search?sort=trending&local=1

D. Programs
   ├─ Become a Vendor        → /vendor/apply   (role_access: guest+user)
   ├─ Vendor Dashboard       → /vendor         (role_access: vendor)
   └─ Local Seller Program   → /vendor/apply?program=local

E. Help & Support
   ├─ Track Order            → /profile?tab=orders
   ├─ Customer Support       → /help
   └─ J&K Delivery Info      → /help#jk-delivery
```

Each child route uses `?category=Electronics` etc. so they hit the existing search page with no new routes.

### 2. Render `badge_key` labels in the menu (`ExpandableMenu.tsx`)

Add a small badge next to group titles when `node.badge_key` is set. Two known keys:
- `hard-to-get` → saffron pill: *"Hard to get in J&K — now available"*
- `authentic-kashmir` → green pill with mountain icon: *"Authentic from Kashmir"*

Centralise the mapping in a tiny `badgeRegistry.ts` so admin can add more later without code changes (unknown keys render as a neutral muted pill with the key humanised).

### 3. Backend overlay polish (`ShopSidebar.tsx`)

Add `bg-background/40 backdrop-blur-sm` to the Sheet overlay via the Sheet's overlay class to satisfy "background overlay (blur + dark)" — currently it's a flat dim. Done by passing a custom overlay through the existing Sheet primitive (already supports `className` on overlay).

### 4. Role-aware "Account" header CTAs already work — just verify

Guest sees *"Sign in"* (already), user/vendor/admin see role-tagged header (already). No change needed; section D handles vendor/admin entry points via `role_access` filtering done by the edge function.

### 5. Cache invalidation after seed

The edge function caches per-instance for 5 min. Migration runs server-side so cold edges will pick up new data. Add a one-shot `cache.clear()`-equivalent by bumping React Query `queryKey` to include a build version — simpler: just rely on the 5min TTL + `staleTime`. No code change needed.

## Out of scope

- New auth, new state library (Zustand/Redux) — current `SidebarContext` + React Query is already production-grade
- A separate Express backend — Supabase edge functions cover the API contract
- "Most Ordered Near You" geo-ranking algorithm (uses existing `trending` sort with a `local=1` flag we can wire later)
- New routes, new pages

## Files

**Create**
- `supabase/migrations/<ts>_seed_jk_menu.sql` — wipe-and-seed J&K tree with `badge_key`s
- `src/lib/badgeRegistry.ts` — `badge_key → { label, tone }` map

**Edit**
- `src/components/navigation/ExpandableMenu.tsx` — render badge from `badge_key` next to title
- `src/components/navigation/SidebarItem.tsx` — accept optional `badgeKey` for leaf items (small inline pill)
- `src/components/ui/sheet.tsx` — add `backdrop-blur-sm` to the overlay (one-line tweak, affects all sheets consistently)

