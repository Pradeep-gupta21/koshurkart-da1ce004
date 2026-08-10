/**
 * Focused tests for the three CodeRabbit fixes in process-email-queue.
 *
 * Import convention: std@0.177.0 — matches the existing repository test convention
 * (see supabase/functions/_tests/validation_test.ts).
 *
 * Test categories:
 *
 *   PRODUCTION HELPER TESTS — call the actual exported production functions:
 *     isRateLimited, isForbidden, getRetryAfterSeconds (from helpers.ts)
 *     BrevoError (from _shared/brevo.ts)
 *     sendViaBrevo (from _shared/brevo.ts) via fetch stub
 *
 *   DOCUMENTED CONTROL-FLOW SIMULATIONS — illustrate the expected batch
 *   logic. These do NOT execute the full Deno.serve handler (which requires
 *   a live Supabase instance), but they mirror the production control-flow
 *   exactly. Clearly marked as simulations.
 *
 * Run:
 *   deno test --config supabase/functions/deno.json \
 *     supabase/functions/process-email-queue/index_test.ts --allow-env
 */
// deno-lint-ignore-file no-import-prefix

import { assertEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";

// ---- ACTUAL PRODUCTION HELPERS ----
import {
  isRateLimited,
  isForbidden,
  getRetryAfterSeconds,
  moveToDlq,
  applyDurableBrevoCooldown,
} from "./helpers.ts";

function captureEnv(keys: string[]) {
  const original = new Map<string, string | undefined>();
  for (const key of keys) {
    original.set(key, Deno.env.get(key));
  }
  return () => {
    for (const [key, value] of original) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  };
}

import {
  BrevoError,
  sendViaBrevo,
} from "../_shared/brevo.ts";

// ===========================================================================
// SECTION 1 — PRODUCTION HELPER TESTS
// These call the ACTUAL exported functions from production code.
// ===========================================================================

// ---------------------------------------------------------------------------
// isRateLimited — production function from helpers.ts
// ---------------------------------------------------------------------------

Deno.test("[PROD] isRateLimited: { status: 429 } → true", () => {
  assertEquals(isRateLimited({ status: 429 }), true);
});

Deno.test("[PROD] isRateLimited: { status: '429' } → true", () => {
  assertEquals(isRateLimited({ status: "429" }), true);
});

Deno.test("[PROD] isRateLimited: { status: 403 } → false", () => {
  assertEquals(isRateLimited({ status: 403 }), false);
});

Deno.test("[PROD] isRateLimited: { status: 500, message: 'HTTP 429' } → false (structured precedence)", () => {
  assertEquals(isRateLimited({ status: 500, message: "HTTP 429 Too Many Requests" }), false);
});

Deno.test("[PROD] isRateLimited: unusable structured status falls back to message", () => {
  const err1 = new Error("HTTP 429 Too Many Requests"); (err1 as any).status = true;
  assertEquals(isRateLimited(err1), true);

  const err2 = new Error("HTTP 429 Too Many Requests"); (err2 as any).status = "";
  assertEquals(isRateLimited(err2), true);

  const err3 = new Error("HTTP 429 Too Many Requests"); (err3 as any).status = "   ";
  assertEquals(isRateLimited(err3), true);
});

Deno.test("[PROD] isRateLimited: strict message formats match", () => {
  assertEquals(isRateLimited(new Error("HTTP 429 Too Many Requests")), true);
  assertEquals(isRateLimited(new Error("HTTP status 429")), true);
  assertEquals(isRateLimited(new Error("status: 429")), true);
  assertEquals(isRateLimited(new Error("status=429")), true);
  assertEquals(isRateLimited(new Error("Brevo 429: Too Many Requests")), true);
});

Deno.test("[PROD] isRateLimited: arbitrary occurrences do NOT match", () => {
  assertEquals(isRateLimited(new Error("failed after 4290 ms")), false);
  assertEquals(isRateLimited(new Error("request took 429 ms")), false);
  assertEquals(isRateLimited(new Error("order 429 was processed")), false);
});

// ---------------------------------------------------------------------------
// isForbidden — production function from helpers.ts
// ---------------------------------------------------------------------------

Deno.test("[PROD] isForbidden: { status: 403 } → true", () => {
  assertEquals(isForbidden({ status: 403 }), true);
});

Deno.test("[PROD] isForbidden: { status: '403' } → true", () => {
  assertEquals(isForbidden({ status: "403" }), true);
});

Deno.test("[PROD] isForbidden: { status: 429 } → false", () => {
  assertEquals(isForbidden({ status: 429 }), false);
});

Deno.test("[PROD] isForbidden: { status: 500, message: 'HTTP 403' } → false (structured precedence)", () => {
  assertEquals(isForbidden({ status: 500, message: "HTTP 403 Forbidden" }), false);
});

Deno.test("[PROD] isForbidden: unusable structured status falls back to message", () => {
  const err1 = new Error("HTTP 403 Forbidden"); (err1 as any).status = true;
  assertEquals(isForbidden(err1), true);

  const err2 = new Error("HTTP 403 Forbidden"); (err2 as any).status = "";
  assertEquals(isForbidden(err2), true);

  const err3 = new Error("HTTP 403 Forbidden"); (err3 as any).status = "   ";
  assertEquals(isForbidden(err3), true);
});

Deno.test("[PROD] isForbidden: strict message formats match", () => {
  assertEquals(isForbidden(new Error("HTTP 403 Forbidden")), true);
  assertEquals(isForbidden(new Error("HTTP status 403")), true);
  assertEquals(isForbidden(new Error("status: 403")), true);
  assertEquals(isForbidden(new Error("status=403")), true);
  assertEquals(isForbidden(new Error("Brevo 403: Forbidden")), true);
});

Deno.test("[PROD] isForbidden: arbitrary occurrences do NOT match", () => {
  assertEquals(isForbidden(new Error("failed after 4030 ms")), false);
  assertEquals(isForbidden(new Error("request took 403 ms")), false);
  assertEquals(isForbidden(new Error("order 403 was processed")), false);
});

// ---------------------------------------------------------------------------
// getRetryAfterSeconds — production function from helpers.ts
// ---------------------------------------------------------------------------

Deno.test("[PROD] getRetryAfterSeconds: numeric Retry-After → that value", () => {
  assertEquals(getRetryAfterSeconds(new BrevoError(429, "30", "rl")), 30);
});

Deno.test("[PROD] getRetryAfterSeconds: null retryAfterSeconds → 60", () => {
  const err = new BrevoError(429, null, "rl");
  assertEquals(err.retryAfterSeconds, null);
  assertEquals(getRetryAfterSeconds(err), 60);
});

Deno.test("[PROD] getRetryAfterSeconds: invalid negative Retry-After → BrevoError rejects → fallback 60", () => {
  const err = new BrevoError(429, "-1", "rl");
  assertEquals(err.retryAfterSeconds, null);
  assertEquals(getRetryAfterSeconds(err), 60);
});

Deno.test("[PROD] getRetryAfterSeconds: future HTTP-date Retry-After → correct seconds", () => {
  const future = new Date(Date.now() + 30_000).toUTCString();
  const err = new BrevoError(429, future, "rl");
  assertExists(err.retryAfterSeconds);
  const secs = getRetryAfterSeconds(err);
  assertEquals(secs >= 28 && secs <= 32, true, `Expected ~30s, got ${secs}`);
});

Deno.test("[PROD] getRetryAfterSeconds: very large Retry-After is capped at 30 days", () => {
  const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60;
  const ONE_YEAR_SECS = 365 * 24 * 60 * 60;
  const EXTREME_SECS = Number.MAX_SAFE_INTEGER;
  const MAX_COOLDOWN = 30 * 24 * 60 * 60;

  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: THIRTY_ONE_DAYS }), MAX_COOLDOWN, "31 days should cap at 30");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: ONE_YEAR_SECS }), MAX_COOLDOWN, "1 year should cap at 30");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: EXTREME_SECS }), MAX_COOLDOWN, "MAX_SAFE_INTEGER should cap at 30");
});

