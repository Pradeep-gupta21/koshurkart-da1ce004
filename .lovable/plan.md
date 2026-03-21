

## Zero-Commission Platform Settings — Implementation Plan

### What Changes
Replace the hardcoded `COMMISSION_RATE = 0.1` in `paymentService.ts` with a centralized config file. Set commission to 0 now, but keep all DB fields and logic so flipping one boolean enables it.

### 1. Create `src/config/platformSettings.ts`

```ts
export const platformSettings = {
  commissionEnabled: false,
  commissionPercentage: 0, // Set to e.g. 10 when enabling
};

export function calculateCommission(amount: number) {
  if (!platformSettings.commissionEnabled) return { commission: 0, vendorEarnings: amount };
  const commission = amount * (platformSettings.commissionPercentage / 100);
  return { commission, vendorEarnings: amount - commission };
}
```

### 2. Update `src/services/paymentService.ts`

- Remove `COMMISSION_RATE` constant
- Import `calculateCommission` and `platformSettings` from the config
- In `createPayment`: use `calculateCommission(amount)` for `platform_commission`, `vendor_earnings`, and `commission_percentage`
- In `getPayoutSummary`: use `platformSettings.commissionPercentage / 100` instead of `COMMISSION_RATE` for the commission calculation

### Files
- **Create**: `src/config/platformSettings.ts`
- **Modify**: `src/services/paymentService.ts`

No database changes — all commission fields remain in the `payments` table for future use.

