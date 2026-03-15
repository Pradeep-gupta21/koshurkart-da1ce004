import { supabase } from '@/integrations/supabase/client';

export const orderService = {
  async create(userId: string, totalAmount: number) {
    const { data, error } = await supabase
      .from('orders')
      .insert({ user_id: userId, total_amount: totalAmount })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addItems(orderId: string, items: { title: string; price: number; quantity: number; product_id?: string; vendor_id?: string; image?: string }[]) {
    const rows = items.map(item => ({ order_id: orderId, ...item }));
    const { error } = await supabase.from('order_items').insert(rows);
    if (error) throw error;
  },

  async getUserOrders(userId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getVendorOrderItems(vendorId: string, limit = 10) {
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};
