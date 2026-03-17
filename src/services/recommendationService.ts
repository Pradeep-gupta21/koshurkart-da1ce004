import { supabase } from '@/integrations/supabase/client';
import { mapDbProduct } from './productService';
import { productService } from './productService';
import type { Product } from '@/types';

export const recommendationService = {
  /**
   * Personalized recommendations based on view history & purchases.
   * Falls back to trending products if no history exists.
   */
  async getPersonalizedRecommendations(userId: string, limit = 8): Promise<Product[]> {
    // 1. Get recently viewed product IDs
    const { data: viewEvents } = await supabase
      .from('analytics_events')
      .select('product_id')
      .eq('user_id', userId)
      .eq('event_type', 'product_view')
      .order('created_at', { ascending: false })
      .limit(20);

    const viewedIds = [...new Set((viewEvents ?? []).map(e => e.product_id).filter(Boolean))] as string[];

    // 2. Get purchased product IDs
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

    // 3. Get categories & tags from viewed/purchased products
    const seedIds = [...new Set([...viewedIds, ...purchasedIds])];
    if (seedIds.length === 0) {
      return productService.getTrending(limit);
    }

    const { data: seedProducts } = await supabase
      .from('products')
      .select('category, tags')
      .in('id', seedIds.slice(0, 30));

    const categories = [...new Set((seedProducts ?? []).map(p => p.category).filter(Boolean))];
    const tags = [...new Set((seedProducts ?? []).flatMap(p => (p.tags as string[]) ?? []))];

    // 4. Fetch recommendations matching categories, excluding already seen
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

    // If not enough results, pad with trending
    if (results.length < limit) {
      const trending = await productService.getTrending(limit - results.length);
      const existingIds = new Set(results.map(r => r.id));
      for (const t of trending) {
        if (!existingIds.has(t.id) && results.length < limit) {
          results.push(t);
        }
      }
    }

    return results;
  },

  /**
   * Products similar to a given product (same category or overlapping tags).
   */
  async getSimilarProducts(productId: string, limit = 4): Promise<Product[]> {
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

    return (data ?? []).map(mapDbProduct);
  },

  /**
   * Products frequently bought together with a given product.
   */
  async getFrequentlyBoughtTogether(productId: string, limit = 4): Promise<Product[]> {
    // Find orders that contain this product
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('product_id', productId)
      .limit(50);

    if (!orderItems || orderItems.length === 0) return [];

    const orderIds = [...new Set(orderItems.map(oi => oi.order_id))];

    // Find other products in those orders
    const { data: coItems } = await supabase
      .from('order_items')
      .select('product_id')
      .in('order_id', orderIds)
      .neq('product_id', productId);

    if (!coItems || coItems.length === 0) return [];

    // Count frequency
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

    return (data ?? []).map(mapDbProduct);
  },
};
