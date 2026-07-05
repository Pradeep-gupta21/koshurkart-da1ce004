# Fix Help & Support navigation 404

## Cause
The sidebar's "Customer Service" item links to `/help`, but the Support page is registered at `/support`. Clicking it lands on Page Not Found.

- `src/config/navigation.ts:80` — sidebar item `to: "/help"`
- `src/App.tsx:116` — route `<Route path="/support" element={<SupportPage />} />`
- `src/pages/SupportPage.tsx` — the Support page (unchanged)
- `src/components/layout/Footer.tsx:41` — footer already correctly links to `/support`

## Fix (one-line change)
Update the sidebar nav config so it points at the real route.

**File:** `src/config/navigation.ts` (line 80)

Change:
```ts
{ id: "help", label: "Customer Service", to: "/help", icon: HelpCircle }
```
to:
```ts
{ id: "help", label: "Customer Service", to: "/support", icon: HelpCircle }
```

Nothing else changes — Support page, router, footer link, and design are all untouched.
