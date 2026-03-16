import { supabase } from '@/integrations/supabase/client';

export const inventoryService = {
  async reserveStock(productId: string, quantity: number) {
    const { error } = await supabase.rpc('reserve_stock', {
      p_product_id: productId,
      p_quantity: quantity,
    });
    if (error) throw new Error(error.message);
  },

  async confirmStock(productId: string, quantity: number) {
    const { error } = await supabase.rpc('confirm_stock', {
      p_product_id: productId,
      p_quantity: quantity,
    });
    if (error) throw new Error(error.message);
  },

  async releaseStock(productId: string, quantity: number) {
    const { error } = await supabase.rpc('release_stock', {
      p_product_id: productId,
      p_quantity: quantity,
    });
    if (error) throw new Error(error.message);
  },

  async checkAvailability(productId: string, quantity: number): Promise<boolean> {
    const { data, error } = await supabase
      .from('products')
      .select('stock, reserved_stock')
      .eq('id', productId)
      .single();
    if (error || !data) return false;
    return (data.stock - data.reserved_stock) >= quantity;
  },
};
