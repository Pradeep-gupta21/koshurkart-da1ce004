import { IInventoryService } from '../../interfaces/IInventoryService';
import { Result, CommerceError } from '../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseInventoryService implements IInventoryService {
  async getStockLevel(productId: string): Promise<Result<{ stock: number; reserved_stock: number }, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('stock, reserved_stock')
        .eq('id', productId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      if (!data) {
        return { success: false, error: { code: 'not_found', message: 'Product not found' } };
      }

      return { success: true, data: { stock: data.stock, reserved_stock: data.reserved_stock } };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async checkStockAvailability(productId: string, quantity: number): Promise<Result<boolean, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('stock, reserved_stock')
        .eq('id', productId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      if (!data) {
        return { success: false, error: { code: 'not_found', message: 'Product not found' } };
      }

      const availableStock = data.stock - data.reserved_stock;
      return { success: true, data: availableStock >= quantity };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async reserveInventory(productId: string, quantity: number): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase.rpc('reserve_stock', {
        p_product_id: productId,
        p_quantity: quantity,
      });

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async releaseReservedInventory(productId: string, quantity: number): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase.rpc('release_stock', {
        p_product_id: productId,
        p_quantity: quantity,
      });

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async updateStock(productId: string, newStock: number): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', productId)
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
}
