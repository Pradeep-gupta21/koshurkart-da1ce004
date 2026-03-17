import { supabase } from '@/integrations/supabase/client';
import { mapDbProduct } from './productService';
import { productService } from './productService';
import { cacheService } from './cacheService';
import type { Product } from '@/types';

/* ------------------------------------------------------------------ */
/*  Scoring weights — easy to tweak or replace with ML later           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  User behavior profile                                              */
/* ------------------------------------------------------------------ */

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

  // Find top category
  const topCategory = Object.entries(categoryWeights)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Last viewed product
  const lastViewedId = allEvents.find(e => e.event_type === 'product_view')?.product_id;
  const lastViewedData = lastViewedId ? productMap.get(lastViewedId) : null;
  const lastViewedProduct = lastViewedData
    ? { id: lastViewedData.id, title: lastViewedData.title, category: lastViewedData.category, tags: lastViewedData.tags ?? [] }
    : null;

  return { categoryWeights, tagWeights, viewedProductIds, lastViewedProduct, topCategory };
}

/* ------------------------------------------------------------------ */
/*  Scoring functions                                                  */
/* ------------------------------------------------------------------ */

function calculateSimilarityScore(
  product: Product,
  profile: UserBehaviorProfile,
): number {
  if (Object.keys(profile.categoryWeights).length === 0) return 0;

  const maxCatWeight = Math.max(...Object.values(profile.categoryWeights), 1);
  const categoryScore = (profile.categoryWeights[product.category] || 0) / maxCatWeight;

  // Tag overlap (Jaccard-like)
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

function calculateProductScore(
  product: Product,
  profile: UserBehaviorProfile,
  maxPopularity: number,
): number {
  return (
    WEIGHTS.SIMILARITY * calculateSimilarityScore(product, profile) +
    WEIGHTS.POPULARITY * calculatePopularityScore(product, maxPopularity) +
    WEIGHTS.USER_BEHAVIOR * calculateBehaviorScore(product, profile) +
    WEIGHTS.RECENCY * calculateRecencyScore(product)
  );
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const aiRecommendationService = {
  /**
   * Smart recommendations scored by composite model.
   * Falls back to trending for unauthenticated / no-history users.
   */
  async getSmartRecommendations(userId: string, limit = 8): Promise<Product[]> {
    const cacheKey = `ai-rec:${userId}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const profile = await getUserBehaviorProfile(userId);

    // If no behavior data, fallback to trending
    if (Object.keys(profile.categoryWeights).length === 0) {
      return productService.getTrending(limit);
    }

    // Fetch candidate products (active, not already viewed)
    const { data: candidates } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('status', 'active')
      .order('trending_score', { ascending: false })
      .limit(100);

    const products = (candidates ?? []).map(mapDbProduct);

    // Filter out already-viewed and compute max popularity
    const unseen = products.filter(p => !profile.viewedProductIds.has(p.id));
    const pool = unseen.length >= limit ? unseen : products; // fallback to all if not enough unseen
    const maxPopularity = Math.max(...pool.map(p => p.salesCount + p.viewCount + p.trendingScore), 1);

    // Score and rank
    const scored = pool
      .map(p => ({ product: p, score: calculateProductScore(p, profile, maxPopularity) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.product);

    cacheService.set(cacheKey, scored, SMART_REC_CACHE_TTL);
    return scored;
  },

  /**
   * "Because you viewed [Product]" — products similar to the last viewed item.
   * Returns { contextProduct, products } or null if no view history.
   */
  async getBecauseYouViewed(
    userId: string,
    limit = 4,
  ): Promise<{ contextProductTitle: string; products: Product[] } | null> {
    const profile = await getUserBehaviorProfile(userId);
    if (!profile.lastViewedProduct) return null;

    const { id, title, category, tags } = profile.lastViewedProduct;

    let query = supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('status', 'active')
      .eq('category', category)
      .neq('id', id)
      .order('trending_score', { ascending: false })
      .limit(20);

    const { data } = await query;
    let candidates = (data ?? []).map(mapDbProduct);

    // Re-rank by tag overlap
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
    if (products.length === 0) return null;

    return { contextProductTitle: title, products };
  },

  /**
   * Popular products in a specific category, ranked by composite popularity.
   */
  async getPopularInCategory(category: string, limit = 8): Promise<Product[]> {
    const cacheKey = `popular-cat:${category}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const { data } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('status', 'active')
      .eq('category', category)
      .order('sales_count', { ascending: false })
      .order('trending_score', { ascending: false })
      .limit(limit);

    const result = (data ?? []).map(mapDbProduct);
    cacheService.set(cacheKey, result, SMART_REC_CACHE_TTL);
    return result;
  },

  /**
   * AI-scored similar products for a product detail page.
   * Uses category + tag overlap + popularity scoring instead of simple rating sort.
   */
  async getScoredSimilarProducts(productId: string, limit = 4): Promise<Product[]> {
    const cacheKey = `ai-similar:${productId}`;
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
      .limit(20);

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
    cacheService.set(cacheKey, result, 300);
    return result;
  },

  /** Expose profile builder for future ML integration */
  getUserBehaviorProfile,

  /** Expose scoring function for future ML integration */
  calculateProductScore,
};
