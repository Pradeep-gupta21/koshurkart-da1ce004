import { IProductService } from '../../../interfaces/IProductService';
import { Result, CommerceError } from '../../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseProductService implements IProductService {
  async getProductById(id: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return {
          success: false,
          error: {
            code: 'database_error',
            message: error.message,
          },
        };
      }

      if (!data) {
        return {
          success: false,
          error: {
            code: 'not_found',
            message: `Product with id ${id} not found`,
          },
        };
      }

      return {
        success: true,
        data,
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

  async searchProducts(query: string, filters?: any): Promise<Result<any[], CommerceError>> {
    try {
      let queryBuilder = supabase.from('products').select('*');

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
        data: data ?? [],
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

  async getProductsByCategory(categoryId: string): Promise<Result<any[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', categoryId);

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
        data: data ?? [],
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