// Security regression tests for vendor KYC + financial column-level lockdown
// and the SECURITY DEFINER RPCs that gate access.
//
// Run with: supabase--test_edge_functions { functions: ["test-bootstrap"], pattern: "vendor security" }
// (the runner picks up files under supabase/functions/_tests too)
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const TEST_SECRET = Deno.env.get("TEST_BOOTSTRAP_SECRET") ?? "";

const REST = `${SUPABASE_URL}/rest/v1`;
const FN = `${SUPABASE_URL}/functions/v1`;

const SENSITIVE_COLUMNS = [
  "pan_number",
  "gstin",
  "aadhaar_last4",
  "bank_account_number_masked",
  "bank_ifsc",
  "bank_account_holder",
  "total_earnings",
  "withdrawable_balance",
  "phone",
  "pickup_address_line1",
  "pickup_pincode",
  "kyc_status",
  "kyc_doc_pan",
  "kyc_rejection_reason",
  "verification_rejection_reason",
];

const PUBLIC_COLUMNS = [
  "id",
  "store_name",
  "store_slug",
  "logo",
  "trust_score",
  "is_verified",
  "rating",
];

type Ctx = {
  vendorId: string;
  buyerToken: string;
  vendorToken: string;
  adminToken: string;
  seed: Record<string, unknown>;
};

let ctx: Ctx | null = null;

