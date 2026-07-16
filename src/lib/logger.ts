import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight client-side logger.
 * - Writes to console.error always.
 * - Records `client_error` analytics event when authenticated (best-effort).
 * - Throttles duplicate (scope+msg) events to 1/minute to prevent flooding.
 */

const THROTTLE_MS = 60_000;
const recent = new Map<string, number>();

function throttled(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < THROTTLE_MS) return true;
  recent.set(key, now);
  // crude bound
  if (recent.size > 200) {
    const firstKey = recent.keys().next().value;
    if (firstKey) recent.delete(firstKey);
  }
  return false;
}

function safeMeta(meta: unknown): Record<string, unknown> {
  if (!meta) return {};
  if (meta instanceof Error) return { name: meta.name, message: meta.message, stack: meta.stack };
  if (typeof meta === "object") return meta as Record<string, unknown>;
  return { value: String(meta) };
}

export const logger = {
  error(scope: string, msg: string, meta?: unknown) {
    // Always log locally
    // eslint-disable-next-line no-console
    console.error(`[${scope}] ${msg}`, meta ?? "");

    const key = `${scope}::${msg}`;
    if (throttled(key)) return;

    // Best-effort analytics (silent on failure — no recursion into logger)
    void (async () => {
      try {
        await supabase.rpc("record_analytics_event" as any, {
          _event_type: "client_error",
          _metadata: { scope, msg, ...safeMeta(meta) },
        });
      } catch {
        /* swallow */
      }
    })();
  },

  warn(scope: string, msg: string, meta?: unknown) {
    // Always log locally
    // eslint-disable-next-line no-console
    console.warn(`[${scope}] ${msg}`, meta ?? "");

    const key = `${scope}::${msg}`;
    if (throttled(key)) return;

    // Best-effort analytics (silent on failure — no recursion into logger)
    void (async () => {
      try {
        await supabase.rpc("record_analytics_event" as any, {
          _event_type: "client_warning",
          _metadata: { scope, msg, ...safeMeta(meta) },
        });
      } catch {
        /* swallow */
      }
    })();
  },

  /** Test helper — clears the throttle map. */
  _resetThrottle() {
    recent.clear();
  },
};
