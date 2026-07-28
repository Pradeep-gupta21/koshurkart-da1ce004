import { ICartService } from '../../interfaces/ICartService';
import { Result, CommerceError } from '../../types/Result';
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
    console.log(`[DEBUG] SupabaseCartService.addToCart START - customerId: ${customerId}, productId: ${productId} at ${new Date().toISOString()}`);
    try {
      // 1. Get or create draft order
      console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('orders').select('id') START at ${new Date().toISOString()}`);
      let { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();
      console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('orders').select('id') END at ${new Date().toISOString()}, error: ${!!orderError}`);

      if (orderError) {
        const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: orderError.message } };
        console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
        return res;
      }

      if (!order) {
        console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('orders').insert START at ${new Date().toISOString()}`);
        const { data: newOrder, error: createError } = await supabase
          .from('orders')
          .insert({
            user_id: customerId,
            order_status: 'draft',
            total_amount: 0,
          })
          .select('id')
          .single();
        console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('orders').insert END at ${new Date().toISOString()}, error: ${!!createError}`);

        if (createError) {
          const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: createError.message } };
          console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
          return res;
        }
        order = newOrder;
      }

      // 2. Fetch product details
      console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('products').select START at ${new Date().toISOString()}`);
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('price, title, vendor_id, images')
        .eq('id', productId)
        .single();
      console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('products').select END at ${new Date().toISOString()}, error: ${!!productError}`);

      if (productError || !product) {
        const res: Result<any, CommerceError> = { success: false, error: { code: 'not_found', message: 'Product not found' } };
        console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
        return res;
      }

      // 3. Upsert into order_items
      console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('order_items').select START at ${new Date().toISOString()}`);
      const { data: existingItem } = await supabase
        .from('order_items')
        .select('id, quantity')
        .eq('order_id', order.id)
        .eq('product_id', productId)
        .maybeSingle();
      console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('order_items').select END at ${new Date().toISOString()}`);

      if (existingItem) {
        console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('order_items').update START at ${new Date().toISOString()}`);
        const { error: updateError } = await supabase
          .from('order_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('id', existingItem.id);
        console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('order_items').update END at ${new Date().toISOString()}, error: ${!!updateError}`);

        if (updateError) {
          const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: updateError.message } };
          console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
          return res;
        }
      } else {
        console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('order_items').insert START at ${new Date().toISOString()}`);
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
        console.log(`[DEBUG] SupabaseCartService.addToCart await supabase.from('order_items').insert END at ${new Date().toISOString()}, error: ${!!insertError}`);

        if (insertError) {
          const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: insertError.message } };
          console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
          return res;
        }
      }

      const res: Result<any, CommerceError> = { success: true, data: { orderId: order.id } };
      console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
      return res;
    } catch (err: any) {
      console.log(`[DEBUG] SupabaseCartService.addToCart CATCH at ${new Date().toISOString()}, error:`, err);
      const res: Result<any, CommerceError> = { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
      console.log(`[DEBUG] SupabaseCartService.addToCart return at ${new Date().toISOString()}:`, res);
      return res;
    }
  }

  async removeFromCart(customerId: string, productId: string, quantity?: number): Promise<Result<any, CommerceError>> {
    console.log(`[DEBUG] SupabaseCartService.removeFromCart START - customerId: ${customerId}, productId: ${productId} at ${new Date().toISOString()}`);
    try {
      console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('orders').select('id') START at ${new Date().toISOString()}`);
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', customerId)
        .eq('order_status', 'draft')
        .maybeSingle();
      console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('orders').select('id') END at ${new Date().toISOString()}, error: ${!!orderError}`);

      if (orderError) {
        const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: orderError.message } };
        console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
        return res;
      }
      if (!order) {
        const res: Result<any, CommerceError> = { success: true, data: null };
        console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
        return res;
      }

      if (quantity !== undefined) {
        // Fetch current quantity
        console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('order_items').select START at ${new Date().toISOString()}`);
        const { data: existingItem } = await supabase
          .from('order_items')
          .select('id, quantity')
          .eq('order_id', order.id)
          .eq('product_id', productId)
          .maybeSingle();
        console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('order_items').select END at ${new Date().toISOString()}`);

        if (existingItem) {
          const newQuantity = existingItem.quantity - quantity;
          if (newQuantity > 0) {
            console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('order_items').update START at ${new Date().toISOString()}`);
            const { error: updateError } = await supabase
              .from('order_items')
              .update({ quantity: newQuantity })
              .eq('id', existingItem.id);
            console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('order_items').update END at ${new Date().toISOString()}, error: ${!!updateError}`);
            if (updateError) {
              const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: updateError.message } };
              console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
              return res;
            }
            const res: Result<any, CommerceError> = { success: true, data: null };
            console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
            return res;
          }
        }
      }

      // If quantity not provided or newQuantity <= 0, delete the item entirely
      console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('order_items').delete START at ${new Date().toISOString()}`);
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', order.id)
        .eq('product_id', productId);
      console.log(`[DEBUG] SupabaseCartService.removeFromCart await supabase.from('order_items').delete END at ${new Date().toISOString()}, error: ${!!deleteError}`);

      if (deleteError) {
        const res: Result<any, CommerceError> = { success: false, error: { code: 'database_error', message: deleteError.message } };
        console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
        return res;
      }

      const res: Result<any, CommerceError> = { success: true, data: null };
      console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
      return res;
    } catch (err: any) {
      console.log(`[DEBUG] SupabaseCartService.removeFromCart CATCH at ${new Date().toISOString()}, error:`, err);
      const res: Result<any, CommerceError> = { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
      console.log(`[DEBUG] SupabaseCartService.removeFromCart return at ${new Date().toISOString()}:`, res);
      return res;
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