Deno.test("[PROD] getRetryAfterSeconds: plain Error (no retryAfterSeconds) → 60", () => {
  assertEquals(getRetryAfterSeconds(new Error("generic")), 60);
});

Deno.test("[PROD] getRetryAfterSeconds: strict validation of retryAfterSeconds property", () => {
  // Valid cases
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: 30 }), 30, "number 30 -> 30");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: 0 }), 0, "number 0 -> 0");

  // Invalid cases falling back to 60
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: null }), 60, "null -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: undefined }), 60, "undefined -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: NaN }), 60, "NaN -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: Infinity }), 60, "Infinity -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: -Infinity }), 60, "-Infinity -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: -5 }), 60, "negative number -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: "30" }), 60, "string '30' -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: true }), 60, "boolean true -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: {} }), 60, "object -> 60");
  assertEquals(getRetryAfterSeconds({ retryAfterSeconds: [] }), 60, "array -> 60");
});

// ---------------------------------------------------------------------------
// BrevoError — production class from _shared/brevo.ts
// ---------------------------------------------------------------------------

Deno.test("[PROD] BrevoError: status and retryAfterSeconds set correctly", () => {
  const err = new BrevoError(429, "60", "rl");
  assertEquals(err.status, 429);
  assertEquals(err.retryAfterSeconds, 60);
  assertEquals(err.provider, "brevo");
  assertEquals(err.name, "BrevoError");
});

