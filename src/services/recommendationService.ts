import { supabase } from '@/integrations/supabase/client';
import { mapDbProduct } from '@/services/commerce/providers/supabase/SupabaseProductService';
import { ServiceFactory } from '@/services/commerce/di/ServiceFactory';
import { cacheService, CACHE_TTL } from './cacheService';
import type { Product } from '@/types';

export const recommendationService = {
  /**
   * Returns the user's most-recently viewed active products, deduplicated and
   * ordered most-recent first. Reads from the existing analytics_events stream
   * (no new tracking tables). Caller is responsible for handling guest users
   * separately (see recentlyViewedStore).
   */
  async getRecentlyViewed(userId: string, limit = 10): Promise<Product[]> {
    const { data: events } = await supabase
      .from('analytics_events')
      .select('product_id, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'product_view')
      .not('product_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60);

    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const row of events ?? []) {
      const pid = row.product_id as string | null;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      orderedIds.push(pid);
      if (orderedIds.length >= limit) break;
    }
    return this.getProductsPreservingOrder(orderedIds);
  },

  /**
   * Fetches active products for the given IDs in a single query and returns
   * them in the same order as the input array. Inactive/deleted IDs are
   * silently dropped.
   */
  async getProductsPreservingOrder(ids: string[]): Promise<Product[]> {
    if (!ids.length) return [];
    const { data } = await supabase
      .from('products')
      .select('*, vendors(store_name, pickup_state)')
      .in('id', ids)
      .eq('status', 'active');
    const byId = new Map<string, Product>();
    for (const row of data ?? []) {
      const p = mapDbProduct(row);
      byId.set(p.id, p);
    }
    return ids.map((id) => byId.get(id)).filter(Boolean) as Product[];
  },

  async getPersonalizedRecommendations(userId: string, limit = 8): Promise<Product[]> {
    // No caching — user-specific and changes frequently
    const { data: viewEvents } = await supabase
      .from('analytics_events')
      .select('product_id')
      .eq('user_id', userId)
      .eq('event_type', 'product_view')
      .order('created_at', { ascending: false })
      .limit(20);

    const viewedIds = [...new Set((viewEvents ?? []).map(e => e.product_id).filter(Boolean))] as string[];

    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .limit(20);

    let purchasedIds: string[] = [];
    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds);
      purchasedIds = [...new Set((items ?? []).map(i => i.product_id).filter(Boolean))] as string[];
    }

    const seedIds = [...new Set([...viewedIds, ...purchasedIds])];
    if (seedIds.length === 0) {
      const result = await ServiceFactory.getProductService().getTrending(limit);
      return result.success ? result.data : [];
    }

    const { data: seedProducts } = await supabase
      .from('products')
      .select('category, tags')
      .in('id', seedIds.slice(0, 30));

    const categories = [...new Set((seedProducts ?? []).map(p => p.category).filter(Boolean))];

    const excludeIds = seedIds.slice(0, 50);
    let query = supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('status', 'active')
      .not('id', 'in', `(${excludeIds.join(',')})`)
      .order('trending_score', { ascending: false })
      .limit(limit);

    if (categories.length > 0) {
      query = query.in('category', categories);
    }

    const { data } = await query;
    const results = (data ?? []).map(mapDbProduct);

    if (results.length < limit) {
      const trendingResult = await ServiceFactory.getProductService().getTrending(limit - results.length);
      const trending = trendingResult.success ? trendingResult.data : [];
      const existingIds = new Set(results.map(r => r.id));
      for (const t of trending) {
        if (!existingIds.has(t.id) && results.length < limit) {
          results.push(t);
        }
      }
    }

    return results;
  },

  async getSimilarProducts(productId: string, limit = 4): Promise<Product[]> {
    const cacheKey = `similar:${productId}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const { data: source } = await supabase
      .from('products')
      .select('category, tags')
      .eq('id', productId)
      .single();

    if (!source) return [];

    const { data } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('status', 'active')
      .eq('category', source.category)
      .neq('id', productId)
      .order('rating', { ascending: false })
      .order('sales_count', { ascending: false })
      .limit(limit);

    const result = (data ?? []).map(mapDbProduct);
    cacheService.set(cacheKey, result, CACHE_TTL.SIMILAR);
    return result;
  },

  async getFrequentlyBoughtTogether(productId: string, limit = 4): Promise<Product[]> {
    const cacheKey = `fbt:${productId}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('product_id', productId)
      .limit(50);

    if (!orderItems || orderItems.length === 0) return [];

    const orderIds = [...new Set(orderItems.map(oi => oi.order_id))];

    const { data: coItems } = await supabase
      .from('order_items')
      .select('product_id')
      .in('order_id', orderIds)
      .neq('product_id', productId);

    if (!coItems || coItems.length === 0) return [];

    const freq: Record<string, number> = {};
    for (const item of coItems) {
      if (item.product_id) {
        freq[item.product_id] = (freq[item.product_id] || 0) + 1;
      }
    }

    const topIds = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (topIds.length === 0) return [];

    const { data } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .in('id', topIds)
      .eq('status', 'active');

    const result = (data ?? []).map(mapDbProduct);
    cacheService.set(cacheKey, result, CACHE_TTL.FBT);
    return result;
  },
};
