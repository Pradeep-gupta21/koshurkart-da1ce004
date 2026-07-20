import { IRecommendationService } from '../../interfaces/IRecommendationService';
import { Result, CommerceError } from '../../types/Result';
import { Product } from '@/types';
import { supabase } from '../../../../integrations/supabase/client';
import { cacheService, CACHE_TTL } from '../../../../services/cacheService';
import { mapDbProduct } from './SupabaseProductService';
import { ServiceFactory } from '../../di/ServiceFactory';

const WEIGHTS = {
  SIMILARITY: 0.4,
  POPULARITY: 0.3,
  USER_BEHAVIOR: 0.2,
  RECENCY: 0.1,
} as const;

const BEHAVIOR_WEIGHTS: Record<string, number> = {
  purchase: 4,
  add_to_cart: 3,
  product_view: 1,
};

const SMART_REC_CACHE_TTL = 180; // 3 minutes

interface UserBehaviorProfile {
  categoryWeights: Record<string, number>;
  tagWeights: Record<string, number>;
  viewedProductIds: Set<string>;
  lastViewedProduct: { id: string; title: string; category: string; tags: string[] } | null;
  topCategory: string | null;
}

async function getUserBehaviorProfile(userId: string): Promise<UserBehaviorProfile> {
  const { data: events } = await supabase
    .from('analytics_events')
    .select('event_type, product_id')
    .eq('user_id', userId)
    .in('event_type', ['product_view', 'add_to_cart', 'purchase'])
    .order('created_at', { ascending: false })
    .limit(200);

  const allEvents = events ?? [];
  const productIds = [...new Set(allEvents.map(e => e.product_id).filter(Boolean))] as string[];
  const viewedProductIds = new Set(productIds);

  if (productIds.length === 0) {
    return { categoryWeights: {}, tagWeights: {}, viewedProductIds, lastViewedProduct: null, topCategory: null };
  }

  const { data: products } = await supabase
    .from('products')
    .select('id, category, tags, title')
    .in('id', productIds.slice(0, 50));

  const productMap = new Map((products ?? []).map(p => [p.id, p]));

  const categoryWeights: Record<string, number> = {};
  const tagWeights: Record<string, number> = {};

  for (const event of allEvents) {
    const prod = productMap.get(event.product_id!);
    if (!prod) continue;
    const weight = BEHAVIOR_WEIGHTS[event.event_type] ?? 1;

    categoryWeights[prod.category] = (categoryWeights[prod.category] || 0) + weight;
    for (const tag of prod.tags ?? []) {
      tagWeights[tag] = (tagWeights[tag] || 0) + weight;
    }
  }

  const topCategory = Object.entries(categoryWeights)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const lastViewedId = allEvents.find(e => e.event_type === 'product_view')?.product_id;
  const lastViewedData = lastViewedId ? productMap.get(lastViewedId) : null;
  const lastViewedProduct = lastViewedData
    ? { id: lastViewedData.id, title: lastViewedData.title, category: lastViewedData.category, tags: lastViewedData.tags ?? [] }
    : null;

  return { categoryWeights, tagWeights, viewedProductIds, lastViewedProduct, topCategory };
}

function calculateSimilarityScore(product: Product, profile: UserBehaviorProfile): number {
  if (Object.keys(profile.categoryWeights).length === 0) return 0;
  const maxCatWeight = Math.max(...Object.values(profile.categoryWeights), 1);
  const categoryScore = (profile.categoryWeights[product.category] || 0) / maxCatWeight;

  const userTags = Object.keys(profile.tagWeights);
  const productTags = product.tags ?? [];
  if (userTags.length === 0 || productTags.length === 0) return categoryScore * 100;

  const intersection = productTags.filter(t => profile.tagWeights[t]).length;
  const union = new Set([...userTags, ...productTags]).size;
  const tagScore = union > 0 ? intersection / union : 0;

  return ((categoryScore * 0.6 + tagScore * 0.4) * 100);
}

