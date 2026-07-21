import { supabase } from '@/integrations/supabase/client';
import { getVendorCommissionPercentage, calculateVendorEarnings, calculatePlatformCommission } from '@/shared/commission';

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

// Phase 2: Frontend display delegates to the shared commission module.
// Phase 3: Payment lifecycle code will adopt the same module.
export function calculateCommission(amount: number) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount) || amount < 0) {
    throw new Error('amount must be a positive finite number');
  }

  const amountPaise = Math.round(amount * 100);
  const commissionPercentage = getVendorCommissionPercentage(undefined);
  const vendorEarningsPaise = calculateVendorEarnings(amountPaise, commissionPercentage);
  const commissionPaise = calculatePlatformCommission(amountPaise, vendorEarningsPaise);

  return {
    commission: commissionPaise / 100,
    vendorEarnings: vendorEarningsPaise / 100,
  };
}
