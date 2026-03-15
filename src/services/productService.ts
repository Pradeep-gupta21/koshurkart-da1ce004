import { supabase } from '@/integrations/supabase/client';

export const productService = {
  async getAll(options?: { category?: string; search?: string; limit?: number }) {
    let query = supabase.from('products').select('*, vendors(store_name)');

    if (options?.category) query = query.eq('category', options.category);
    if (options?.search) query = query.ilike('title', `%${options.search}%`);
    if (options?.limit) query = query.limit(options.limit);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getBySlug(slug: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*, vendors(store_name)')
      .eq('slug', slug)
      .single();
    if (error) throw error;
    return data;
  },

  async getByVendor(vendorId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(product: {
    vendor_id: string;
    title: string;
    slug: string;
    description: string;
    price: number;
    discount_price: number | null;
    stock: number;
    category: string;
    images: string[];
  }) {
    const { data, error } = await supabase.from('products').insert(product).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  },
};
