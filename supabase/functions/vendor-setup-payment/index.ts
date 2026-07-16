// Vendor payment setup – handles GET (fetch current), POST/PUT (upsert).
// Authenticated vendor-only via ownership check.
// Fixes: #6 (LIMIT 1), #7 (enum constants), #8/#11 (error vs null),
//        #9 (CORS PUT), #10 (atomic RPC)
// deno-lint-ignore-file no-explicit-any no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

/* ─────────────────── CORS ────────────────────────────────────────── */

// #9: Include PUT in allowed methods
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** JSON response helper — CORS headers on EVERY response (including errors). */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ─────────────────── Enum Constants ──────────────────────────────── */

// #7: Define enum constant — use throughout, never hardcode string literals
const PAYMENT_DESTINATION_TYPES = {
  IFSC_ACCOUNT: "ifsc_account",
  UPI_ID: "upi_id",
  BOTH: "both",
} as const;

type PaymentDestinationType = (typeof PAYMENT_DESTINATION_TYPES)[keyof typeof PAYMENT_DESTINATION_TYPES];


/* ─────────────────── Validation ──────────────────────────────────── */

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const UPI_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;

interface ValidationError {
  field: string;
  message: string;
}

function validatePayload(body: Record<string, unknown>): {
  errors: ValidationError[];
  parsed: {
    paymentDestinationType: PaymentDestinationType;
    ifscCode: string | null;
    accountNumber: string | null;
    accountHolderName: string | null;
    upiId: string | null;
  };
} {
  const errors: ValidationError[] = [];

  const hasIfsc = !!body.ifscCode || !!body.accountNumber;
  const hasUpi = !!body.upiId;

  if (!hasIfsc && !hasUpi) {
    errors.push({ field: "general", message: "At least one payment method (IFSC+Account or UPI) is required." });
  }

  let ifscCode: string | null = null;
  let accountNumber: string | null = null;
  let accountHolderName: string | null = null;
  let upiId: string | null = null;

  if (hasIfsc) {
    const rawIfsc = String(body.ifscCode ?? "").trim().toUpperCase();
    const rawAccount = String(body.accountNumber ?? "").trim();
    const rawHolder = String(body.accountHolderName ?? "").trim();

    if (!rawIfsc) {
      errors.push({ field: "ifscCode", message: "IFSC code is required when bank transfer is selected." });
    } else if (!IFSC_RE.test(rawIfsc)) {
      errors.push({ field: "ifscCode", message: "Invalid IFSC format. Expected 4 letters + 0 + 6 alphanumeric (e.g. HDFC0001234)." });
    }

    if (!rawAccount) {
      errors.push({ field: "accountNumber", message: "Account number is required when bank transfer is selected." });
    } else if (!ACCOUNT_RE.test(rawAccount)) {
      errors.push({ field: "accountNumber", message: "Account number must be 9–18 digits." });
    }

    if (!rawHolder) {
      errors.push({ field: "accountHolderName", message: "Account holder name is required." });
    }

    ifscCode = rawIfsc || null;
    accountNumber = rawAccount || null;
    accountHolderName = rawHolder || null;
  }

  if (hasUpi) {
    const rawUpi = String(body.upiId ?? "").trim();
    if (!rawUpi) {
      errors.push({ field: "upiId", message: "UPI ID is required when UPI is selected." });
    } else if (!UPI_RE.test(rawUpi)) {
      errors.push({ field: "upiId", message: "Invalid UPI format. Expected: username@bankname." });
    }
    upiId = rawUpi || null;
  }

  // #7: Use enum constants for type determination
  let paymentDestinationType: PaymentDestinationType = PAYMENT_DESTINATION_TYPES.IFSC_ACCOUNT;
  if (hasIfsc && hasUpi) paymentDestinationType = PAYMENT_DESTINATION_TYPES.BOTH;
  else if (hasUpi) paymentDestinationType = PAYMENT_DESTINATION_TYPES.UPI_ID;

  return {
    errors,
    parsed: { paymentDestinationType, ifscCode, accountNumber, accountHolderName, upiId },
  };
}

/* ─────────────────── Main Handler ────────────────────────────────── */

