// Test bootstrap helper — seeds deterministic test users + a vendor and returns
// short-lived access tokens for buyer/vendor/admin. Gated by TEST_BOOTSTRAP_SECRET.
// DO NOT call from production code.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { createErrorResponse } from "../../../src/shared/errorResponse.ts";
import { normalizeRpcError } from "../../../src/shared/rpcErrorNormalizer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TEST_SECRET = Deno.env.get("TEST_BOOTSTRAP_SECRET")!;

const PASSWORD = "Test-Pass-9c8f2a!"; // local to this function
const USERS = {
  buyer: "sec-buyer@test.koshurkart.local",
  vendor: "sec-vendor@test.koshurkart.local",
  admin: "sec-admin@test.koshurkart.local",
} as const;

const VENDOR_SEED = {
  store_name: "Sec Test Store",
  store_slug: "sec-test-store",
  pan_number: "AAAPL1234C",
  gstin: "29ABCDE1234F1Z5",
  aadhaar_last4: "9999",
  bank_account_holder: "Sec Test Holder",
  bank_account_number_masked: "XXXX1234",
  bank_ifsc: "HDFC0000123",
  bank_verified: true,
  kyc_status: "approved",
  kyc_doc_pan: "https://example.com/pan.pdf",
  kyc_doc_address: "https://example.com/addr.pdf",
  kyc_doc_business: "https://example.com/biz.pdf",
  phone: "+919999999999",
  pickup_address_line1: "1 Test Lane",
  pickup_pincode: "190001",
  pickup_city: "Srinagar",
  pickup_state: "J&K",
  total_earnings: 12345.67,
  withdrawable_balance: 543.21,
  total_sales: 42,
  verification_status: "approved",
  is_verified: true,
};

async function ensureUser(admin: ReturnType<typeof createClient>, email: string) {
  // Try create; on conflict, look up via listUsers paging by email filter
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error && created.user) return created.user;
  // Fallback: find existing user
  // @ts-ignore - listUsers supports filter
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list.users.find((u) => u.email === email);
  if (!found) throw new Error(`Could not ensure user ${email}: ${error?.message}`);
  // Reset password to known value so signIn works deterministically
  await admin.auth.admin.updateUserById(found.id, { password: PASSWORD });
  return found;
}

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL, ANON);
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`signIn ${email} failed: ${error?.message}`);
  return data.session.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("x-test-secret") !== TEST_SECRET) {
    return new Response(JSON.stringify(createErrorResponse("forbidden", ERROR_CODES.FORBIDDEN, 403)), { status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const buyer = await ensureUser(admin, USERS.buyer);
    const vendor = await ensureUser(admin, USERS.vendor);
    const adminUser = await ensureUser(admin, USERS.admin);

    // Upsert admin role
    await admin
      .from("user_roles")
      .upsert({ user_id: adminUser.id, role: "admin" }, { onConflict: "user_id,role" });

    // Upsert vendor row owned by vendor user
    const { data: existingVendor } = await admin
      .from("vendors")
      .select("id")
      .eq("user_id", vendor.id)
      .maybeSingle();

    let vendorId: string;
    if (existingVendor) {
      vendorId = existingVendor.id;
      await admin.from("vendors").update(VENDOR_SEED).eq("id", vendorId);
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("vendors")
        .insert({ ...VENDOR_SEED, user_id: vendor.id })
        .select("id")
        .single();
      if (insErr) throw insErr;
      vendorId = inserted.id;
    }

    const [buyerToken, vendorToken, adminToken] = await Promise.all([
      signIn(USERS.buyer),
      signIn(USERS.vendor),
      signIn(USERS.admin),
    ]);

    return new Response(
      JSON.stringify({
        vendorId,
        vendorUserId: vendor.id,
        buyerToken,
        vendorToken,
        adminToken,
        seed: {
          pan_number: VENDOR_SEED.pan_number,
          total_earnings: VENDOR_SEED.total_earnings,
          withdrawable_balance: VENDOR_SEED.withdrawable_balance,
          total_sales: VENDOR_SEED.total_sales,
          kyc_status: VENDOR_SEED.kyc_status,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify(createErrorResponse(String((e as any)?.message ?? e), ERROR_CODES.INTERNAL_ERROR, 500)), { status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