Deno.test("[PROD] BrevoError: null Retry-After → retryAfterSeconds=null", () => {
  assertEquals(new BrevoError(429, null, "rl").retryAfterSeconds, null);
});

Deno.test("[PROD] BrevoError: 403 → retryAfterSeconds=null", () => {
  const err = new BrevoError(403, null, "forbidden");
  assertEquals(err.status, 403);
  assertEquals(err.retryAfterSeconds, null);
});

// ---------------------------------------------------------------------------
// sendViaBrevo — tested via fetch stub against ACTUAL production function
// ---------------------------------------------------------------------------

Deno.test("[PROD] sendViaBrevo: all opts provided → correct HTTP header + body fields", async () => {
  const capturedRequests: Request[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedRequests.push(new Request(input, init));
    return new Response(JSON.stringify({ messageId: "stub" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const restoreEnv = captureEnv(["LOVABLE_API_KEY", "BREVO_API_KEY"]);
  try {
    Deno.env.set("LOVABLE_API_KEY", "test-lovable-key");
    Deno.env.set("BREVO_API_KEY", "test-brevo-key");

    await sendViaBrevo("r@example.com", "Test", "Subj", "<p>Hi</p>", {
      idempotencyKey: "idem-abc-123",
      messageId: "msg-456",
      unsubscribeToken: "tok-789",
      text: "Hi (plain)",
    });

    assertEquals(capturedRequests.length, 1);
    const req = capturedRequests[0];
    assertEquals(req.headers.get("Idempotency-Key"), "idem-abc-123");

    const body = await req.json() as Record<string, unknown>;
    const headers = body.headers as Record<string, string>;
    assertExists(headers);
    assertEquals(headers["X-Message-Id"], "msg-456");
    assertEquals(headers["X-Unsubscribe-Token"], "tok-789");
    assertEquals(body.textContent, "Hi (plain)");
    assertEquals(body.htmlContent, "<p>Hi</p>");
  } finally {
    globalThis.fetch = origFetch;
    restoreEnv();
  }
});

Deno.test("[PROD] sendViaBrevo: null opts → no Idempotency-Key, no body.headers, no textContent", async () => {
  const capturedRequests: Request[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedRequests.push(new Request(input, init));
    return new Response(JSON.stringify({ messageId: "stub" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const restoreEnv = captureEnv(["LOVABLE_API_KEY", "BREVO_API_KEY"]);
  try {
    Deno.env.set("LOVABLE_API_KEY", "test-lovable-key");
    Deno.env.set("BREVO_API_KEY", "test-brevo-key");

    await sendViaBrevo("r@example.com", null, "Subj", "<p>Hi</p>", {
      idempotencyKey: null,
      messageId: null,
      unsubscribeToken: null,
      text: null,
    });

    assertEquals(capturedRequests.length, 1);
    const req = capturedRequests[0];
    assertEquals(req.headers.get("Idempotency-Key"), null);

    const body = await req.json() as Record<string, unknown>;
    assertEquals("headers" in body, false, "body.headers must be absent when opts are null");
    assertEquals("textContent" in body, false, "textContent must be absent when text is null");
    assertEquals(body.htmlContent, "<p>Hi</p>");
  } finally {
    globalThis.fetch = origFetch;
    restoreEnv();
  }
});

Deno.test("[PROD] sendViaBrevo: retry with same idempotency key produces same Idempotency-Key header", async () => {
  const keys: (string | null)[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    keys.push(new Request(input, init).headers.get("Idempotency-Key"));
    return new Response(JSON.stringify({ messageId: "stub" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const restoreEnv = captureEnv(["LOVABLE_API_KEY", "BREVO_API_KEY"]);
  try {
    Deno.env.set("LOVABLE_API_KEY", "test-lovable-key");
    Deno.env.set("BREVO_API_KEY", "test-brevo-key");

    const FIXED = "return_requested:item-uuid-111";
    await sendViaBrevo("a@b.com", null, "S", "<p/>", { idempotencyKey: FIXED });
    await sendViaBrevo("a@b.com", null, "S", "<p/>", { idempotencyKey: FIXED });

    assertEquals(keys.length, 2);
    assertEquals(keys[0], FIXED);
    assertEquals(keys[0], keys[1], "retry must use the same idempotency key");
  } finally {
    globalThis.fetch = origFetch;
    restoreEnv();
  }
});

// ===========================================================================
// SECTION 2 — DOCUMENTED CONTROL-FLOW SIMULATIONS
// These do NOT execute Deno.serve (requires live Supabase).
// They use the ACTUAL production helpers where possible and clearly document
// expected behavior. Not a substitute for integration tests.
// ===========================================================================

/**
 * [SIMULATION] Models the catch-block from index.ts.
 * Uses ACTUAL isRateLimited, isForbidden, and getRetryAfterSeconds from production.
 */
function simulateFailure(
  error: Error | BrevoError,
  provider: string,
  messageId: string,
  failedAttempts: number,
  failedAttemptsByMessageId: Map<string, number>,
  nowMs: number,
  opts?: { failDlq?: boolean; failDurable?: boolean; rpcEffectiveCooldown?: string; failDlqLog?: boolean }
) {
  let loggedRateLimited = false;
  let loggedFailed = false;
  let counterIncremented = false;
  let brevoRateLimitedUntil = 0;
  let workerReturned = false;
  let rateLimitLogError = null;
  let dlqCalled = false;
  let brevoDisabled = false;
  let dlqSuccess = true;
  let durableRpcCalled = false;
  let durableRpcFailed = false;

  if (isRateLimited(error)) {
    loggedRateLimited = true;
    if (error.message.startsWith("FAIL_LOG")) {
      rateLimitLogError = new Error("DB insert failed");
    }
    if (rateLimitLogError) { /* console.error */ }

    if (provider === "brevo") {
      const retryAfterSecs = getRetryAfterSeconds(error);
      const cooldownSeconds = Math.max(1, retryAfterSecs);
      brevoRateLimitedUntil = nowMs + cooldownSeconds * 1000;

      durableRpcCalled = true;
      if (opts?.failDurable) {
        durableRpcFailed = true;
      } else if (opts?.rpcEffectiveCooldown) {
        const parsedEffective = Date.parse(opts.rpcEffectiveCooldown);
        if (!Number.isNaN(parsedEffective) && Number.isFinite(parsedEffective)) {
          brevoRateLimitedUntil = Math.max(brevoRateLimitedUntil, parsedEffective);
        }
      }

      loggedFailed = true;
      failedAttemptsByMessageId.set(messageId, failedAttempts + 1);
      counterIncremented = true;
    } else {
      workerReturned = true;
    }
  } else if (isForbidden(error)) {
    dlqCalled = true;
    dlqSuccess = !(opts?.failDlq);

    if (!dlqSuccess) {
      if (opts?.failDlqLog) {
        // simulates insert failure, loggedFailed remains false
      } else {
        loggedFailed = true; // simulates status: 'failed' durable write
      }
      failedAttemptsByMessageId.set(messageId, failedAttempts + 1);
      counterIncremented = true;
    }

    if (provider === "brevo") {
      brevoDisabled = true;
    }
  } else {
    loggedFailed = true;
    failedAttemptsByMessageId.set(messageId, failedAttempts + 1);
    counterIncremented = true;
  }

  return { loggedRateLimited, loggedFailed, counterIncremented, brevoRateLimitedUntil, workerReturned, rateLimitLogError, dlqCalled, brevoDisabled, dlqSuccess, durableRpcCalled, durableRpcFailed };
}

// ---------------------------------------------------------------------------
// Brevo 429 Simulations
// ---------------------------------------------------------------------------

Deno.test("[SIM] Brevo 429: RPC returns LONGER cooldown → local updates to longer", () => {
  const error = new BrevoError(429, "60", "rate limited");
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const longerTimestamp = new Date(nowMs + 300_000).toISOString();
  
  const r = simulateFailure(error, "brevo", "msg-A", 0, map, nowMs, { rpcEffectiveCooldown: longerTimestamp });

  assertEquals(r.brevoRateLimitedUntil, nowMs + 300_000);
});

Deno.test("[SIM] Brevo 429: RPC returns SHORTER cooldown → local stays longer", () => {
  const error = new BrevoError(429, "300", "rate limited");
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const shorterTimestamp = new Date(nowMs + 60_000).toISOString();
  
  const r = simulateFailure(error, "brevo", "msg-A", 0, map, nowMs, { rpcEffectiveCooldown: shorterTimestamp });

  assertEquals(r.brevoRateLimitedUntil, nowMs + 300_000);
});

Deno.test("[SIM] Brevo 429: Invalid RPC result does not corrupt local cooldown", () => {
  const error = new BrevoError(429, "60", "rate limited");
  const map = new Map<string, number>();
  const nowMs = Date.now();
  
  const r = simulateFailure(error, "brevo", "msg-A", 0, map, nowMs, { rpcEffectiveCooldown: "INVALID_DATE_STRING" });

  assertEquals(r.brevoRateLimitedUntil, nowMs + 60_000);
  assertEquals(Number.isNaN(r.brevoRateLimitedUntil), false);
});

Deno.test("[SIM] Brevo 403: DLQ transfer fail + Fallback log fail → still increments counter, does not crash", () => {
  const error = new BrevoError(403, null, "forbidden");
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const r = simulateFailure(error, "brevo", "msg-A", 0, map, nowMs, { failDlq: true, failDlqLog: true });

  assertEquals(r.dlqCalled, true);
  assertEquals(r.dlqSuccess, false);
  assertEquals(r.counterIncremented, true, "Memory counter must increment even if DB log fails");
  assertEquals(map.get("msg-A"), 1);
  assertEquals(r.brevoDisabled, true, "Brevo remains disabled");
});

// ---------------------------------------------------------------------------
// Worker Startup: Durable Brevo Cooldown
// ---------------------------------------------------------------------------

Deno.test("[PROD] applyDurableBrevoCooldown: future durable cooldown is loaded", () => {
  const nowMs = Date.now();
  const future = new Date(nowMs + 60000).toISOString();
  const res = applyDurableBrevoCooldown(0, future, nowMs);
  assertEquals(res, nowMs + 60000);
});

Deno.test("[PROD] applyDurableBrevoCooldown: expired cooldown is ignored", () => {
  const nowMs = Date.now();
  const expired = new Date(nowMs - 60000).toISOString();
  const res = applyDurableBrevoCooldown(0, expired, nowMs);
  assertEquals(res, 0);
});

Deno.test("[PROD] applyDurableBrevoCooldown: malformed timestamp is ignored", () => {
  const res = applyDurableBrevoCooldown(0, "INVALID", Date.now());
  assertEquals(res, 0);
});

Deno.test("[PROD] applyDurableBrevoCooldown: null/undefined is ignored", () => {
  assertEquals(applyDurableBrevoCooldown(0, null, Date.now()), 0);
  assertEquals(applyDurableBrevoCooldown(0, undefined, Date.now()), 0);
});

Deno.test("[PROD] applyDurableBrevoCooldown: existing longer cooldown is preserved", () => {
  const nowMs = Date.now();
  const current = nowMs + 100000;
  const longer = new Date(nowMs + 200000).toISOString();
  const res = applyDurableBrevoCooldown(current, longer, nowMs);
  assertEquals(res, nowMs + 200000);
});

Deno.test("[PROD] applyDurableBrevoCooldown: a shorter persisted cooldown does not shorten an already-active invocation cooldown", () => {
  const nowMs = Date.now();
  const current = nowMs + 100000;
  const shorter = new Date(nowMs + 60000).toISOString();
  const res = applyDurableBrevoCooldown(current, shorter, nowMs);
  assertEquals(res, current);
});

Deno.test("[SIM] Brevo 429: rate_limited logged, failed record inserted, counter incremented, cooldown set, batch continues", () => {
  const error = new BrevoError(429, "30", "rate limited");
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const r = simulateFailure(error, "brevo", "msg-A", 0, map, nowMs);

  assertEquals(r.loggedRateLimited, true);
  assertEquals(r.loggedFailed, true, "MUST record actual failed attempt exactly once");
  assertEquals(r.counterIncremented, true);
  assertEquals(map.get("msg-A"), 1);
  assertEquals(r.brevoRateLimitedUntil, nowMs + 30_000);
  assertEquals(r.durableRpcCalled, true);
  assertEquals(r.workerReturned, false);
});

Deno.test("[SIM] Brevo 429: Persistence failure is logged but does not reset invocation cooldown", () => {
  const error = new BrevoError(429, "30", "rate limited");
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const r = simulateFailure(error, "brevo", "msg-A", 0, map, nowMs, { failDurable: true });

  assertEquals(r.loggedRateLimited, true);
  assertEquals(r.durableRpcCalled, true);
  assertEquals(r.durableRpcFailed, true);
  assertEquals(r.brevoRateLimitedUntil, nowMs + 30_000, "Invocation cooldown remains intact despite RPC failure");
  assertEquals(r.workerReturned, false, "Does not stop the batch");
});

Deno.test("[SIM] Brevo 429: null Retry-After → 60 s falldown via actual getRetryAfterSeconds", () => {
  const nowMs = 1_700_000_000_000;
  const r = simulateFailure(new BrevoError(429, null, "rl"), "brevo", "b", 0, new Map(), nowMs);
  assertEquals(r.brevoRateLimitedUntil, nowMs + 60_000);
});

Deno.test("[SIM] Normal failure (non-429, non-403) still increments failed attempts and writes status='failed'", () => {
  const map = new Map<string, number>();
  const r = simulateFailure(new Error("500 Internal Server Error"), "brevo", "msg-X", 2, map, Date.now());
  assertEquals(r.loggedFailed, true);
  assertEquals(r.counterIncremented, true);
  assertEquals(map.get("msg-X"), 3);
});

Deno.test("[SIM] Rate-limit log insert failure: error caught, batch continues, cooldown established, failure recorded", () => {
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const r = simulateFailure(new BrevoError(429, "10", "FAIL_LOG"), "brevo", "msg-Y", 0, map, nowMs);
  assertEquals(r.loggedRateLimited, true);
  assertExists(r.rateLimitLogError);
  assertEquals(r.loggedFailed, true);
  assertEquals(map.get("msg-Y"), 1);
  assertEquals(r.brevoRateLimitedUntil, nowMs + 10_000);
  assertEquals(r.workerReturned, false);
});

Deno.test("[SIM] Operational clearing path: reset_provider_cooldown RPC clears durable cooldown and allows send", () => {
  // Simulate the DB state after `reset_provider_cooldown('brevo')` is called.
  // The RPC updates `retry_after_until = now()`, which effectively clears the cooldown.
  const clearedTimestamp = Date.now(); // Effective cooldown is <= Date.now()
  let brevoRateLimitedUntil = 0;

  const parsedTimestamp = Date.parse(new Date(clearedTimestamp).toISOString());
  if (!Number.isNaN(parsedTimestamp) && parsedTimestamp > Date.now()) {
    brevoRateLimitedUntil = Math.max(brevoRateLimitedUntil, parsedTimestamp);
  }

  // The worker correctly sees the cooldown has expired (brevoRateLimitedUntil remains 0).
  assertEquals(brevoRateLimitedUntil, 0);

  // When a message is processed:
  const batch = [{ provider: "brevo", id: "A" }];
  const deferred: string[] = [];
  const processed: string[] = [];

  for (const msg of batch) {
    if (msg.provider === "brevo" && brevoRateLimitedUntil > Date.now()) {
      deferred.push(msg.id);
      continue;
    }
    processed.push(msg.id);
  }

  assertEquals(deferred.length, 0);
  assertEquals(processed, ["A"], "Message is processed after operational clear");
});

Deno.test("[SIM] Non-Brevo 429 still stops the batch (existing behavior preserved)", () => {
  const r = simulateFailure(new BrevoError(429, "5", "rl"), "lovable", "x", 0, new Map(), Date.now());
  assertEquals(r.workerReturned, true);
});

Deno.test("[SIM] 403 + successful DLQ transfer: brevoDisabled=true, NO failed-attempt increment, batch continues", () => {
  const error = new BrevoError(403, null, "Forbidden");
  const r = simulateFailure(error, "brevo", "msg", 0, new Map(), Date.now());
  assertEquals(r.dlqCalled, true);
  assertEquals(r.dlqSuccess, true);
  assertEquals(r.loggedFailed, false);
  assertEquals(r.counterIncremented, false);
  assertEquals(r.brevoDisabled, true);
  assertEquals(r.workerReturned, false);
});

Deno.test("[SIM] Brevo 403 + failed DLQ transfer: durable failed record, counter incremented, brevoDisabled=true", () => {
  const error = new BrevoError(403, null, "Forbidden");
  const map = new Map<string, number>();
  const r = simulateFailure(error, "brevo", "msg", 0, map, Date.now(), { failDlq: true });
  assertEquals(r.dlqCalled, true);
  assertEquals(r.dlqSuccess, false);
  assertEquals(r.loggedFailed, true, "writes status='failed'");
  assertEquals(r.counterIncremented, true, "increments failed-attempt counter");
  assertEquals(map.get("msg"), 1);
  assertEquals(r.brevoDisabled, true, "brevo disabled for invocation");
  assertEquals(r.workerReturned, false, "does not terminate batch");
});

Deno.test("[SIM] Non-Brevo 403 + failed DLQ transfer: durable failed record, counter incremented, brevoDisabled remains false", () => {
  const error = new Error("HTTP 403 Forbidden");
  const map = new Map<string, number>();
  const r = simulateFailure(error, "lovable", "msg", 0, map, Date.now(), { failDlq: true });
  assertEquals(r.dlqCalled, true);
  assertEquals(r.dlqSuccess, false);
  assertEquals(r.loggedFailed, true);
  assertEquals(r.counterIncremented, true);
  assertEquals(map.get("msg"), 1, "retry budget is advanced");
  assertEquals(r.brevoDisabled, false, "does not affect brevoDisabled");
  assertEquals(r.workerReturned, false);
});

Deno.test("[SIM] Mixed batch: Brevo A(403, DLQ fail) → failed record, brevoDisabled; B(brevo) deferred; C(Lovable) processed", () => {
  const batch = [
    { provider: "brevo",   id: "A", fail403: true, failDlq: true },
    { provider: "brevo",   id: "B", fail403: false, failDlq: false },
    { provider: "lovable", id: "C", fail403: false, failDlq: false },
  ];

  let brevoDisabled = false;
  const dlqd: string[] = [];
  const deferred: string[] = [];
  const processed: string[] = [];
  const failedMap = new Map<string, number>();

  for (const msg of batch) {
    if (msg.provider === "brevo" && brevoDisabled) { deferred.push(msg.id); continue; }
    if (msg.fail403) {
      if (isForbidden(new BrevoError(403, null, "Forbidden"))) {
        dlqd.push(msg.id);
        const dlqSuccess = !msg.failDlq;
        if (!dlqSuccess) {
          failedMap.set(msg.id, 1);
        }
        if (msg.provider === "brevo") {
          brevoDisabled = true;
        }
        continue;
      }
    }
    processed.push(msg.id);
  }

  assertEquals(dlqd, ["A"]);
  assertEquals(deferred, ["B"]); // B is deferred because A disabled brevo
  assertEquals(processed, ["C"]); // C is processed because Lovable isn't disabled
  assertEquals(failedMap.get("A"), 1, "A gets a durable failed attempt because its DLQ transfer failed");
});


// ---------------------------------------------------------------------------
// moveToDlq — Unit Tests
// ---------------------------------------------------------------------------
Deno.test("[PROD] moveToDlq: successful RPC call writes to email_send_log and returns true", async () => {
  const logInserts: any[] = [];
  const supabaseStub = {
    rpc: async (name: string) => {
      if (name === "move_to_dlq") return { error: null };
      return { error: new Error("unhandled rpc") };
    },
    from: (table: string) => ({
      insert: async (data: any) => {
        if (table === "email_send_log") logInserts.push(data);
        return { error: null };
      }
    })
  };

  const msg = { msg_id: 123, message: { message_id: "m456", label: "t1", to: "a@b.c" } };
  const res = await moveToDlq(supabaseStub, "q1", msg, "TTL exceeded");
  
  assertEquals(res, true);
  assertEquals(logInserts.length, 1);
  assertEquals(logInserts[0].status, "dlq");
});

Deno.test("[PROD] moveToDlq: failed RPC call does NOT write to email_send_log and returns false", async () => {
  const logInserts: any[] = [];
  const supabaseStub = {
    rpc: async (name: string) => {
      if (name === "move_to_dlq") return { error: new Error("RPC failed") };
      return { error: null };
    },
    from: (table: string) => ({
      insert: async (data: any) => {
        if (table === "email_send_log") logInserts.push(data);
        return { error: null };
      }
    })
  };

  const msg = { msg_id: 123, message: { message_id: "m456", label: "t1", to: "a@b.c" } };
  const res = await moveToDlq(supabaseStub, "q1", msg, "TTL exceeded");
  
  assertEquals(res, false);
  assertEquals(logInserts.length, 0, "No dlq status written when RPC fails");
});

Deno.test("[PROD] moveToDlq: thrown RPC error does NOT reject, returns false, does not write dlq", async () => {
  const logInserts: any[] = [];
  const supabaseStub = {
    rpc: async (name: string) => {
      throw new Error("Network disconnect");
    },
    from: (table: string) => ({
      insert: async (data: any) => {
        if (table === "email_send_log") logInserts.push(data);
        return { error: null };
      }
    })
  };

  const msg = { msg_id: 123, message: { message_id: "m456", label: "t1", to: "a@b.c" } };
  const res = await moveToDlq(supabaseStub, "q1", msg, "fail");
  
  assertEquals(res, false);
  assertEquals(logInserts.length, 0);
});

Deno.test("[PROD] moveToDlq: post-transfer log failure returns true, queue transfer authoritative", async () => {
  const logInserts: any[] = [];
  const supabaseStub = {
    rpc: async (name: string) => {
      if (name === "move_to_dlq") return { error: null };
      return { error: new Error("unhandled") };
    },
    from: (table: string) => ({
      insert: async (data: any) => {
        if (table === "email_send_log") logInserts.push(data);
        return { error: new Error("DB insert failed") };
      }
    })
  };

  const msg = { msg_id: 123, message: { message_id: "m456", label: "t1", to: "a@b.c" } };
  const res = await moveToDlq(supabaseStub, "q1", msg, "fail");
  
  assertEquals(res, true);
  assertEquals(logInserts.length, 1);
});

Deno.test("[PROD] moveToDlq: post-transfer log exception returns true, queue transfer authoritative", async () => {
  const logInserts: any[] = [];
  const supabaseStub = {
    rpc: async (name: string) => {
      if (name === "move_to_dlq") return { error: null };
      return { error: new Error("unhandled") };
    },
    from: (table: string) => ({
      insert: async (data: any) => {
        if (table === "email_send_log") logInserts.push(data);
        throw new Error("DB insert exception");
      }
    })
  };

  const msg = { msg_id: 123, message: { message_id: "m456", label: "t1", to: "a@b.c" } };
  const res = await moveToDlq(supabaseStub, "q1", msg, "fail");
  
  assertEquals(res, true);
  assertEquals(logInserts.length, 1);
});

