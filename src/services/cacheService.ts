interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** TTL constants in seconds */
export const CACHE_TTL = {
  HOMEPAGE: 300,
  TRENDING: 300,
  PRODUCT_DETAIL: 600,
  SEARCH: 120,
  SUGGESTIONS: 120,
  // Similar/FBT lists rarely change per product — keep cached for an hour
  SIMILAR: 3600,
  FBT: 3600,
} as const;

export const cacheService = {
  get<T>(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.data as T;
  },

  set(key: string, data: unknown, ttlSeconds: number): void {
    store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  },

  invalidate(key: string): void {
    store.delete(key);
  },

  invalidatePattern(prefix: string): void {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
  },

  clear(): void {
    store.clear();
  },

  /** Returns current cache size (useful for debugging) */
  get size() {
    return store.size;
  },
};
