

## Platform Security Enhancement — Implementation Plan

### Current State
- Zod validators exist for products, orders, campaigns, reviews, users — but **not enforced** on AuthPage login/signup forms
- Fraud detection exists for ad clicks (`suspicious_clicks` table, `record_analytics_event` function) and abnormal purchases (`detect_abnormal_purchases`)
- No client-side rate limiting
- No dedicated security dashboard — fraud alerts are scattered across AdminOverview
- No input sanitization utility

### Plan

#### 1. Create `src/lib/rateLimiter.ts` — Client-Side Rate Limiter

In-memory sliding-window rate limiter with configurable rules:
- `loginAttempts`: 5 attempts per 15 minutes per email
- `apiCalls`: 60 calls per minute (general)  
- `adClicks`: 3 clicks per campaign per 5 minutes (stricter than DB-level 10/hour)

Functions: `checkRateLimit(key, rule) → { allowed, retryAfterMs }`, `resetLimit(key)`

#### 2. Create `src/lib/sanitize.ts` — Input Sanitization

- `sanitizeText(input)` — strips HTML tags, trims, normalizes whitespace
- `sanitizeEmail(input)` — lowercase + trim
- Used in auth forms, product forms, review forms

#### 3. Update `src/pages/AuthPage.tsx` — Secure Auth Forms

- Validate login/signup with Zod schemas before submission
- Apply rate limiting on login attempts (show countdown on lockout)
- Sanitize inputs before sending to auth
- Show field-level validation errors

#### 4. Create `src/lib/validators/securitySchema.ts`

- `loginSchema` — email + password validation
- `adClickSchema` — campaign_id validation

#### 5. Create `src/pages/admin/AdminSecurity.tsx` — Security Alerts Dashboard

Consolidated view showing:
- Suspicious ad clicks (from `suspicious_clicks` table)
- Abnormal purchase patterns (from `detect_abnormal_purchases()` RPC)
- Failed login rate limit events (client-side log, stored in state)
- Summary cards: total alerts, active threats, resolved

#### 6. Update `src/pages/admin/AdminDashboard.tsx`

- Add "Security" nav item pointing to `/admin/security`

#### 7. Update `src/App.tsx`

- Add `/admin/security` route

#### 8. Update form components to use sanitization

- `src/components/forms/ProductForm.tsx` — sanitize title/description
- `src/components/forms/CheckoutForm.tsx` — sanitize address fields
- Ad click tracking in `adService.ts` — rate limit before RPC call

### Files
- **Create**: `src/lib/rateLimiter.ts`, `src/lib/sanitize.ts`, `src/lib/validators/securitySchema.ts`, `src/pages/admin/AdminSecurity.tsx`
- **Modify**: `src/pages/AuthPage.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/App.tsx`, `src/services/adService.ts`, `src/components/forms/ProductForm.tsx`, `src/components/forms/CheckoutForm.tsx`

No database changes needed — existing `suspicious_clicks` and `detect_abnormal_purchases` already provide the data.

