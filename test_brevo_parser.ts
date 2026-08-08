import { BrevoError } from "./supabase/functions/_shared/brevo.ts";

function testParser(retryAfter: string | null) {
  const err = new BrevoError(429, retryAfter, "Test");
  console.log(`Input: ${retryAfter === null ? 'null' : '"' + retryAfter + '"'} => Output: ${err.retryAfterSeconds}`);
}

console.log("=== VALID NUMERIC ===");
testParser("0");
testParser("1");
testParser("30");
testParser("300");
testParser("3600");

console.log("\n=== INVALID NUMERIC ===");
testParser("-1");
testParser("1.5");
testParser("Infinity");
testParser("NaN");
testParser("9".repeat(400));
testParser("a123");

console.log("\n=== HTTP DATE ===");
const futureDate = new Date(Date.now() + 30000).toUTCString();
const pastDate = new Date(Date.now() - 30000).toUTCString();
testParser(futureDate);
testParser(pastDate);
testParser("Invalid Date String");
