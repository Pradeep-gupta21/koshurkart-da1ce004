/**
 * Shared CORS configuration for all Supabase Edge Functions.
 * Origin allowlist replaces the previous wildcard `*` (audit C-2).
 */
const ALLOWED_ORIGINS = [
  "https://koshurkart.com",
  "https://www.koshurkart.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

const PRIMARY_ORIGIN = "https://koshurkart.com";

const CORS_HEADERS_VALUE =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * Build CORS headers scoped to the request's `Origin` header.
 * Falls back to the primary production origin for non-browser callers.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": CORS_HEADERS_VALUE,
    "Vary": "Origin",
  };
}

/**
 * @deprecated — use `getCorsHeaders(req)` instead. Kept temporarily for
 * edge functions that import the old named export. Will be removed once
 * all call-sites pass the Request object.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": PRIMARY_ORIGIN,
  "Access-Control-Allow-Headers": CORS_HEADERS_VALUE,
};
