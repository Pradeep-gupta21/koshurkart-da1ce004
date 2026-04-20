

The user wants an "Amazon-style" sidebar navigation system. Important context:

1. This project is **React + Vite + Tailwind + Supabase (Lovable Cloud)** — NOT Next.js, NOT Express, NOT MongoDB, NOT Zustand/Redux. I cannot change the stack. I'll adapt the request to the existing stack.
2. The project already has shadcn `sidebar.tsx`, role-based auth (`useAuth` with user/vendor/admin), and admin/vendor sub-routes that currently use top tabs.
3. Amazon's sidebar = hamburger-triggered off-canvas drawer with categories, account links, and "Shop by Department" sections — different from a persistent admin sidebar.

I'll propose **two complementary sidebars** since the project has two surfaces:
- **Public/shopper sidebar**: off-canvas Amazon-style drawer triggered from the header (categories, account, sell, help)
- **Dashboard sidebar**: persistent collapsible sidebar replacing the current top-tab nav in admin/vendor dashboards

Both role-aware, both backed by a single config source, both responsive.

Let me check current header & dashboards briefly to scope accurately.

---

## Production-Ready Sidebar Navigation System

Adapted to this project's stack (React + Vite + Tailwind + shadcn + Supabase). Two coordinated sidebars, both role-aware, sharing one config source.

### 1. Architecture

```text
src/
├─ config/navigation.ts          ← single source of truth
├─ hooks/useNavigation.ts        ← filters items by role + counts (badges)
├─ components/navigation/
│   ├─ ShopSidebar.tsx           ← Amazon-style off-canvas drawer
│   ├─ ShopSidebarTrigger.tsx    ← hamburger in Header
│   ├─ DashboardSidebar.tsx      ← persistent collapsible (admin/vendor)
│   └─ SidebarSection.tsx        ← reusable group with collapse
└─ components/layout/
    └─ DashboardLayout.tsx       ← wraps admin/vendor pages with SidebarProvider
```

### 2. Single Navigation Config (`config/navigation.ts`)

Typed tree consumed by both sidebars. Each item: `{ id, label, to, icon, roles?, children?, badgeKey? }`. Role gating happens here, not in components — easy to scale to hundreds of items.

```text
shopper nav:
  - Shop by Department (Electronics, Fashion, Home, …) ← from categories table
  - Today's Deals
  - Sponsored / Trending
  - Your Account → Orders, Reviews, Profile
  - Sell on Platform → /vendor/apply or /vendor (role-aware)
  - Help & Settings

dashboard nav (admin):
  - Overview, Vendors, Reviews, Payments, Payouts,
    Campaigns, Placements, Pricing, Settings, Security

dashboard nav (vendor):
  - Overview, Products, Orders, Campaigns, Analytics,
    Payments, Notifications
```

### 3. Shop Sidebar (Amazon-style)

- Off-canvas drawer using existing shadcn `Sheet` (left side, full-height, 320px).
- Header: "Hello, {name}" or "Hello, sign in", avatar.
- Sections with collapsible `SidebarSection` (chevron, smooth animation).
- "Shop by Department" pulls live categories from Supabase (cached 5min via existing `cacheService`).
- Footer: theme toggle, currency switcher (already in app), sign out.
- Triggered from a hamburger button added to `Header.tsx` (left of logo on mobile, hidden on desktop or icon-only).
- Closes on route change, swipe, ESC, backdrop click.

### 4. Dashboard Sidebar (persistent, scalable)

- Replaces current top-tab nav in `AdminDashboard.tsx` and `VendorDashboard.tsx`.
- Built on existing shadcn `sidebar.tsx` with `collapsible="icon"` (Amazon-internal style: full labels → icon-only mini rail).
- `SidebarTrigger` in dashboard header — always visible.
- Active route highlighting via `NavLink` (already in project).
- Live badges (e.g. pending vendors, new orders, unread notifications) via `useNavigation` hook polling small count queries with React Query.
- Search input at top filters menu items client-side (handles 50+ items gracefully).
- Persists collapsed state to `localStorage`.
- Mobile (`<768px`): becomes off-canvas via shadcn's built-in responsive behavior.

### 5. Role-Based Access (already aligned with project)

- Uses existing `useAuth()` (`roles`, `isAdmin`, `isVendor`).
- `useNavigation()` filters config tree by `roles` array per item.
- Items with no `roles` = public. Items with `roles: ['admin']` = admin only.
- Defense in depth: `RoleRoute` guards routes (already exists) — sidebar just hides what user can't access.

### 6. Performance & Scalability

- Config-driven: adding nav items = one line, no component changes.
- Memoized filter (`useMemo` keyed on roles).
- Code-split badge count queries (React Query, 30s stale time).
- Lazy-loaded category list inside drawer (only fetched when opened).
- Virtualized list ready (current scale doesn't need it; structure supports drop-in `react-window` later).
- Zero new dependencies — everything uses existing shadcn + React Query + Supabase.

### 7. Responsive Behavior

| Viewport | Shop Sidebar | Dashboard Sidebar |
|---|---|---|
| Mobile (<768px) | Off-canvas, full-height drawer | Off-canvas (auto by shadcn) |
| Tablet (768–1024) | Off-canvas | Mini rail (icons), expand on hover |
| Desktop (>1024) | Off-canvas (Amazon does same) | Persistent expanded, toggle to mini |

### 8. Files

**Create**
- `src/config/navigation.ts`
- `src/hooks/useNavigation.ts`
- `src/components/navigation/ShopSidebar.tsx`
- `src/components/navigation/ShopSidebarTrigger.tsx`
- `src/components/navigation/DashboardSidebar.tsx`
- `src/components/navigation/SidebarSection.tsx`
- `src/components/layout/DashboardLayout.tsx`

**Modify**
- `src/components/layout/Header.tsx` — add hamburger + mount `ShopSidebar`
- `src/pages/admin/AdminDashboard.tsx` — wrap in `DashboardLayout`, remove top tabs
- `src/pages/vendor/VendorDashboard.tsx` — same

### 9. Stack Note

Your request mentioned Next.js / Express / MongoDB / Zustand. This project is **React + Vite + Supabase (Lovable Cloud)** and cannot change frameworks. The plan delivers the same outcome — role-based, scalable, production-ready sidebar — using the existing stack. Auth, DB, and state are already handled by `useAuth` + Supabase RLS + React Query, which is the production equivalent.

### Out of scope
- Replacing React Query with Zustand/Redux (current setup is already production-grade)
- Server-rendered nav (Vite SPA — nav config is static + cached queries)

