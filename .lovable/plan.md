

Quick scope check — `locationService` already has `listUserLocations`, `addUserLocation`, `setDefault`, `deleteUserLocation`. `LocationContext` exposes `savedLocations` + `refreshSavedLocations`. DB has `user_locations` with proper RLS + `enforce_single_default_location` trigger. So this is purely a Profile page UI addition.

Let me check the Profile page structure.
<lov-tool-use id="toolu_vrtx_01MD52czF8eC2pmeFb1Ey1cL" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/ProfilePage.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013nAr2eZcahM5xiGV693q2g" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/ProfilePage.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_017gxQnrv9VrBAzHwVePBxwq" name="code--view" integration-id="code" data="{\"file_path\": \"src/contexts/LocationContext.tsx\"}">
</lov-tool-use>
<lov-plan>

## Saved Addresses on Profile Page

Add a new card section between Notifications and Order History on `ProfilePage.tsx` for managing saved addresses.

### Backend status (already in place)
- `user_locations` table with full RLS (users CRUD own) ✓
- `enforce_single_default_location` trigger ensures only one default ✓
- `locationService` already exposes `listUserLocations`, `addUserLocation`, `setDefault`, `deleteUserLocation` ✓
- `LocationContext` already exposes `savedLocations` + `refreshSaved` ✓

So this is purely a UI addition — no DB or service changes needed.

### New component: `src/components/location/SavedAddresses.tsx`

A self-contained card consuming `useLocation()`:

- **List view**: each address shows label (Home/Office/Custom), city + pincode, state, "Default" badge if default
- **Per-row actions**:
  - "Set as default" button (hidden if already default) → `locationService.setDefault(id)` → `refreshSaved()`
  - Delete icon button with confirm dialog → `locationService.deleteUserLocation(id)` → `refreshSaved()`
  - Inline label edit (small pencil icon → swaps to input → saves via direct supabase update; falls back to `Home`/`Office`/`Other` quick chips)
- **Add new address**: button opens existing `LocationDialog` (pincode tab). On success the context already adds to saved list → just `refreshSaved()`.
- **Empty state**: icon + "No saved addresses yet" + "Add address" CTA
- **Toasts** via sonner for success/error on each action

### Service tweak
Add `updateUserLocation(id, { label })` to `locationService.ts` (one new method, ~5 lines) since label edit isn't covered yet.

### Modify
- `src/pages/ProfilePage.tsx` — import + render `<SavedAddresses />` between Notifications card and Order History card, with `<MapPin />` icon header
- `src/services/locationService.ts` — add `updateUserLocation`

### Out of scope
- Editing pincode/city of an existing address (delete + re-add is simpler and avoids re-validating serviceability)
- Address autocomplete from Google Maps (not in current stack)
- Reordering addresses (default flag is sufficient ordering signal)

