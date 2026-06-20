import { supabase } from '@/integrations/supabase/client';

export const platformSettings = {
  commissionEnabled: false,
  commissionPercentage: 0,
  merchantUpiId: 'merchant@upi',
  merchantName: 'KoshurKart',
};

export interface CommissionSettings {
  enabled: boolean;
  percentage: number;
}

export interface PaymentMethodSettings {
  razorpayEnabled: boolean;
  upiEnabled: boolean;
  merchantUpiId: string;
  merchantName: string;
}

export async function fetchPlatformSettings(): Promise<CommissionSettings> {
  try {
    const { data, error } = await (supabase
      .from('platform_settings' as any)
      .select('value')
      .eq('key', 'commission')
      .single() as any);

    if (!error && data?.value) {
      return {
        enabled: data.value.enabled ?? false,
        percentage: data.value.percentage ?? 0,
      };
    }
  } catch {
    // fallback to defaults
  }
  return { enabled: platformSettings.commissionEnabled, percentage: platformSettings.commissionPercentage };
}

export async function fetchPaymentMethodSettings(): Promise<PaymentMethodSettings> {
  try {
    const { data, error } = await (supabase
      .from('platform_settings' as any)
      .select('value')
      .eq('key', 'payment_methods')
      .single() as any);

    if (!error && data?.value) {
      return {
        razorpayEnabled: data.value.razorpayEnabled ?? true,
        upiEnabled: data.value.upiEnabled ?? true,
        merchantUpiId: data.value.merchantUpiId ?? platformSettings.merchantUpiId,
        merchantName: data.value.merchantName ?? platformSettings.merchantName,
      };
    }
  } catch {
    // fallback to defaults
  }
  return {
    razorpayEnabled: true,
    upiEnabled: true,
    merchantUpiId: platformSettings.merchantUpiId,
    merchantName: platformSettings.merchantName,
  };
}

export function calculateCommission(amount: number, settings?: CommissionSettings) {
  const enabled = settings?.enabled ?? platformSettings.commissionEnabled;
  const percentage = settings?.percentage ?? platformSettings.commissionPercentage;

  if (!enabled || percentage <= 0) {
    return { commission: 0, vendorEarnings: amount };
  }
  const commission = amount * (percentage / 100);
  return { commission, vendorEarnings: amount - commission };
}
