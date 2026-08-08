import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Minimal mock to test the headers
const ALLOWED_ORIGINS = ["https://koshurkart.com"];
const PRIMARY_ORIGIN = "https://koshurkart.com";
const CORS_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";
const ALLOWED_METHODS = "POST, OPTIONS";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Vary": "Origin",
  };
}

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Allow": ALLOWED_METHODS } });
  
  return new Response("OK");
};

const reqOptions = new Request("http://localhost/", { method: "OPTIONS" });
const resOptions = await handler(reqOptions);
console.log("OPTIONS Headers:", Object.fromEntries(resOptions.headers.entries()));

const reqGet = new Request("http://localhost/", { method: "GET" });
const resGet = await handler(reqGet);
console.log("GET Headers:", Object.fromEntries(resGet.headers.entries()));
console.log("GET Status:", resGet.status);
