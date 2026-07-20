import { IOrderService } from '../../interfaces/IOrderService';
import { Result, CommerceError } from '../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseOrderService implements IOrderService {
  async createOrder(customerId: string, cartId: string, paymentDetails: any): Promise<Result<any, CommerceError>> {
    try {
      // In this architecture, a cart is an order with status 'draft'.
      // Creating an order means updating the draft to 'pending'.
      const { data, error } = await supabase
        .from('orders')
        .update({
          order_status: 'pending',
          payment_status: paymentDetails?.status || 'pending',
        })
        .eq('id', cartId)
        .eq('user_id', customerId)
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

  async getOrder(orderId: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      if (!data) {
        return { success: false, error: { code: 'not_found', message: 'Order not found' } };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async getCustomerOrders(customerId: string): Promise<Result<any[], CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', customerId)
        .neq('order_status', 'draft') // Exclude draft carts
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: data || [] };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async cancelOrder(orderId: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ order_status: 'cancelled' })
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      if (!data) {
        return { success: false, error: { code: 'not_found', message: 'Order not found' } };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }
}
