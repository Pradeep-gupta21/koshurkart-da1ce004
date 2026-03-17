import { supabase } from '@/integrations/supabase/client';

export interface PricingRule {
  id: string;
  rule_name: string;
  high_demand_multiplier: number;
  low_demand_multiplier: number;
  low_stock_multiplier: number;
  high_stock_multiplier: number;
  max_increase_pct: number;
  max_decrease_pct: number;
  demand_threshold_high: number;
  demand_threshold_low: number;
  stock_threshold_high: number;
  stock_threshold_low: number;
  is_active: boolean;
  created_at: string;
}

export interface PricingSuggestion {
  productId: string;
  title: string;
  basePrice: number;
  currentPrice: number;
  dynamicPrice: number | null;
  demandScore: number;
  stock: number;
  reservedStock: number;
  reason: string;
}

function getSuggestionReason(demandScore: number, availableStock: number, rule: PricingRule): string {
  const reasons: string[] = [];
  if (demandScore >= rule.demand_threshold_high) reasons.push('High demand — price increase suggested');
  if (demandScore <= rule.demand_threshold_low) reasons.push('Low demand — price decrease suggested');
  if (availableStock <= rule.stock_threshold_low) reasons.push('Low stock — price increase suggested');
  if (availableStock >= rule.stock_threshold_high) reasons.push('High stock — price decrease suggested');
  return reasons.length > 0 ? reasons.join('. ') : 'Price is optimal';
}

export const pricingService = {
  async getPricingRules(): Promise<PricingRule[]> {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PricingRule[];
  },

  async updatePricingRule(id: string, updates: Partial<PricingRule>) {
    const { data, error } = await supabase
      .from('pricing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as PricingRule;
  },

  async createPricingRule(rule: Partial<PricingRule>) {
    const { data, error } = await supabase
      .from('pricing_rules')
      .insert([rule as any])
      .select()
      .single();
    if (error) throw error;
    return data as PricingRule;
  },
    if (error) throw error;
    return data as PricingRule;
  },

  async recalculatePrices() {
    const { error } = await supabase.rpc('calculate_dynamic_prices');
    if (error) throw error;
  },

  async getPricingSuggestions(vendorId: string): Promise<PricingSuggestion[]> {
    const [{ data: products, error: pErr }, { data: rules, error: rErr }] = await Promise.all([
      supabase
        .from('products')
        .select('id, title, base_price, price, dynamic_price, demand_score, stock, reserved_stock')
        .eq('vendor_id', vendorId)
        .eq('status', 'active'),
      supabase
        .from('pricing_rules')
        .select('*')
        .eq('is_active', true)
        .limit(1),
    ]);
    if (pErr) throw pErr;
    if (rErr) throw rErr;

    const rule = (rules?.[0] as PricingRule) ?? null;
    if (!rule) return [];

    return (products ?? []).map((p: any) => {
      const available = p.stock - (p.reserved_stock ?? 0);
      return {
        productId: p.id,
        title: p.title,
        basePrice: Number(p.base_price ?? p.price),
        currentPrice: Number(p.price),
        dynamicPrice: p.dynamic_price ? Number(p.dynamic_price) : null,
        demandScore: Number(p.demand_score ?? 0),
        stock: p.stock,
        reservedStock: p.reserved_stock ?? 0,
        reason: getSuggestionReason(Number(p.demand_score ?? 0), available, rule),
      };
    }).filter((s) => s.dynamicPrice !== null && Math.abs(s.dynamicPrice - s.basePrice) > 0.01);
  },
};
