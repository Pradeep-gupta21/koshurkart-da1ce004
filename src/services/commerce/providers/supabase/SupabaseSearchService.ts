import { ISearchService, SearchOptions, PaginatedResult } from '../../interfaces/ISearchService';
import { Result, CommerceError } from '../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';
import { Product } from '@/types';

export class SupabaseSearchService implements ISearchService {
  async searchProducts(
    query: string,
    options?: SearchOptions
  ): Promise<Result<PaginatedResult<Product>, CommerceError>> {
    try {
      let queryBuilder = supabase.from('products').select('*', { count: 'exact' });

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`);
      }

      if (options?.filters) {
        if (options.filters.category) {
          queryBuilder = queryBuilder.eq('category', options.filters.category);
        }
        if (options.filters.minPrice !== undefined) {
          queryBuilder = queryBuilder.gte('price', options.filters.minPrice);
        }
        if (options.filters.maxPrice !== undefined) {
          queryBuilder = queryBuilder.lte('price', options.filters.maxPrice);
        }
        if (options.filters.vendorId) {
          queryBuilder = queryBuilder.eq('vendor_id', options.filters.vendorId);
        }
      }

      if (options?.sortBy) {
        queryBuilder = queryBuilder.order(options.sortBy, {
          ascending: options.sortOrder !== 'desc'
        });
      }

      if (options?.page !== undefined && options?.limit !== undefined) {
        const from = (options.page - 1) * options.limit;
        const to = from + options.limit - 1;
        queryBuilder = queryBuilder.range(from, to);
      } else if (options?.limit !== undefined) {
        queryBuilder = queryBuilder.limit(options.limit);
      }

      const { data, error, count } = await queryBuilder;

      if (error) {
        return {
          success: false,
          error: {
            code: 'database_error',
            message: error.message,
          },
        };
      }

      return {
        success: true,
        data: {
          items: (data as unknown as Product[]) ?? [],
          total: count ?? 0,
          page: options?.page ?? 1,
          limit: options?.limit ?? (data?.length || 0)
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'unknown_error',
          message: err.message || 'An unknown error occurred',
        },
      };
    }
  }
}
