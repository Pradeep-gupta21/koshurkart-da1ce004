import { IReviewService } from '../../interfaces/IReviewService';
import { Result, CommerceError } from '../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseReviewService implements IReviewService {
  async getReviewsByProductId(productId: string): Promise<Result<any[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', productId);

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

  async getReviewById(id: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('reviews')
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
            message: `Review with id ${id} not found`,
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

  async createReview(review: any): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .insert(review)
        .select()
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

  async updateReview(id: string, review: any): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .update(review)
        .eq('id', id)
        .select()
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

  async deleteReview(id: string): Promise<Result<void, CommerceError>> {
    try {
      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', id);

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
        data: undefined as any,
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
