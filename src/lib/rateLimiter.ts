type RateLimitRule = {
  maxAttempts: number;
  windowMs: number;
};

export const RATE_LIMIT_RULES = {
  loginAttempts: { maxAttempts: 5, windowMs: 15 * 60 * 1000 } as RateLimitRule,
  apiCalls: { maxAttempts: 60, windowMs: 60 * 1000 } as RateLimitRule,
  adClicks: { maxAttempts: 3, windowMs: 5 * 60 * 1000 } as RateLimitRule,
  otpSend: { maxAttempts: 3, windowMs: 10 * 60 * 1000 } as RateLimitRule,
  otpVerify: { maxAttempts: 5, windowMs: 5 * 60 * 1000 } as RateLimitRule,
};

type RateLimitEntry = {
  timestamps: number[];
};

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  rule: RateLimitRule
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < rule.windowMs);

  if (entry.timestamps.length >= rule.maxAttempts) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = rule.windowMs - (now - oldest);
    store.set(key, entry);
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return { allowed: true, retryAfterMs: 0 };
}

export function resetLimit(key: string): void {
  store.delete(key);
}

export function formatRetryTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}