function calculatePopularityScore(product: Product, maxPopularity: number): number {
  const raw = product.salesCount + product.viewCount + product.trendingScore;
  return maxPopularity > 0 ? (raw / maxPopularity) * 100 : 0;
}

function calculateBehaviorScore(product: Product, profile: UserBehaviorProfile): number {
  const maxCatWeight = Math.max(...Object.values(profile.categoryWeights), 1);
  return ((profile.categoryWeights[product.category] || 0) / maxCatWeight) * 100;
}

function calculateRecencyScore(product: Product): number {
  const ageMs = Date.now() - new Date(product.createdAt).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 7) return 100;
  if (ageDays >= 90) return 0;
  return Math.max(0, 100 - ((ageDays - 7) / 83) * 100);
}

function calculateProductScore(product: Product, profile: UserBehaviorProfile, maxPopularity: number): number {
  return (
    WEIGHTS.SIMILARITY * calculateSimilarityScore(product, profile) +
    WEIGHTS.POPULARITY * calculatePopularityScore(product, maxPopularity) +
    WEIGHTS.USER_BEHAVIOR * calculateBehaviorScore(product, profile) +
    WEIGHTS.RECENCY * calculateRecencyScore(product)
  );
}

export class SupabaseRecommendationService implements IRecommendationService {
  async getRecommendedProducts(productId: string): Promise<Result<Product[], CommerceError>> {
    return this.getRelatedProducts(productId);
  }

  async getRelatedProducts(productId: string): Promise<Result<Product[], CommerceError>> {
    return this.getScoredSimilarProducts(productId, 4);
  }

