import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { parseAmountToPaise } from "../_shared/validation.ts";

Deno.test("parseAmountToPaise: correctly parses exact decimal strings and bounded numbers", () => {
  // Boundary tests from prompt
  assertEquals(parseAmountToPaise(0.01).paise, 1);
  assertEquals(parseAmountToPaise("0.01").paise, 1);
  
  assertEquals(parseAmountToPaise(1.00).paise, 100);
  assertEquals(parseAmountToPaise("1.00").paise, 100);
  
  assertEquals(parseAmountToPaise(10.5).paise, 1050);
  assertEquals(parseAmountToPaise("10.5").paise, 1050);
  
  assertEquals(parseAmountToPaise("10.50").paise, 1050);

  // Exact maximum supported paise boundary
  // Number.MAX_SAFE_INTEGER is 9007199254740991
  // If amount is 90071992547409.91, paise is 9007199254740991
  assertEquals(parseAmountToPaise("90071992547409.91").paise, 9007199254740991);
});

Deno.test("parseAmountToPaise: rejects numbers outside safe compatibility range but accepts equivalent string", () => {
  // We bound numbers at 10,000,000 to prevent float precision drift before .toString()
  assertEquals(parseAmountToPaise(10000000).paise, 1000000000);
  assertEquals(!!parseAmountToPaise(10000000.01).error, true);
  
  // The same monetary amount as a string is exact and must be accepted
  assertEquals(parseAmountToPaise("10000000.01").paise, 1000000001);
});

Deno.test("parseAmountToPaise: rejects invalid inputs without silent rounding", () => {
  // 10.005 -> reject
  assertEquals(!!parseAmountToPaise(10.005).error, true);
  assertEquals(!!parseAmountToPaise("10.005").error, true);
  
  // 0 -> reject
  assertEquals(!!parseAmountToPaise(0).error, true);
  assertEquals(!!parseAmountToPaise("0").error, true);
  assertEquals(!!parseAmountToPaise("0.00").error, true);
  
  // negative -> reject
  assertEquals(!!parseAmountToPaise(-10.5).error, true);
  assertEquals(!!parseAmountToPaise("-10.5").error, true);
  
  // malformed decimal -> reject
  assertEquals(!!parseAmountToPaise("10.5.5").error, true);
  assertEquals(!!parseAmountToPaise("abc").error, true);
  assertEquals(!!parseAmountToPaise("10,50").error, true);
  
  // extremely large value -> reject before DB call (one unit beyond JS max safe int)
  // Max safe int is 9007199254740991. One unit beyond is 9007199254740992.
  assertEquals(!!parseAmountToPaise("90071992547409.92").error, true);
});
