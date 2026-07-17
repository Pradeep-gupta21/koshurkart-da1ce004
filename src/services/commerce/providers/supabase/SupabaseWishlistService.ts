import { IWishlistService } from '../../../interfaces/IWishlistService';
import { Result, CommerceError } from '../../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseWishlistService implements IWishlistService {
  async getWishlist(userId: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('wishlist_items')
        .select('*, products(*)')
        .eq('user_id', userId);

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: data || [] };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async addToWishlist(userId: string, productId: string): Promise<Result<any, CommerceError>> {
    try {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        return { success: false, error: { code: 'not_found', message: 'Product not found' } };
      }

      const { data: existing } = await supabase
        .from('wishlist_items')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle();

      if (existing) {
        return { success: true, data: existing };
      }

      const { data, error } = await supabase
        .from('wishlist_items')
        .insert({
          user_id: userId,
          product_id: productId,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async removeFromWishlist(userId: string, productId: string): Promise<Result<any, CommerceError>> {
    try {
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId);

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: null };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async isInWishlist(userId: string, productId: string): Promise<Result<boolean, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('wishlist_items')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: !!data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async clearWishlist(userId: string): Promise<Result<void, CommerceError>> {
    try {
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('user_id', userId);

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }
}
