import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const TEST_PORT = Deno.env.get("TEST_PORT");
const FN_URL = TEST_PORT
  ? `http://localhost:${TEST_PORT}`
  : `${SUPABASE_URL}/functions/v1/request-payout`;

// Dynamically check if the function endpoint is deployed/reachable.
// We throw an error if it's not available to ensure CI fails on missing config.
let isAvailable = true;
try {
  const checkRes = await fetch(FN_URL, { method: "OPTIONS" });
  if (checkRes.status === 404) {
    isAvailable = false;
  }
} catch {
  isAvailable = false;
}

if (!isAvailable) {
  throw new Error(`Missing required test configuration: SUPABASE_URL or endpoint unreachable at ${FN_URL}`);
}

Deno.test({
  name: "request-payout: rejects requests without Authorization header",
  async fn() {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON },
      body: JSON.stringify({ amount: 100, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await res.json();
    assertEquals(res.status, 401);
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test({
  name: "request-payout: rejects invalid/expired token with 401",
  async fn() {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: "Bearer invalid-jwt-token-value",
      },
      body: JSON.stringify({ amount: 100, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await res.json();
    assertEquals(res.status, 401);
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test({
  name: "request-payout: CORS preflight OPTIONS returns 200",
  async fn() {
    const res = await fetch(FN_URL, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    await res.text();
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
    assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  }
});
