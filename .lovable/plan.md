

User asked to test end-to-end via the browser. This requires browser automation tools (act, observe, screenshot) which are unavailable in plan mode.

Plan: switch to default mode and run the browser test sequence.

## Test Plan

1. `navigate_to_sandbox` → preview at `/`
2. `observe` → locate the LocationPill in the header
3. `act` → click the pill to open `LocationDialog`
4. `act` → fill pincode input with `560001`, submit
5. `screenshot` → verify success state (city "Bengaluru" shown, pill updated)
6. Re-open dialog, `act` → fill `999999`, submit
7. `screenshot` → verify "Not serviceable" toast appears, no runtime error
8. `code--read_console_logs` → confirm zero errors
9. Report results; if any failure found in code, stop and surface it before continuing

