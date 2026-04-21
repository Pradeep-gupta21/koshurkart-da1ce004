import { logger } from "./logger";

export interface RetryOptions {
  /** Number of total attempts. Default 3. */
  retries?: number;
  /** Backoff delays in ms between attempts. Default [0, 500, 1500]. */
  delaysMs?: number[];
  /** Predicate that returns true if the error is transient (worth retrying). */
  isTransient?: (err: unknown) => boolean;
  /** Scope label for logging. */
  scope?: string;
}

/** Heuristic: network errors and 5xx-shaped errors are transient. 4xx are not. */
export function defaultIsTransient(err: unknown): boolean {
  if (!err) return false;
  // Native fetch / DOM errors
  if (err instanceof TypeError) return true; // "Failed to fetch", network down
  const e = err as Record<string, unknown>;
  const name = String(e.name ?? "");
  if (name === "AbortError" || name === "TimeoutError" || name === "NetworkError") return true;

  // Supabase storage / postgrest error shapes carry status codes
  const status = Number(e.status ?? e.statusCode ?? (e as any).originalError?.status ?? 0);
  if (status >= 500 && status < 600) return true;
  if (status === 408 || status === 429) return true;

  // Common Supabase storage transient messages
  const msg = String(e.message ?? "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("temporarily")) return true;

  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` with exponential-ish backoff on transient errors only.
 * Non-transient errors (auth, validation, quota) bubble immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const delays = opts.delaysMs ?? [0, 500, 1500];
  const isTransient = opts.isTransient ?? defaultIsTransient;
  const scope = opts.scope ?? "withRetry";

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (delays[attempt]) await sleep(delays[attempt]);
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries - 1) {
        if (attempt > 0) {
          logger.error(scope, `failed after ${attempt + 1} attempts`, err);
        }
        throw err;
      }
      // Transient — log and retry
      // eslint-disable-next-line no-console
      console.warn(`[${scope}] transient error on attempt ${attempt + 1}, retrying…`, err);
    }
  }
  // Unreachable, but TypeScript can't see it
  throw lastErr;
}
