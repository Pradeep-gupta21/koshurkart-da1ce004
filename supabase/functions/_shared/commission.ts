/**
 * Financial Arithmetic Invariants & Assumptions:
 * - Public APIs accept and return integer paise as JavaScript Number.
 * - Commission percentages are numeric percentages (e.g., 5 means 5%).
 * - Basis points (BASIS_POINTS = 10_000) are an internal implementation detail only.
 * - Intermediate financial calculations use BigInt to guarantee exact arithmetic and prevent overflow.
 */

const DEFAULT_PLATFORM_COMMISSION_PERCENTAGE = 5;
const BASIS_POINTS = 10_000;

function percentageToBasisPoints(percentage: number): number {
  return Math.round(percentage * 100);
}

function validateCommissionPercentage(percentage: number): void {
  if (typeof percentage !== 'number' || Number.isNaN(percentage) || !Number.isFinite(percentage)) {
    throw new Error('Commission percentage must be a finite number.');
  }
  if (percentage < 0 || percentage > 100) {
    throw new Error('Commission percentage must be between 0 and 100.');
  }
  // Enforce maximum precision of two decimal places
  if (Math.round(percentage * 100) / 100 !== percentage) {
    throw new Error('Commission percentage cannot have more than two decimal places.');
  }
}

/**
 * Gets the applicable commission percentage for a vendor.
 * 
 * NOTE: For Phase 2, this implementation is intentionally fixed at 5%.
 * The vendor and order parameters are completely ignored but are retained
 * for future-proofing (e.g., vendor-specific rates, enterprise contracts, 
 * seasonal campaigns) so that the module can become policy-driven in a 
 * later phase without changing the public API.
 * 
 * Commission percentages are numeric percentages (e.g., 5 means 5%).
 * 
 * @param _vendor The vendor object (ignored).
 * @param _order The optional order object (ignored).
 * @returns The commission percentage.
 */
export function getVendorCommissionPercentage(_vendor: unknown, _order?: unknown): number {
  return DEFAULT_PLATFORM_COMMISSION_PERCENTAGE;
}

/**
 * Calculates the vendor's earnings from an order amount after deducting the platform commission.
 * 
 * Public APIs accept and return integer paise as JavaScript Number.
 * Commission percentages are numeric percentages (e.g., 5 means 5%).
 * Intermediate financial calculations use BigInt to guarantee exact arithmetic and prevent overflow.
 * 
 * @param orderAmountPaise The total order amount in paise.
 * @param commissionPercentage The commission percentage to apply.
 * @returns The vendor's earnings in paise.
 */
export function calculateVendorEarnings(orderAmountPaise: number, commissionPercentage: number): number {
  if (!Number.isSafeInteger(orderAmountPaise)) {
    throw new Error('Monetary values must be safe integers.');
  }
  if (orderAmountPaise < 0) {
    throw new Error('Order amount in paise cannot be negative.');
  }

  validateCommissionPercentage(commissionPercentage);

  const commissionBasisPoints = percentageToBasisPoints(commissionPercentage);
  const vendorShareBasisPoints = BASIS_POINTS - commissionBasisPoints;

  const vendorEarningsBigInt = (BigInt(orderAmountPaise) * BigInt(vendorShareBasisPoints)) / BigInt(BASIS_POINTS);

  return Number(vendorEarningsBigInt);
}

/**
 * Calculates the platform commission directly from the order amount and vendor earnings.
 * This guarantees the invariant: vendorEarningsPaise + platformCommissionPaise === orderAmountPaise.
 * 
 * Public APIs accept and return integer paise as JavaScript Number.
 * 
 * @param orderAmountPaise The total order amount in paise.
 * @param vendorEarningsPaise The vendor's earnings in paise.
 * @returns The platform commission in paise.
 */
export function calculatePlatformCommission(orderAmountPaise: number, vendorEarningsPaise: number): number {
  if (!Number.isSafeInteger(orderAmountPaise)) {
    throw new Error('Monetary values must be safe integers.');
  }
  if (orderAmountPaise < 0) {
    throw new Error('Order amount in paise cannot be negative.');
  }
  if (!Number.isSafeInteger(vendorEarningsPaise)) {
    throw new Error('Monetary values must be safe integers.');
  }
  if (vendorEarningsPaise < 0) {
    throw new Error('Vendor earnings in paise cannot be negative.');
  }
  if (vendorEarningsPaise > orderAmountPaise) {
    throw new Error('Vendor earnings cannot exceed the total order amount.');
  }

  // Implementation strictly uses subtraction to guarantee the invariant:
  // vendorEarningsPaise + platformCommissionPaise === orderAmountPaise
  return orderAmountPaise - vendorEarningsPaise;
}
