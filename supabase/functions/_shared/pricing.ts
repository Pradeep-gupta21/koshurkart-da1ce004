// Single source of truth for converting priced lines into the exact
// rupee subtotal AND the exact paise integer sent to payment gateways.
// Used by both `quote-checkout` and `create-checkout` so the two paths
// can never drift.

export interface PricingLineInput {
  product_id: string;
  quantity: number;
  unit_price: number; // rupees, server-derived (discount > dynamic > base)
}

export interface PricingLineBreakdown {
  product_id: string;
  unit_price: number;
  quantity: number;
  line_total: number; // rupees, rounded 2dp
}

export interface PricingResult {
  subtotal_inr: number; // rupees, rounded 2dp
  amount_paise: number; // integer paise = round(subtotal_inr * 100)
  line_breakdown: PricingLineBreakdown[];
}

/** Round a rupee value to 2 decimal places using paise integers (no float drift). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the rupee subtotal AND the gateway-bound paise amount in lockstep.
 * Both values are derived from the same intermediate paise integer so that
 * `Math.round(subtotal_inr * 100) === amount_paise` is guaranteed by construction.
 */
export function calculateOrderAmount(lines: PricingLineInput[]): PricingResult {
  let totalPaise = 0;
  const line_breakdown: PricingLineBreakdown[] = [];

  for (const ln of lines) {
    // line_total in paise — single integer rounding per line, no float accumulation.
    const linePaise = Math.round(ln.unit_price * ln.quantity * 100);
    totalPaise += linePaise;
    line_breakdown.push({
      product_id: ln.product_id,
      unit_price: round2(ln.unit_price),
      quantity: ln.quantity,
      line_total: linePaise / 100,
    });
  }

  return {
    subtotal_inr: totalPaise / 100,
    amount_paise: totalPaise,
    line_breakdown,
  };
}

/**
 * Hard equality check used at the gateway boundary. Returns null on success,
 * or an object describing the drift on failure.
 */
export function assertAmountConsistency(
  subtotal_inr: number,
  amount_paise: number,
): { expected_paise: number; actual_paise: number; drift_paise: number } | null {
  const expected = Math.round(subtotal_inr * 100);
  if (expected !== amount_paise) {
    return {
      expected_paise: expected,
      actual_paise: amount_paise,
      drift_paise: amount_paise - expected,
    };
  }
  return null;
}

export interface CommissionSplit {
  platformCommissionPaise: number; // integer paise retained by the platform
  vendorSharePaise: number; // integer paise owed to the vendor
  commissionPct: number; // effective percent actually applied (0 when exempt)
}

/**
 * Single source of truth for the commission split. Given a vendor's line
 * subtotal in integer paise, split it into the platform's commission and the
 * vendor's payout using the same paise-based integer math as the rest of this
 * file — the DB-recorded commission and the Razorpay Route transfer amount both
 * flow through here so they can never drift.
 *
 * `commissionPct` is a whole-percent value (e.g. 5 for 5%), matching the shape
 * stored in `platform_settings.commission.percentage`. When `isExempt` is true
 * the commission is forced to 0 and the vendor receives 100%.
 *
 * The vendor share is floored to the paise so that any sub-paise rounding
 * remainder accrues to the platform commission, never the vendor. By
 * construction `platformCommissionPaise + vendorSharePaise === lineAmountPaise`
 * exactly (no rounding leakage).
 */
export function calculateCommissionSplit(
  lineAmountPaise: number,
  commissionPct: number,
  isExempt: boolean,
): CommissionSplit {
  const effectivePct = isExempt ? 0 : commissionPct;
  // Floor the vendor share; the platform absorbs whatever paise remain so the
  // two parts always reconstruct lineAmountPaise exactly.
  const vendorSharePaise = Math.floor((lineAmountPaise * (100 - effectivePct)) / 100);
  const platformCommissionPaise = lineAmountPaise - vendorSharePaise;
  return { platformCommissionPaise, vendorSharePaise, commissionPct: effectivePct };
}

/**
 * The exact paise a vendor should receive via a Razorpay Route transfer for a
 * given line subtotal. Thin wrapper that delegates to calculateCommissionSplit()
 * so the transfer amount is arithmetically identical to the vendor share that is
 * recorded on the payment row — never a parallel calculation.
 */
export function calculateVendorTransferAmount(
  lineAmountPaise: number,
  commissionPct: number,
  isExempt: boolean,
): number {
  return calculateCommissionSplit(lineAmountPaise, commissionPct, isExempt).vendorSharePaise;
}

/**
 * Single decision point for "what commission percentage does THIS vendor pay?".
 * Returns a whole-percent value (e.g. 5 for 5%) suitable for passing straight
 * into calculateCommissionSplit() / calculateVendorTransferAmount().
 *
 * Today the answer is simply: exempt vendors pay 0%, everyone else pays the
 * platform's configured rate (0 when commission is disabled). This function is
 * deliberately the ONLY place that rate is decided — it is the extension point
 * where tiered/vendor-specific commission logic will be injected later (vendor
 * tier lookups, bulk-order discounts, contract-specific rates, promo periods,
 * etc.). Add such rules HERE so every caller — the recorded payment split and
 * the Razorpay Route transfer alike — stays in lockstep automatically.
 */
export function getVendorCommissionPercentage(
  vendor: { is_commission_exempt: boolean; id: string },
  platformSettings: { commission: { enabled: boolean; percentage: number } },
): number {
  // If this vendor has a commission exemption, they pay 0%.
  if (vendor.is_commission_exempt) return 0;

  // Otherwise, use the platform's configured commission.
  // (In the future, this is where vendor tier lookups, bulk discounts,
  // contract-specific rates, or other business rules will be injected.
  // Keep this function as the single point of decision for "what % does vendor X pay?")
  if (platformSettings.commission.enabled && platformSettings.commission.percentage > 0) {
    return platformSettings.commission.percentage;
  }
  return 0;
}
