import { IProductService, ProductSortOption } from '../../../interfaces/IProductService';
import { Result, CommerceError } from '../../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';
import { Product } from '@/types';
import { cacheService } from '@/services/cacheService';

export const CACHE_TTL = {
  HOMEPAGE: 5 * 60 * 1000,
  PRODUCT_DETAIL: 15 * 60 * 1000,
  TRENDING: 10 * 60 * 1000,
};

// Maps a DB row to the frontend Product type
export function mapDbProduct(row: any): Product {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendors?.store_name ?? row.store_name ?? '',
    vendorPickupState: row.vendors?.pickup_state ?? row.pickup_state ?? null,
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
    allowCod: row.allow_cod ?? true,
  };
}

export class SupabaseProductService implements IProductService {
  async getProductById(id: string): Promise<Result<Product, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('id', id)
        .single();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }
      if (!data) {
        return { success: false, error: { code: 'not_found', message: `Product with id ${id} not found` } };
      }
      return { success: true, data: mapDbProduct(data) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getProductsByIds(ids: string[]): Promise<Result<Product[], CommerceError>> {
    try {
      if (!ids || ids.length === 0) return { success: true, data: [] };
      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .in('id', ids)
        .eq('status', 'active');
      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }
      return { success: true, data: (data ?? []).map(mapDbProduct) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async searchProducts(query: string, filters?: any): Promise<Result<Product[], CommerceError>> {
    try {
      let queryBuilder = supabase.from('products').select('*, vendors(store_name, pickup_state)');

      if (query) {
        queryBuilder = queryBuilder.ilike('title', `%${query}%`);
      }

      if (filters) {
        if (filters.category || filters.categoryId) {
          queryBuilder = queryBuilder.eq('category', filters.category || filters.categoryId);
        }
        if (filters.minPrice !== undefined) {
          queryBuilder = queryBuilder.gte('price', filters.minPrice);
        }
        if (filters.maxPrice !== undefined) {
          queryBuilder = queryBuilder.lte('price', filters.maxPrice);
        }
        if (filters.vendorId) {
          queryBuilder = queryBuilder.eq('vendorId', filters.vendorId);
        }
      }

      const { data, error } = await queryBuilder;

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: (data ?? []).map(mapDbProduct) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getProductsByCategory(categoryId: string): Promise<Result<Product[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('category', categoryId);

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: (data ?? []).map(mapDbProduct) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getAll(options?: {
    category?: string;
    search?: string;
    limit?: number;
    sort?: ProductSortOption;
    status?: string;
    sponsored?: boolean;
  }): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `products:all:${JSON.stringify(options ?? {})}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      let query = supabase.from('products').select('*, vendors(store_name, pickup_state)');

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
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      const result = (data ?? []).map(mapDbProduct);
      cacheService.set(cacheKey, result, CACHE_TTL.HOMEPAGE);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getBySlug(slug: string): Promise<Result<Product, CommerceError>> {
    try {
      const cacheKey = `product:slug:${slug}`;
      const cached = cacheService.get<Product>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('slug', slug)
        .single();
        
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      const result = mapDbProduct(data);
      cacheService.set(cacheKey, result, CACHE_TTL.PRODUCT_DETAIL);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getByVendor(vendorId: string, limit = 100): Promise<Result<Product[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, vendors(store_name, pickup_state)')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      return { success: true, data: (data ?? []).map(mapDbProduct) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getCategories(): Promise<Result<string[], CommerceError>> {
    try {
      const cacheKey = 'products:categories';
      const cached = cacheService.get<string[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data, error } = await supabase
        .from('products')
        .select('category')
        .eq('status', 'active');
        
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      const cats = [...new Set((data ?? []).map((r: any) => r.category))].filter(Boolean).sort() as string[];
      cacheService.set(cacheKey, cats, CACHE_TTL.HOMEPAGE);
      return { success: true, data: cats };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async create(product: any): Promise<Result<Product, CommerceError>> {
    try {
      const { data, error } = await supabase.from('products').insert(product).select('*, vendors(store_name, pickup_state)').single();
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      cacheService.invalidatePattern('products:');
      cacheService.invalidatePattern('search:');
      cacheService.invalidatePattern('suggestions:');
      return { success: true, data: mapDbProduct(data) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async update(id: string, updates: Record<string, unknown>): Promise<Result<Product, CommerceError>> {
    try {
      const { data, error } = await supabase.from('products').update(updates as never).eq('id', id).select('*, vendors(store_name, pickup_state)').single();
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      cacheService.invalidatePattern('products:');
      cacheService.invalidatePattern('product:');
      cacheService.invalidatePattern('search:');
      cacheService.invalidatePattern('suggestions:');
      cacheService.invalidatePattern('similar:');
      return { success: true, data: mapDbProduct(data) };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async remove(id: string): Promise<Result<void, CommerceError>> {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      cacheService.invalidatePattern('products:');
      cacheService.invalidatePattern('product:');
      cacheService.invalidatePattern('search:');
      cacheService.invalidatePattern('suggestions:');
      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async uploadImage(file: File, userId: string): Promise<Result<string, CommerceError>> {
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file);
      if (error) return { success: false, error: { code: 'upload_error', message: error.message } };
      
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      return { success: true, data: urlData.publicUrl };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getVendors(): Promise<Result<any[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, user_id, store_name, store_slug, description, logo, banner, tagline, category, rating, review_rating, trust_score, is_verified, verification_status, pickup_city, pickup_state, pickup_country, total_sales, created_at')
        .eq('verification_status', 'approved')
        .order('total_sales', { ascending: false })
        .limit(6);
        
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      return { success: true, data: data ?? [] };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getRanked(options?: { category?: string; search?: string; limit?: number; userState?: string | null }): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `products:ranked:${JSON.stringify(options ?? {})}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data, error } = await supabase.rpc('get_ranked_products', {
        p_limit: options?.limit ?? 20,
        p_category: options?.category ?? null,
        p_search: options?.search ?? null,
        p_user_state: options?.userState ?? null,
      });
      
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      const result = (data ?? []).map((row: any) => mapDbProduct({
        ...row,
        vendors: { store_name: row.store_name, pickup_state: row.pickup_state },
      }));
      cacheService.set(cacheKey, result, CACHE_TTL.HOMEPAGE);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getTrending(limit = 8): Promise<Result<Product[], CommerceError>> {
    try {
      const cacheKey = `products:trending:${limit}`;
      const cached = cacheService.get<Product[]>(cacheKey);
      if (cached) return { success: true, data: cached };

      const { data, error } = await supabase.rpc('get_trending_products', { p_limit: limit });
      if (error) return { success: false, error: { code: 'database_error', message: error.message } };
      
      const result = (data ?? []).map((row: any) => mapDbProduct({
        ...row,
        vendors: { store_name: row.store_name, pickup_state: row.pickup_state },
      }));
      cacheService.set(cacheKey, result, CACHE_TTL.TRENDING);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }
}