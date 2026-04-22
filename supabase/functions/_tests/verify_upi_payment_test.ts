import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/verify-upi-payment`;

Deno.test("rejects requests without Authorization header", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ paymentId: "x", orderId: "y", action: "approve" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("rejects non-admin authenticated callers (anon JWT is treated as unauthenticated)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({ paymentId: "x", orderId: "y", action: "approve" }),
  });
  await res.text();
  // Either 401 (anon JWT can't be resolved to user) or 403 (resolved but not admin)
  if (![401, 403].includes(res.status)) {
    throw new Error(`Expected 401 or 403, got ${res.status}`);
  }
});

Deno.test("CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
});