Deno.serve(async (req) => {
  // CORS preflight — #9: includes PUT
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    /* ── Auth ─────────────────────────────────────────────────────── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await anon.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    /* ── Get vendor ID for this user ─────────────────────────────── */
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // #6: Explicit .limit(1) for defensive clarity (maybeSingle also limits internally)
    const { data: vendorRow, error: vendorErr } = await svc
      .from("vendors")
      .select("id, store_name, bank_account_holder, payment_setup_completed")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    // #8/#11: Distinguish query error from null result
    if (vendorErr) {
      console.error("Vendor query failed:", vendorErr.message);
      return json({ error: "Failed to look up vendor record", details: vendorErr.message }, 500);
    }
    if (!vendorRow) {
      return json({ error: "Vendor not found" }, 404);
    }

    const vendorId = vendorRow.id;

    /* ── GET: return current setup ───────────────────────────────── */
    if (req.method === "GET") {
      // #8/#11: Separate query error from empty result
      const { data: setup, error: setupErr } = await svc
        .from("vendor_payment_setup")
        .select("*")
        .eq("vendor_id", vendorId)
        .limit(1)
        .maybeSingle();

      if (setupErr) {
        console.error("Payment setup query failed:", setupErr.message);
        return json({ error: "Failed to load payment setup", details: setupErr.message }, 500);
      }

      // setup === null means no setup exists yet — that's a valid state, return null
      // Mask PCI-sensitive fields before returning to the client.
      // Raw values are kept in the database; only the masked representation is sent over the wire.
      let maskedSetup: Record<string, unknown> | null = null;
      if (setup) {
        const rawIfsc: string | null = setup.ifsc_code ?? null;
        const rawAccount: string | null = setup.account_number ?? null;
        const rawUpi: string | null = setup.upi_id ?? null;

        // IFSC: first 4 characters + 'XXXXXX'
        const maskedIfsc = rawIfsc
          ? (rawIfsc.length <= 4 ? "****" : rawIfsc.slice(0, 4) + "XXXXXX")
          : null;

        // Account number: '****' + last 4 digits
        const maskedAccount = rawAccount
          ? (rawAccount.length <= 4 ? "****" : "****" + rawAccount.slice(-4))
          : null;

        // UPI ID: first 3 chars + '***' + @domain; if no '@', just first 3 + '***'
        let maskedUpi: string | null = null;
        if (rawUpi) {
          const parts = rawUpi.split("@");
          if (parts.length !== 2) {
            maskedUpi = "***";
          } else {
            maskedUpi = parts[0].slice(0, 3) + "***@" + parts[1];
          }
        }

        maskedSetup = {
          paymentDestinationType: setup.payment_destination_type,
          ifscCode: maskedIfsc,
          accountNumber: maskedAccount,
          accountHolderName: setup.account_holder_name,
          upiId: maskedUpi,
          isCompleted: setup.is_completed,
          completedAt: setup.completed_at,
        };
      }

      return json({
        paymentSetup: maskedSetup,
        vendorStatus: {
          paymentSetupCompleted: vendorRow.payment_setup_completed,
          defaultAccountHolder: vendorRow.bank_account_holder ?? vendorRow.store_name,
        },
      });
    }

    /* ── POST/PUT: upsert payment setup ──────────────────────────── */
    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.json();
      const { errors, parsed } = validatePayload(body);

      if (errors.length > 0) {
        console.warn("Validation failed:", JSON.stringify(errors));
        // Return field-level errors for the client (#4 support)
        const fieldErrors: Record<string, string> = {};
        for (const e of errors) {
          fieldErrors[e.field] = e.message;
        }
        return json({ error: "Validation failed", errors, fieldErrors }, 400);
      }

      // #10: Use atomic RPC instead of two separate queries
      const { data: rpcResult, error: rpcError } = await svc.rpc(
        "upsert_vendor_payment_setup_atomic",
        {
          p_vendor_id: vendorId,
          p_payment_destination_type: parsed.paymentDestinationType,
          p_ifsc_code: parsed.ifscCode,
          p_account_number: parsed.accountNumber,
          p_account_holder_name: parsed.accountHolderName,
          p_upi_id: parsed.upiId,
        },
      );

      if (rpcError) {
        console.error("Atomic upsert RPC failed:", rpcError.message);
        return json({ error: "Failed to save payment setup", details: rpcError.message }, 500);
      }

      // The RPC returns jsonb — guard against null/undefined/invalid responses
      if (!rpcResult || typeof rpcResult !== "object") {
        console.error("RPC returned invalid response:", JSON.stringify(rpcResult));
        return json({ error: "RPC returned invalid response", code: "INVALID_RPC_RESPONSE" }, 500);
      }
      if (!(rpcResult as any).success) {
        console.error("RPC returned failure:", JSON.stringify(rpcResult));
        return json({ error: (rpcResult as any).error ?? "Payment setup failed", code: "PAYMENT_SETUP_FAILED" }, 400);
      }

      console.log(`Payment setup saved for vendor ${vendorId}:`, JSON.stringify({
        type: parsed.paymentDestinationType,
        hasIfsc: !!parsed.ifscCode,
        hasUpi: !!parsed.upiId,
      }));

      return json({
        success: true,
        message: "Payment setup saved successfully",
      });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("vendor-setup-payment error:", (err as Error).message);
    return json({ error: "Internal server error" }, 500);
  }
});
