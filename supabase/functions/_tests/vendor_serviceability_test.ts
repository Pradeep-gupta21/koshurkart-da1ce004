import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const RPC = `${SUPABASE_URL}/rest/v1/rpc/check_serviceability`;

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  };
}

Deno.test("check_serviceability returns array shape for empty product list", async () => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ _pincode: "190001", _product_ids: [] }),
  });
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Array.isArray(j), true);
});

Deno.test("check_serviceability tolerates random unknown product UUID", async () => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      _pincode: "190001",
      _product_ids: ["00000000-0000-0000-0000-000000000000"],
    }),
  });
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Array.isArray(j), true);
  // Either empty (no row for unknown product) or one row with deliverable=false
  if (j.length > 0) {
    assert("deliverable" in j[0]);
    assert("eta_days" in j[0]);
    assert("cod" in j[0]);
  }
});

Deno.test("check_serviceability rejects malformed pincode payload gracefully", async () => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ _pincode: null, _product_ids: [] }),
  });
  await r.text();
  // PostgREST returns 400 for bad arg types; either 200 with [] or 400 is acceptable
  assert(r.status === 200 || r.status === 400);
});
