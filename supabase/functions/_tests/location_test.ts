import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const BASE = `${SUPABASE_URL}/functions/v1/location`;

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  };
}

Deno.test("detect returns a location object", async () => {
  const r = await fetch(`${BASE}/detect`, { headers: headers() });
  const j = await r.json();
  assertEquals(r.status, 200);
  assert("country" in j);
  assert("source" in j);
});

Deno.test("lookup rejects invalid pincode with 400", async () => {
  const r = await fetch(`${BASE}/lookup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ pincode: "" }),
  });
  const j = await r.json();
  assertEquals(r.status, 400);
  assert("error" in j);
});

Deno.test("lookup with valid-shaped pincode returns 200 (serviceable boolean)", async () => {
  const r = await fetch(`${BASE}/lookup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ pincode: "999999" }),
  });
  const j = await r.json();
  assertEquals(r.status, 200);
  assert("serviceable" in j);
});

Deno.test("reverse-geocode rejects invalid coords with 400", async () => {
  const r = await fetch(`${BASE}/reverse-geocode`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ lat: "abc", lng: null }),
  });
  const j = await r.json();
  assertEquals(r.status, 400);
  assert("error" in j);
});

Deno.test("cities short query returns empty array", async () => {
  const r = await fetch(`${BASE}/cities?q=a`, { headers: headers() });
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Array.isArray(j), true);
  assertEquals(j.length, 0);
});

Deno.test("suggestions short query returns empty array", async () => {
  const r = await fetch(`${BASE}/suggestions?q=a`, { headers: headers() });
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Array.isArray(j), true);
});

Deno.test("unknown path returns 404", async () => {
  const r = await fetch(`${BASE}/nonexistent-action`, { headers: headers() });
  await r.text();
  assertEquals(r.status, 404);
});
