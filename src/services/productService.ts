import { supabase } from '@/integrations/supabase/client';
import { cacheService, CACHE_TTL } from './cacheService';
import type { Product } from '@/types';

// Maps a DB row to the frontend Product type
export function mapDbProduct(row: any): Product {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendors?.store_name ?? row.store_name ?? '',
    title: row.title,
    slug: row.slug,
    description: row.description ?? '',
    images: row.images ?? [],
    price: Number(row.price),
    discountPrice: row.discount_price ? Number(row.discount_price) : undefined,
    stock: row.stock,
    reservedStock: row.reserved_stock ?? 0,
    lowStockThreshold: row.low_stock_threshold ?? 5,
    category: row.category,
    rating: Number(row.rating ?? 0),
    reviewCount: row.review_count ?? 0,
    isSponsored: row.is_sponsored ?? false,
    createdAt: row.created_at,
    status: row.status ?? 'active',
    salesCount: row.sales_count ?? 0,
    viewCount: row.view_count ?? 0,
    trendingScore: Number(row.trending_score ?? 0),
    tags: row.tags ?? [],
    basePrice: row.base_price ? Number(row.base_price) : undefined,
    dynamicPrice: row.dynamic_price ? Number(row.dynamic_price) : undefined,
    demandScore: row.demand_score ? Number(row.demand_score) : undefined,
  };
}

export type SortOption = 'newest' | 'price-low' | 'price-high' | 'rating' | 'popularity' | 'relevance';

export const productService = {
  async getAll(options?: {
    category?: string;
    search?: string;
    limit?: number;
    sort?: SortOption;
    status?: string;
    sponsored?: boolean;
  }) {
    const cacheKey = `products:all:${JSON.stringify(options ?? {})}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    let query = supabase.from('products').select('*, vendors(store_name)');

    const status = options?.status ?? 'active';
    if (status !== 'all') query = query.eq('status', status);

    if (options?.category) query = query.eq('category', options.category);
    if (options?.search) query = query.ilike('title', `%${options.search}%`);
    if (options?.sponsored !== undefined) query = query.eq('is_sponsored', options.sponsored);
    if (options?.limit) query = query.limit(options.limit);

    const sort = options?.sort ?? 'newest';
    switch (sort) {
      case 'price-low':
        query = query.order('price', { ascending: true });
        break;
      case 'price-high':
        query = query.order('price', { ascending: false });
        break;
      case 'rating':
        query = query.order('rating', { ascending: false, nullsFirst: false });
        break;
      case 'popularity':
        query = query.order('review_count', { ascending: false, nullsFirst: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    const result = (data ?? []).map(mapDbProduct);
    cacheService.set(cacheKey, result, CACHE_TTL.HOMEPAGE);
    return result;
  },

  async getBySlug(slug: string) {
    const cacheKey = `product:slug:${slug}`;
    const cached = cacheService.get<Product>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('slug', slug)
      .single();
    if (error) throw error;
    const result = mapDbProduct(data);
    cacheService.set(cacheKey, result, CACHE_TTL.PRODUCT_DETAIL);
    return result;
  },

  async getByVendor(vendorId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDbProduct);
  },

  async getCategories() {
    const cacheKey = 'products:categories';
    const cached = cacheService.get<string[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('products')
      .select('category')
      .eq('status', 'active');
    if (error) throw error;
    const cats = [...new Set((data ?? []).map((r: any) => r.category))].filter(Boolean).sort() as string[];
    cacheService.set(cacheKey, cats, CACHE_TTL.HOMEPAGE);
    return cats;
  },

  async create(product: {
    vendor_id: string;
    title: string;
    slug: string;
    description: string;
    price: number;
    discount_price: number | null;
    stock: number;
    low_stock_threshold?: number;
    category: string;
    images: string[];
    status?: string;
  }) {
    const { data, error } = await supabase.from('products').insert(product).select('*, vendors(store_name)').single();
    if (error) throw error;
    cacheService.invalidatePattern('products:');
    cacheService.invalidatePattern('search:');
    cacheService.invalidatePattern('suggestions:');
    return mapDbProduct(data);
  },

  async update(id: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('*, vendors(store_name)').single();
    if (error) throw error;
    cacheService.invalidatePattern('products:');
    cacheService.invalidatePattern('product:');
    cacheService.invalidatePattern('search:');
    cacheService.invalidatePattern('suggestions:');
    cacheService.invalidatePattern('similar:');
    return mapDbProduct(data);
  },

  async remove(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    cacheService.invalidatePattern('products:');
    cacheService.invalidatePattern('product:');
    cacheService.invalidatePattern('search:');
    cacheService.invalidatePattern('suggestions:');
  },

  async uploadImage(file: File, userId: string): Promise<string> {
    const ext = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
    return urlData.publicUrl;
  },

  async getVendors() {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('verification_status', 'approved')
      .order('total_sales', { ascending: false })
      .limit(6);
    if (error) throw error;
    return data ?? [];
  },

  async getRanked(options?: { category?: string; search?: string; limit?: number }) {
    const cacheKey = `products:ranked:${JSON.stringify(options ?? {})}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.rpc('get_ranked_products', {
      p_limit: options?.limit ?? 20,
      p_category: options?.category ?? null,
      p_search: options?.search ?? null,
    });
    if (error) throw error;
    const result = (data ?? []).map((row: any) => mapDbProduct({ ...row, vendors: { store_name: row.store_name } }));
    cacheService.set(cacheKey, result, CACHE_TTL.HOMEPAGE);
    return result;
  },

  async getTrending(limit = 8) {
    const cacheKey = `products:trending:${limit}`;
    const cached = cacheService.get<Product[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.rpc('get_trending_products', { p_limit: limit });
    if (error) throw error;
    const result = (data ?? []).map((row: any) => mapDbProduct({ ...row, vendors: { store_name: row.store_name } }));
    cacheService.set(cacheKey, result, CACHE_TTL.TRENDING);
    return result;
  },
};
