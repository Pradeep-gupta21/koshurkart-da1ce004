

User wants browser-based verification of the GPS auto-detect flow. This requires browser automation tools (navigate_to_sandbox, act, screenshot, read_console_logs) which are unavailable in plan mode.

## Important caveat
The browser automation tool **cannot grant or deny real GPS permissions** — Chrome's geolocation prompt is a native browser dialog outside the page DOM, and headless browsers default to denying geolocation unless explicitly configured. So the realistic verification I can perform:

1. **GPS-denied path (default in automation)** — Load preview fresh, observe console for the auto-detect flow, confirm it falls back to `/location/detect` (IP) and the pill shows a city + pincode.
2. **Network confirmation** — Verify the sequence: `reverse-geocode` attempted (or skipped on denial) → `detect` IP fallback fires → `lookup` resolves to a serviceable pincode → pill renders.
3. **Pill state** — Screenshot the header, confirm "Delivering to {City} {PIN}" is visible and not stuck on "Detecting…".

For the **GPS-allowed path**, I'll explain that real-device verification is required (the user must do this manually in their own browser) since automation can't simulate a real geolocation grant accurately.

## Test sequence (after approval)

1. `navigate_to_sandbox` → `/` (fresh session, no localStorage)
2. `read_console_logs` → look for detect flow logs / errors
3. `list_network_requests` → confirm `/location/detect` fired and returned IP-based location
4. `observe` → locate the LocationPill in header
5. `screenshot` → verify pill shows "Delivering to {City} {PIN}"
6. Report findings; explicitly note the GPS-allowed path needs manual verification by the user

If anything is broken (pill stuck on "Detecting…", console error, missing fallback), I'll stop and surface the bug before suggesting a fix.

