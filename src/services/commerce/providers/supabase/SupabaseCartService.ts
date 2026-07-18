import { ICartService } from '../../../interfaces/ICartService';
import { Result, CommerceError } from '../../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseCartService implements ICartService {
  async getCart(customerId: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: data || { order_items: [] } };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async addToCart(customerId: string, productId: string, quantity: number): Promise<Result<any, CommerceError>> {
    try {
      // 1. Get or create draft order
      let { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();

      if (orderError) return { success: false, error: { code: 'database_error', message: orderError.message } };

      if (!order) {
        const { data: newOrder, error: createError } = await supabase
          .from('orders')
          .insert({
            user_id: customerId,
            order_status: 'draft',
            total_amount: 0,
          })
          .select('id')
          .single();

        if (createError) return { success: false, error: { code: 'database_error', message: createError.message } };
        order = newOrder;
      }

      // 2. Fetch product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('price, title, vendor_id, images')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        return { success: false, error: { code: 'not_found', message: 'Product not found' } };
      }

      // 3. Upsert into order_items
      const { data: existingItem } = await supabase
        .from('order_items')
        .select('id, quantity')
        .eq('order_id', order.id)
        .eq('product_id', productId)
        .maybeSingle();

      if (existingItem) {
        const { error: updateError } = await supabase
          .from('order_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('id', existingItem.id);

        if (updateError) return { success: false, error: { code: 'database_error', message: updateError.message } };
      } else {
        const { error: insertError } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            product_id: productId,
            quantity,
            price: product.price,
            title: product.title,
            vendor_id: product.vendor_id,
            image: product.images?.[0] || null,
          });

        if (insertError) return { success: false, error: { code: 'database_error', message: insertError.message } };
      }

      return { success: true, data: { orderId: order.id } };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async removeFromCart(customerId: string, productId: string): Promise<Result<any, CommerceError>> {
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();

      if (orderError) return { success: false, error: { code: 'database_error', message: orderError.message } };
      if (!order) return { success: true, data: null };

      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', order.id)
        .eq('product_id', productId);

      if (deleteError) return { success: false, error: { code: 'database_error', message: deleteError.message } };

      return { success: true, data: null };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async updateQuantity(customerId: string, productId: string, quantity: number): Promise<Result<any, CommerceError>> {
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();

      if (orderError) return { success: false, error: { code: 'database_error', message: orderError.message } };
      if (!order) return { success: false, error: { code: 'not_found', message: 'Cart not found' } };

      const { data: existingItem } = await supabase
        .from('order_items')
        .select('id')
        .eq('order_id', order.id)
        .eq('product_id', productId)
        .maybeSingle();

      if (!existingItem) {
        return { success: false, error: { code: 'not_found', message: 'Item not found in cart' } };
      }

      if (quantity <= 0) {
        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('id', existingItem.id);
        if (deleteError) return { success: false, error: { code: 'database_error', message: deleteError.message } };
      } else {
        const { error: updateError } = await supabase
          .from('order_items')
          .update({ quantity })
          .eq('id', existingItem.id);
        if (updateError) return { success: false, error: { code: 'database_error', message: updateError.message } };
      }

      return { success: true, data: null };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async clearCart(customerId: string): Promise<Result<void, CommerceError>> {
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();

      if (orderError) return { success: false, error: { code: 'database_error', message: orderError.message } };
      if (!order) return { success: true, data: undefined };

      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', order.id);

      if (deleteError) return { success: false, error: { code: 'database_error', message: deleteError.message } };

      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }
}
