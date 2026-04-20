

Current state: ShopSidebar exists (Sheet-based, role-aware via useNavigation, closes on route change). Missing from user's spec: dynamic backend-driven menu, nested expandable subcategories, focus trapping, skeleton loaders, global state, ESC handling beyond Sheet defaults.

Sheet already handles: slide-in animation, backdrop, ESC, outside click, focus trap (Radix). So I'll build on it, not replace it.

Key gaps to close:
1. Backend-driven menu (categories from DB, not hardcoded)
2. Nested expandable subcategories (Categories → subcats)
3. Global open state (so any component can open sidebar)
4. Skeleton loaders while fetching
5. Trending section (from analytics/products)
6. Explicit ARIA + active route highlight in items

---

## Production Sidebar Upgrade

Enhance the existing `ShopSidebar` to meet the full spec: backend-driven menu, nested subcategories, global state, skeletons, and a Trending section. Reuses Radix `Sheet` (already gives slide-in, backdrop, ESC, outside-click, focus trap).

### 1. Global State — `SidebarContext`

`src/contexts/SidebarContext.tsx` — exposes `{ isOpen, open(), close(), toggle() }`. Provider mounted in `App.tsx`. Any component (Header, deep links, keyboard shortcut) can control the sidebar.

### 2. Backend-Driven Menu

New edge function `get-sidebar-menu` returns a typed tree:
```ts
{
  trending: Product[],          // top 6 by sales last 7d
  categories: CategoryNode[],   // {id, label, slug, children[]}
  programs: NavItem[],          // Today's Deals, New Arrivals, Best Sellers
}
```
- `categories` pulled from `products.category` distinct + grouped (or new `categories` table if exists)
- Cached server-side 5min, client-side via React Query (`staleTime: 5min`)
- User/role section stays config-driven (`navigation.ts`) — it's auth-state, not content

### 3. Component Structure (per spec)

```
src/components/navigation/
├─ ShopSidebar.tsx            ← SidebarContainer (orchestrator)
├─ SidebarHeader.tsx          ← user greeting + avatar
├─ SidebarSection.tsx         ← already exists, add ARIA
├─ SidebarItem.tsx            ← single nav row, active highlight
├─ ExpandableMenu.tsx         ← nested subcategories (Radix Collapsible)
└─ SidebarSkeleton.tsx        ← loading state
```

### 4. Sections Rendered

| Section | Source | Behavior |
|---|---|---|
| Header | `useAuth` | Greeting + sign-in CTA |
| Trending | API (lazy) | Horizontal scroll of 6 products |
| Categories | API (lazy) | Expandable tree, 2 levels deep |
| Programs & Features | API | Flat list with icons |
| Your Account | config + role | Orders, Wishlist (user) / Dashboard, Add Product (vendor) / Admin Panel (admin) / Sign In (guest) |
| Footer | static | Theme toggle, sign out |

### 5. Role-Based Items

Already handled by `useNavigation` filtering on `roles: ['user'|'vendor'|'admin'|'guest']`. Add the missing items: Wishlist (user), Add Product (vendor), Admin Panel (admin).

### 6. Performance

- React Query: menu fetched once, cached 5min, shared across opens
- Lazy load: query only fires when sidebar opens (`enabled: isOpen`)
- `React.memo` on `SidebarItem` and `ExpandableMenu` (prevents re-render on parent state changes)
- Skeleton during initial fetch (`SidebarSkeleton` — animated bars matching layout)
- Subcategory render is virtualizable later (drop-in `react-window` if categories grow >50)

### 7. Accessibility

- Sheet (Radix) provides: focus trap, ESC, focus return, aria-modal
- Add: `aria-label="Main navigation"` on `<nav>`, `aria-expanded` on ExpandableMenu, `aria-current="page"` on active SidebarItem
- Full keyboard nav: Tab/Shift-Tab cycles items, Enter/Space toggles expand, arrow keys optional (Radix handles for us)

### 8. UX

- Active route: `NavLink` with `activeClassName="bg-muted text-primary font-medium"` + left border accent
- Expand/collapse: Radix `Collapsible` with existing Tailwind `accordion-down/up` animations
- Mobile-first: 320px drawer, 100vh, safe-area padding, larger touch targets (`py-3`)
- Smooth slide-in: Sheet's built-in `data-[state=open]:slide-in-from-left`

### 9. Trigger Points

- Hamburger in `Header.tsx` (already wired) → calls `useSidebar().open()`
- Optional: `Cmd+B` shortcut (added in `App.tsx` keydown listener)

### Files

**Create**
- `src/contexts/SidebarContext.tsx`
- `src/components/navigation/SidebarHeader.tsx`
- `src/components/navigation/SidebarItem.tsx`
- `src/components/navigation/ExpandableMenu.tsx`
- `src/components/navigation/SidebarSkeleton.tsx`
- `src/services/sidebarMenuService.ts`
- `supabase/functions/get-sidebar-menu/index.ts`

**Modify**
- `src/components/navigation/ShopSidebar.tsx` — consume context, fetch menu, render new sections, add Trending + nested categories
- `src/components/navigation/ShopSidebarTrigger.tsx` — use context instead of local state
- `src/components/navigation/SidebarSection.tsx` — add ARIA props
- `src/config/navigation.ts` — add Wishlist, Add Product, Admin Panel
- `src/App.tsx` — wrap in `SidebarProvider`
- `src/components/layout/Header.tsx` — (no change if trigger already mounted)

### Out of scope
- Wishlist feature itself (link only; full feature is separate)
- Replacing dashboard sidebar (that one is correctly persistent, not a drawer)

