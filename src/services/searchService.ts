import { supabase } from '@/integrations/supabase/client';
import { mapDbProduct } from './productService';
import { cacheService, CACHE_TTL } from './cacheService';
import type { Product } from '@/types';

const SEARCH_HISTORY_KEY = 'nexus_search_history';
const MAX_HISTORY = 10;

export interface SearchFilters {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  minRating?: number;
}

export type SearchSortOption = 'relevance' | 'price-low' | 'price-high' | 'rating' | 'popularity' | 'newest';

export const searchService = {
  async searchProducts(
    query: string,
    filters: SearchFilters = {},
    sort: SearchSortOption = 'relevance',
    limit = 30
  ): Promise<Product[]> {
    const cacheKey = `search:${query}:${JSON.stringify(filters)}:${sort}:${limit}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.rpc('search_products', {
      p_query: query || null,
      p_category: filters.category || null,
      p_min_price: filters.priceMin ?? null,
      p_max_price: filters.priceMax ?? null,
      p_min_rating: filters.minRating ?? null,
      p_sort: sort,
      p_limit: limit,
    });

    if (error) {
      console.error('Search error:', error);
      return [];
    }

    const result = (data ?? []).map((row: any) => mapDbProduct(row));
    cacheService.set(cacheKey, result, CACHE_TTL.SEARCH);
    return result;
  },

  async getSearchSuggestions(query: string): Promise<{ suggestion: string; type: string }[]> {
    if (!query || query.length < 2) return [];

    const cacheKey = `suggestions:${query}`;
    const cached = cacheService.get<{ suggestion: string; type: string }[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.rpc('get_search_suggestions', {
      p_query: query,
      p_limit: 8,
    });

    if (error) {
      console.error('Suggestions error:', error);
      return [];
    }

    const result = (data ?? []).map((r: any) => ({
      suggestion: r.suggestion,
      type: r.suggestion_type,
    }));
    cacheService.set(cacheKey, result, CACHE_TTL.SUGGESTIONS);
    return result;
  },

  getSearchHistory(): string[] {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  saveSearchQuery(query: string): void {
    if (!query.trim()) return;
    const history = searchService.getSearchHistory().filter(q => q !== query);
    history.unshift(query);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  },

  clearSearchHistory(): void {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  },
};
