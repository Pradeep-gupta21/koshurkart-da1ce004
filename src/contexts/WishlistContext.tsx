import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { analyticsService } from "@/services/analyticsService";
import { toast } from "sonner";

const GUEST_KEY = "koshur_kart_guest_wishlist";

interface WishlistContextValue {
  ids: Set<string>;
  count: number;
  loading: boolean;
  isWishlisted: (productId: string) => boolean;
  toggle: (
    productId: string,
    meta?: { vendorId?: string; category?: string }
  ) => Promise<void>;
  add: (productId: string, meta?: { vendorId?: string; category?: string }) => Promise<void>;
  remove: (productId: string, meta?: { vendorId?: string; category?: string }) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

function readGuest(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeGuest(ids: string[]) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* ignore */
  }
}

function trackWishlistEvent(
  eventType: "wishlist_add" | "wishlist_remove" | "wishlist_view",
  productId?: string,
  meta?: { vendorId?: string; category?: string }
) {
  // Reuse existing analytics infra; cast since the helper's union is narrow.
  (analyticsService.trackEvent as any)(eventType, productId, undefined, meta ?? {});
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [ids, setIds] = useState<Set<string>>(() => new Set(readGuest()));
  const [loading, setLoading] = useState(false);
  const mergedRef = useRef<string | null>(null);

  // Sync from Supabase on sign-in; merge guest list once per session-user.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      if (!user) {
        // Signed out: revert to guest storage
        setIds(new Set(readGuest()));
        mergedRef.current = null;
        return;
      }

      setLoading(true);
      try {
        // Merge guest IDs once per user
        if (mergedRef.current !== user.id) {
          const guestIds = readGuest();
          if (guestIds.length > 0) {
            const rows = guestIds.map((pid) => ({ user_id: user.id, product_id: pid }));
            await supabase
              .from("wishlist_items")
              .upsert(rows, { onConflict: "user_id,product_id", ignoreDuplicates: true });
            localStorage.removeItem(GUEST_KEY);
          }
          mergedRef.current = user.id;
        }

        const { data } = await supabase
          .from("wishlist_items")
          .select("product_id")
          .eq("user_id", user.id);
        if (!cancelled) setIds(new Set((data ?? []).map((r) => r.product_id as string)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const isWishlisted = useCallback((pid: string) => ids.has(pid), [ids]);

  const add = useCallback(
    async (productId: string, meta?: { vendorId?: string; category?: string }) => {
      if (ids.has(productId)) return;
      // Optimistic
      setIds((prev) => new Set(prev).add(productId));

      if (!user) {
        const next = [...readGuest(), productId];
        writeGuest(next);
        trackWishlistEvent("wishlist_add", productId, meta);
        return;
      }

      const { error } = await supabase
        .from("wishlist_items")
        .insert({ user_id: user.id, product_id: productId });
      if (error && error.code !== "23505") {
        // rollback
        setIds((prev) => {
          const n = new Set(prev);
          n.delete(productId);
          return n;
        });
        toast.error("Couldn't save to wishlist. Please try again.");
        return;
      }
      trackWishlistEvent("wishlist_add", productId, meta);
    },
    [ids, user]
  );

  const remove = useCallback(
    async (productId: string, meta?: { vendorId?: string; category?: string }) => {
      if (!ids.has(productId)) return;
      setIds((prev) => {
        const n = new Set(prev);
        n.delete(productId);
        return n;
      });

      if (!user) {
        writeGuest(readGuest().filter((p) => p !== productId));
        trackWishlistEvent("wishlist_remove", productId, meta);
        return;
      }

      const { error } = await supabase
        .from("wishlist_items")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", productId);
      if (error) {
        setIds((prev) => new Set(prev).add(productId));
        toast.error("Couldn't remove from wishlist. Please try again.");
        return;
      }
      trackWishlistEvent("wishlist_remove", productId, meta);
    },
    [ids, user]
  );

  const toggle = useCallback(
    async (productId: string, meta?: { vendorId?: string; category?: string }) => {
      if (ids.has(productId)) await remove(productId, meta);
      else await add(productId, meta);
    },
    [ids, add, remove]
  );

  return (
    <WishlistContext.Provider
      value={{ ids, count: ids.size, loading, isWishlisted, toggle, add, remove }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
};
