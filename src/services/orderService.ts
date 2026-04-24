import { supabase } from '@/integrations/supabase/client';

export const orderService = {
  /**
   * @deprecated Do NOT call from the client. Orders are now created server-side
   * by the `create-checkout` edge function, which re-prices items from the DB.
   * This method is kept only for tests/admin scripts.
   */
  async create(userId: string, totalAmount: number) {
    if (!Number.isFinite(totalAmount) || totalAmount < 1) {
      throw new Error('Order total must be at least ₹1');
    }
    const rounded = Math.round(totalAmount * 100) / 100;
    const { data, error } = await supabase
      .from('orders')
      .insert({ user_id: userId, total_amount: rounded })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * @deprecated Do NOT call from the client. Order items are now inserted
   * server-side by `create-checkout` with DB-derived prices.
   */
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

  async getShipmentEvents(orderId: string) {
    const { data, error } = await supabase
      .from('shipment_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async updateShipment(orderId: string, updates: {
    shipping_provider?: string;
    tracking_id?: string;
    shipping_status?: string;
    estimated_delivery?: string | null;
  }) {
    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);
    if (error) throw error;
  },

  async updateOrderStatus(orderId: string, updates: {
    order_status?: string;
    payment_status?: string;
  }) {
    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);
    if (error) throw error;
  },
};
