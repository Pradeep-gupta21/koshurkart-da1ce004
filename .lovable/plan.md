

## Admin Settings Page for Commission Configuration

### Overview
Create an admin settings page that stores commission configuration in a new `platform_settings` database table (instead of the current in-memory config). The payment service will read settings from the DB at payment time, so toggling commission takes effect immediately without redeployment.

### 1. Database Migration

Create a `platform_settings` table to persist configuration:
```sql
CREATE TABLE platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- Anyone can read settings
CREATE POLICY "Anyone can read settings" ON platform_settings FOR SELECT TO public USING (true);
-- Only admins can update
CREATE POLICY "Admin manages settings" ON platform_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

Seed default commission settings:
```sql
INSERT INTO platform_settings (key, value) VALUES
  ('commission', '{"enabled": false, "percentage": 0}'::jsonb);
```

### 2. Create `src/pages/admin/AdminSettings.tsx`

Admin settings page with:
- **Commission toggle** (Switch component) — enables/disables platform commission
- **Commission percentage** (number Input, 0-50 range) — sets the percentage
- **Save button** — updates the `platform_settings` row
- **Info text**: "When enabled, the platform will deduct the configured percentage from each payment as commission. Vendors will receive the remaining amount."
- Shows current merchant UPI ID (read-only for now)

### 3. Update `src/config/platformSettings.ts`

Add an async function `fetchPlatformSettings()` that reads from `platform_settings` table and returns the commission config. The static `platformSettings` object remains as fallback defaults.

Update `calculateCommission()` to accept an optional settings parameter (for when settings are fetched from DB).

### 4. Update `src/services/paymentService.ts`

In `createPayment()`: fetch commission settings from DB via `fetchPlatformSettings()` before calculating commission, so it uses the live admin-configured values.

### 5. Update `AdminDashboard.tsx` — Add nav item

Add "Settings" with a Settings/Cog icon to the sidebar nav.

### 6. Update `App.tsx` — Add route

Add `/admin/settings` route.

### Files
- **Migration**: Create `platform_settings` table with seed data
- **Create**: `src/pages/admin/AdminSettings.tsx`
- **Modify**: `src/config/platformSettings.ts` — add DB fetch function
- **Modify**: `src/services/paymentService.ts` — use live settings from DB
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — add Settings nav item
- **Modify**: `src/App.tsx` — add route

