/**
 * Dev-only pricing audit panel. Renders ONLY when:
 *   1. The app is running in dev mode (`import.meta.env.DEV`)
 *   2. The server response includes a `debug` block (gated by the
 *      `DEBUG_PRICING` Edge Function env var)
 *
 * This is a temporary diagnostic surface for verifying that the price shown
 * in the UI === the rupee total === the paise integer sent to Razorpay/UPI.
 * Safe to leave in code; producing the `debug` payload requires the server
 * env var to be enabled. Remove the file (and references) for permanent cleanup.
 */
export interface PricingDebugLine {
  product_id: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface PricingDebug {
  lines: PricingDebugLine[];
  calculatedAmountInr: number;
  razorpayAmountPaise: number;
  mode?: "test" | "live";
}

interface Props {
  debug?: PricingDebug | null;
  label?: string;
}

export function PricingDebugBox({ debug, label = "Pricing debug (dev only)" }: Props) {
  if (!debug) return null;
  if (!import.meta.env.DEV) return null;

  return (
    <div className="my-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 p-3 text-xs font-mono">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-muted-foreground">{label}</span>
        {debug.mode && (
          <span className="rounded bg-background px-1.5 py-0.5 uppercase tracking-wide">
            {debug.mode}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {debug.lines.map((l) => (
          <div key={l.product_id} className="flex justify-between gap-2">
            <span className="truncate text-muted-foreground">
              {l.product_id.slice(0, 8)} · ₹{l.unit_price.toFixed(2)} × {l.quantity}
            </span>
            <span>= ₹{l.line_total.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-muted-foreground/20 pt-2 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Calculated total (INR)</span>
          <span>₹{debug.calculatedAmountInr.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Gateway amount (paise)</span>
          <span>{debug.razorpayAmountPaise}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Round-trip check</span>
          <span>
            {Math.round(debug.calculatedAmountInr * 100) === debug.razorpayAmountPaise
              ? "✓ match"
              : "✗ MISMATCH"}
          </span>
        </div>
      </div>
    </div>
  );
}