  async getTrendingProducts(): Promise<Result<Product[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('trending_score', { ascending: false, nullsFirst: false })
        .limit(8);

      if (error) throw error;
      return { success: true, data: (data as any[]).map(mapDbProduct) };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getPopularProducts(): Promise<Result<Product[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('sales_count', { ascending: false, nullsFirst: false })
        .limit(8);

      if (error) throw error;
      return { success: true, data: (data as any[]).map(mapDbProduct) };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getPersonalizedRecommendations(customerId: string): Promise<Result<Product[], CommerceError>> {
    return this.getSmartRecommendations(customerId, 8);
  }

  // --- Advanced Methods ---

  async getRecentlyViewed(userId: string, limit = 10): Promise<Result<Product[], CommerceError>> {
    try {
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('product_id, created_at')
        .eq('user_id', userId)
        .eq('event_type', 'product_view')
        .not('product_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      const orderedIds: string[] = [];
      const seen = new Set<string>();
      for (const row of events ?? []) {
        const pid = row.product_id as string;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        orderedIds.push(pid);
        if (orderedIds.length >= limit) break;
      }
      return this.getProductsPreservingOrder(orderedIds);
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getProductsPreservingOrder(ids: string[]): Promise<Result<Product[], CommerceError>> {
    if (!ids.length) return { success: true, data: [] };
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .in('id', ids)
        .eq('status', 'active');
      if (error) throw error;

      const byId = new Map<string, Product>();
      for (const row of data ?? []) {
        const p = mapDbProduct(row);
        byId.set(p.id, p);
      }
      const products = ids.map((id) => byId.get(id)).filter(Boolean) as Product[];
      return { success: true, data: products };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getSmartRecommendations(userId: string, limit = 8): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `ai-rec:${userId}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const profile = await getUserBehaviorProfile(userId);

      if (Object.keys(profile.categoryWeights).length === 0) {
        return this.getTrendingProducts();
      }

      const { data: candidates, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('status', 'active')
        .order('trending_score', { ascending: false })
        .limit(100);

      if (error) throw error;

      const products = (candidates ?? []).map(mapDbProduct);
      const unseen = products.filter(p => !profile.viewedProductIds.has(p.id));
      const pool = unseen.length >= limit ? unseen : products; 
      const maxPopularity = Math.max(...pool.map(p => p.salesCount + p.viewCount + p.trendingScore), 1);

      const scored = pool
        .map(p => ({ product: p, score: calculateProductScore(p, profile, maxPopularity) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.product);

      cacheService.set(cacheKey, scored, SMART_REC_CACHE_TTL);
      return { success: true, data: scored };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getBecauseYouViewed(userId: string, limit = 4): Promise<Result<{ contextProductTitle: string; products: Product[] } | null, CommerceError>> {
    try {
      const profile = await getUserBehaviorProfile(userId);
      if (!profile.lastViewedProduct) return { success: true, data: null };

      const { id, title, category, tags } = profile.lastViewedProduct;

      let query = supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('status', 'active')
        .eq('category', category)
        .neq('id', id)
        .order('trending_score', { ascending: false })
        .limit(20);

      const { data, error } = await query;
      if (error) throw error;

      let candidates = (data ?? []).map(mapDbProduct);

      if (tags.length > 0) {
        candidates = candidates
          .map(p => {
            const overlap = (p.tags ?? []).filter(t => tags.includes(t)).length;
            return { p, overlap };
          })
          .sort((a, b) => b.overlap - a.overlap)
          .map(x => x.p);
      }

      const products = candidates.slice(0, limit);
      if (products.length === 0) return { success: true, data: null };

      return { success: true, data: { contextProductTitle: title, products } };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getPopularInCategory(category: string, limit = 8): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `popular-cat:${category}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('status', 'active')
        .eq('category', category)
        .order('sales_count', { ascending: false })
        .order('trending_score', { ascending: false })
        .limit(limit);

      if (error) throw error;
      const result = (data ?? []).map(mapDbProduct);
      cacheService.set(cacheKey, result, SMART_REC_CACHE_TTL);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getScoredSimilarProducts(productId: string, limit = 4): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `ai-similar:${productId}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data: source, error: sourceError } = await supabase
        .from('products')
        .select('category, tags')
        .eq('id', productId)
        .single();

      if (sourceError || !source) return { success: true, data: [] };

      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('status', 'active')
        .eq('category', source.category)
        .neq('id', productId)
        .limit(20);

      if (error) throw error;

      const candidates = (data ?? []).map(mapDbProduct);
      const sourceTags = source.tags ?? [];
      const maxPop = Math.max(...candidates.map(p => p.salesCount + p.viewCount + p.trendingScore), 1);

      const scored = candidates.map(p => {
        const tagOverlap = sourceTags.length > 0
          ? (p.tags ?? []).filter(t => sourceTags.includes(t)).length / Math.max(new Set([...sourceTags, ...(p.tags ?? [])]).size, 1)
          : 0;
        const popScore = (p.salesCount + p.viewCount + p.trendingScore) / maxPop;
        const recency = calculateRecencyScore(p) / 100;
        const score = 0.4 * tagOverlap + 0.35 * popScore + 0.15 * (p.rating / 5) + 0.1 * recency;
        return { product: p, score };
      });

      const result = scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.product);
      cacheService.set(cacheKey, result, CACHE_TTL.SIMILAR);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }

  async getFrequentlyBoughtTogether(productId: string, limit = 4): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `fbt:${productId}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data: orderItems, error: oiError } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('product_id', productId)
        .limit(50);

      if (oiError || !orderItems || orderItems.length === 0) return { success: true, data: [] };

      const orderIds = [...new Set(orderItems.map(oi => oi.order_id))];

      const { data: coItems, error: coError } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds)
        .neq('product_id', productId);

      if (coError || !coItems || coItems.length === 0) return { success: true, data: [] };

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

      if (topIds.length === 0) return { success: true, data: [] };

      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .in('id', topIds)
        .eq('status', 'active');

      if (error) throw error;

      const result = (data ?? []).map(mapDbProduct);
      cacheService.set(cacheKey, result, CACHE_TTL.FBT);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: "error", message: err?.message || "Unknown error" } };
    }
  }
}
