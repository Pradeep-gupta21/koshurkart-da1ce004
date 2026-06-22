// Lightweight localStorage cache of the user's most recently viewed product IDs.
// Used as the source for guest users and as a fast client-side fallback for
// authenticated users. Does NOT replace the existing analytics_events tracking.

const KEY = 'kk_recently_viewed';
const MAX = 10;

function safeRead(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function safeWrite(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* quota or disabled — ignore */
  }
}

export const recentlyViewedStore = {
  KEY,
  MAX,
  get(): string[] {
    return safeRead().slice(0, MAX);
  },
  push(productId: string) {
    if (!productId) return;
    const current = safeRead().filter((id) => id !== productId);
    current.unshift(productId);
    safeWrite(current.slice(0, MAX));
  },
  clear() {
    safeWrite([]);
  },
};