function headers(token?: string) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${token ?? ANON}`,
    "Content-Type": "application/json",
  };
}

async function bootstrap(): Promise<Ctx> {
  if (ctx) return ctx;
  if (!TEST_SECRET) {
    throw new Error(
      "TEST_BOOTSTRAP_SECRET not set in env — cannot run vendor security tests",
    );
  }
  const r = await fetch(`${FN}/test-bootstrap`, {
    method: "POST",
    headers: { ...headers(), "x-test-secret": TEST_SECRET },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`bootstrap failed: ${JSON.stringify(j)}`);
  ctx = j as Ctx;
  return ctx;
}

async function selectVendor(token: string | undefined, select: string, vendorId: string) {
  const r = await fetch(
    `${REST}/vendors?id=eq.${vendorId}&select=${encodeURIComponent(select)}`,
    { headers: headers(token) },
  );
  const text = await r.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

async function rpc(token: string | undefined, name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${REST}/rpc/${name}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

function isPermissionDenied(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  if (typeof body === "object" && body && "code" in body) {
    const code = (body as Record<string, unknown>).code;
    if (code === "42501" || code === "PGRST301") return true;
  }
  const msg = JSON.stringify(body).toLowerCase();
  return (
    msg.includes("permission denied") ||
    msg.includes("not authorized") ||
    msg.includes("must be owner")
  );
}

Deno.test("bootstrap test users + vendor", async () => {
  const c = await bootstrap();
  assert(c.vendorId, "vendorId returned");
  assert(c.buyerToken && c.vendorToken && c.adminToken, "all three tokens returned");
});

Deno.test("A. sensitive vendor columns are REVOKEd for every non-service role", async () => {
  const c = await bootstrap();
  const roles: Array<[string, string | undefined]> = [
    ["anon", undefined],
    ["buyer", c.buyerToken],
    ["vendor (self)", c.vendorToken],
    ["admin", c.adminToken],
  ];
  for (const col of SENSITIVE_COLUMNS) {
    for (const [label, token] of roles) {
      const { status, body } = await selectVendor(token, col, c.vendorId);
      assert(
        isPermissionDenied(status, body),
        `${label} should be denied SELECT on vendors.${col} (got ${status}: ${JSON.stringify(body).slice(0, 200)})`,
      );
    }
  }
});

Deno.test("A2. public allow-list columns remain readable to anon", async () => {
  const c = await bootstrap();
  const { status, body } = await selectVendor(undefined, PUBLIC_COLUMNS.join(","), c.vendorId);
  assertEquals(status, 200, `anon should read public columns (got ${status})`);
  assert(Array.isArray(body) && body.length === 1, "one row returned");
  const row = (body as Array<Record<string, unknown>>)[0];
  assertEquals(row.store_name, "Sec Test Store");
});

Deno.test("A3. SELECT * on vendors must not leak sensitive columns", async () => {
  const c = await bootstrap();
  for (const [label, token] of [
    ["anon", undefined as string | undefined],
    ["vendor", c.vendorToken as string | undefined],
  ] as const) {
    const { status, body } = await selectVendor(token, "*", c.vendorId);
    if (status === 200 && Array.isArray(body) && body.length > 0) {
      const row = body[0] as Record<string, unknown>;
      for (const col of SENSITIVE_COLUMNS) {
        assert(
          !(col in row),
          `${label} SELECT * leaked vendors.${col}`,
        );
      }
    } else {
      assert(
        isPermissionDenied(status, body),
        `${label} SELECT * should error or strip sensitive columns (got ${status})`,
      );
    }
  }
});

Deno.test("B. get_my_vendor RPC", async () => {
  const c = await bootstrap();

  const anon = await rpc(undefined, "get_my_vendor");
  assert(isPermissionDenied(anon.status, anon.body), `anon must be denied get_my_vendor (got ${anon.status})`);

  const buyer = await rpc(c.buyerToken, "get_my_vendor");
  assertEquals(buyer.status, 200);
  assert(Array.isArray(buyer.body) && buyer.body.length === 0, "buyer has no vendor row");

  const vendor = await rpc(c.vendorToken, "get_my_vendor");
  assertEquals(vendor.status, 200);
  const rows = vendor.body as Array<Record<string, unknown>>;
  assertEquals(rows.length, 1, "vendor sees own row");
  assertEquals(rows[0].pan_number, c.seed.pan_number);
  assertEquals(Number(rows[0].total_earnings), Number(c.seed.total_earnings));
  assertEquals(rows[0].kyc_status, c.seed.kyc_status);

  const adminSelf = await rpc(c.adminToken, "get_my_vendor");
  assertEquals(adminSelf.status, 200);
  assert(
    Array.isArray(adminSelf.body) && (adminSelf.body as unknown[]).length === 0,
    "admin has no vendor row of own",
  );
});

Deno.test("C. get_vendor_admin RPC is admin-only", async () => {
  const c = await bootstrap();
  const calls: Array<[string, string | undefined]> = [
    ["anon", undefined],
    ["buyer", c.buyerToken],
    ["vendor", c.vendorToken],
  ];
  for (const [label, token] of calls) {
    const r = await rpc(token, "get_vendor_admin", { _vendor_id: c.vendorId });
    assert(
      isPermissionDenied(r.status, r.body),
      `${label} must be denied get_vendor_admin (got ${r.status}: ${JSON.stringify(r.body).slice(0, 200)})`,
    );
  }
  const admin = await rpc(c.adminToken, "get_vendor_admin", { _vendor_id: c.vendorId });
  assertEquals(admin.status, 200);
  const rows = admin.body as Array<Record<string, unknown>>;
  assertEquals(rows.length, 1);
  assertEquals(rows[0].pan_number, c.seed.pan_number);
  assertEquals(rows[0].bank_ifsc, "HDFC0000123");
});

Deno.test("D. get_vendor_financials RPC: owner or admin only", async () => {
  const c = await bootstrap();

  const anon = await rpc(undefined, "get_vendor_financials", { _vendor_id: c.vendorId });
  assert(isPermissionDenied(anon.status, anon.body), "anon denied");

  const buyer = await rpc(c.buyerToken, "get_vendor_financials", { _vendor_id: c.vendorId });
  assert(isPermissionDenied(buyer.status, buyer.body), "buyer denied (not owner, not admin)");

  const vendor = await rpc(c.vendorToken, "get_vendor_financials", { _vendor_id: c.vendorId });
  assertEquals(vendor.status, 200);
  const vRows = vendor.body as Array<Record<string, unknown>>;
  assertEquals(vRows.length, 1);
  assertEquals(Number(vRows[0].total_earnings), Number(c.seed.total_earnings));
  assertEquals(Number(vRows[0].withdrawable_balance), Number(c.seed.withdrawable_balance));
  assertEquals(Number(vRows[0].total_sales), Number(c.seed.total_sales));

  // Vendor querying a different vendor id must be denied
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const vendorOther = await rpc(c.vendorToken, "get_vendor_financials", { _vendor_id: fakeId });
  assert(
    isPermissionDenied(vendorOther.status, vendorOther.body),
    "vendor must not read another vendor's financials",
  );

  const admin = await rpc(c.adminToken, "get_vendor_financials", { _vendor_id: c.vendorId });
  assertEquals(admin.status, 200);
  const aRows = admin.body as Array<Record<string, unknown>>;
  assertEquals(aRows.length, 1);
});

Deno.test("E. list_vendors_admin RPC is admin-only", async () => {
  const c = await bootstrap();
  for (const [label, token] of [
    ["anon", undefined as string | undefined],
    ["buyer", c.buyerToken as string | undefined],
    ["vendor", c.vendorToken as string | undefined],
  ] as const) {
    const r = await rpc(token, "list_vendors_admin", {});
    assert(
      isPermissionDenied(r.status, r.body),
      `${label} must be denied list_vendors_admin (got ${r.status})`,
    );
  }
  const admin = await rpc(c.adminToken, "list_vendors_admin", { _search: "Sec Test", _limit: 10, _offset: 0 });
  assertEquals(admin.status, 200);
  const rows = admin.body as Array<Record<string, unknown>>;
  const found = rows.find((r) => r.id === c.vendorId);
  assert(found, "admin can list and find the seeded vendor");
  assertEquals(found!.pan_number, c.seed.pan_number);
});
