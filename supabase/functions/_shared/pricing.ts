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
