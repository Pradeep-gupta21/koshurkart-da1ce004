import { IRecommendationService } from '../../interfaces/IRecommendationService';
import { Result, CommerceError } from '../../types/Result';
import { Product } from '@/types';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseRecommendationService implements IRecommendationService {
  async getRecommendedProducts(productId: string): Promise<Result<Product[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .neq('id', productId)
        .limit(4);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: (data as unknown as Product[]) ?? []
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async getRelatedProducts(productId: string): Promise<Result<Product[], CommerceError>> {
    try {
      const { data: source, error: sourceError } = await supabase
        .from('products')
        .select('category')
        .eq('id', productId)
        .single();
        
      if (sourceError && sourceError.code !== 'PGRST116') {
        return {
          success: false,
          error: { code: 'database_error', message: sourceError.message }
        };
      }

      let query = supabase.from('products').select('*').eq('status', 'active').neq('id', productId);
      if (source?.category) {
        query = query.eq('category', source.category);
      }
      
      const { data, error } = await query.limit(4);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: (data as unknown as Product[]) ?? []
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async getTrendingProducts(): Promise<Result<Product[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('trending_score', { ascending: false, nullsFirst: false })
        .limit(8);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: (data as unknown as Product[]) ?? []
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
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

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: (data as unknown as Product[]) ?? []
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async getPersonalizedRecommendations(customerId: string): Promise<Result<Product[], CommerceError>> {
    try {
      // Basic implementation for now: fetch user's recent orders or trending
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: (data as unknown as Product[]) ?? []
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }
}
