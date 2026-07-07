## Audit findings

1. **Static navigation works correctly**
   - `src/config/navigation.ts` → section `help` (label "Help & Settings") contains item `Customer Service` → `/support`.
   - `src/App.tsx` registers `<Route path="/support" element={<SupportPage />} />`.
   - `Footer.tsx` also links to `/support`.

2. **Duplicate dynamic menu causes the 404**
   - The `menu_items` table contains an admin-managed dynamic sidebar branch under section `shop`:
     - `Help & Support` (parent, no route)
       - `Customer Support` → `/help` (404 — no `/help` route exists)
       - `J&K Delivery Info` → `/help#jk-delivery` (also 404 — base path `/help` is missing)
   - `ShopSidebar.tsx` renders both the dynamic admin-managed tree (`ExpandableMenu`) and the static `help` section, so two support-looking sections appear.

3. **No `/help` route is registered**
   - `src/App.tsx` has no `/help` path, only `/support` and the `*` catch-all (`NotFound`).

## Root cause

The "Customer Support" item is an outdated duplicate of the existing "Customer Service" item. It points to a route that was never registered.

## Fix plan

Delete the entire dynamic `Help & Support` branch from `menu_items` so only the static, working `Customer Service` → `/support` entry remains.

1. Delete the parent row `8056c540-8850-4b27-9a6f-29ab3f0a57ad` (`Help & Support`).
2. Delete the child rows:
   - `509eaf50-646e-427a-97ba-b1bf49f75bce` (`Customer Support` → `/help`)
   - `0c23e6c1-51ef-4fd1-b4a6-25e777ab2cac` (`J&K Delivery Info` → `/help#jk-delivery`)

## What will NOT change

- `src/config/navigation.ts` (static "Customer Service" stays as-is)
- `src/App.tsx` (no new or duplicate routes)
- `src/pages/SupportPage.tsx` (Support page untouched)
- `src/components/layout/Footer.tsx` (footer link unchanged)
- Any sidebar component code (no redesign)

## Verification

After the migration, open the shop sidebar and confirm:
- Only one support link exists: "Customer Service" under "Help & Settings".
- Clicking it navigates to `/support` and renders the existing Support page.
- No "Help & Support" / "Customer Support" / "J&K Delivery Info" dynamic section appears.