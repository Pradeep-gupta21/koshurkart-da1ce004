import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { ServiceFactory } from '@/services/commerce/di/ServiceFactory';
import { recentlyViewedStore } from '@/lib/recentlyViewedStore';
import type { Product } from '@/types';

interface UseRecentlyViewedResult {
  products: Product[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Returns the current viewer's recently-viewed products.
 * - Authenticated users: reads from analytics_events via recommendationService.
 * - Guests: reads product IDs from localStorage (kk_recently_viewed) and
 *   hydrates them through the existing product fetch path.
 */
export function useRecentlyViewed(limit = 10): UseRecentlyViewedResult {
  const { user } = useAuth();

  // Guest IDs from localStorage. Re-read on storage changes from other tabs.
  const [guestIds, setGuestIds] = useState<string[]>(() => recentlyViewedStore.get());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === recentlyViewedStore.KEY) setGuestIds(recentlyViewedStore.get());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const authedQuery = useQuery({
    queryKey: ['recently-viewed', 'authed', user?.id, limit],
    queryFn: async () => {
      const result = await ServiceFactory.getRecommendationService().getRecentlyViewed(user!.id, limit);
      if (!result.success) throw new Error((result as any).error?.message || "Error");
      return result.data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const guestQuery = useQuery({
    queryKey: ['recently-viewed', 'guest', guestIds.slice(0, limit).join(','), limit],
    queryFn: async () => {
      const result = await ServiceFactory.getRecommendationService().getProductsPreservingOrder(guestIds.slice(0, limit));
      if (!result.success) throw new Error((result as any).error?.message || "Error");
      return result.data;
    },
    enabled: !user?.id && guestIds.length > 0,
    staleTime: 60_000,
  });

  if (user?.id) {
    return {
      products: authedQuery.data ?? [],
      isLoading: authedQuery.isLoading,
      error: (authedQuery.error as Error) ?? null,
    };
  }

  return {
    products: guestQuery.data ?? [],
    isLoading: guestQuery.isLoading && guestIds.length > 0,
    error: (guestQuery.error as Error) ?? null,
  };
}
