import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageCompression';
import { maskAccountNumber } from '@/lib/validators/kycSchema';
import { withRetry } from '@/lib/retry';

export type KYCDocKind = 'pan' | 'address' | 'business';

export interface KYCSubmission {
  business_name: string;
  business_type: string;
  pan_number: string;
  gstin?: string;
  aadhaar_last4: string;
  bank_account_holder: string;
  bank_account_number: string; // raw — will be masked before persisting
  bank_ifsc: string;
  checkout_display_name: 'store' | 'bank';
}

// Columns on `vendors` that are safe for any reader (anon/authenticated).
// Sensitive columns (KYC, bank, financials, contact) are revoked at DB level
// and must be fetched through dedicated RPCs (get_my_vendor / get_vendor_admin).
export const VENDOR_PUBLIC_COLUMNS =
  'id, user_id, store_name, store_slug, description, logo, banner, tagline, category, ' +
  'rating, review_rating, trust_score, is_verified, verification_status, ' +
  'pickup_city, pickup_state, pickup_country, ' +
  'delivery_rate, cancellation_rate, return_rate, total_sales, created_at';

export const vendorService = {
  async getById(vendorId: string) {
    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_PUBLIC_COLUMNS)
      .eq('id', vendorId)
      .single();
    if (error) throw error;
    return data as any;
  },

  async getByUserId(userId: string) {
    const { data, error } = await supabase
      .from('vendors')
      .select(VENDOR_PUBLIC_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as any;
  },

  /** Returns the caller's own full vendor row (including KYC/bank/financials). */
  async getMine() {
    const { data, error } = await supabase.rpc('get_my_vendor');
    if (error) throw error;
    return (data?.[0] ?? null) as any;
  },

  /** Owner or admin: financial summary for one vendor. */
  async getFinancials(vendorId: string) {
    const { data, error } = await supabase.rpc('get_vendor_financials', { _vendor_id: vendorId });
    if (error) throw error;
    const row = (data?.[0] ?? null) as any;
    return {
      totalEarnings: Number(row?.total_earnings ?? 0),
      withdrawableBalance: Number(row?.withdrawable_balance ?? 0),
      totalSales: Number(row?.total_sales ?? 0),
    };
  },

  async update(vendorId: string, updates: { store_name?: string; description?: string; logo?: string }) {
    const { data, error } = await supabase.from('vendors').update(updates).eq('id', vendorId).select(VENDOR_PUBLIC_COLUMNS).single();
    if (error) throw error;
    return data as any;
  },

  async getProductCount(vendorId: string) {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId);
    if (error) throw error;
    return count ?? 0;
  },

  async getStats(vendorId: string) {
    const [prodRes, campaignRes, vendorRes] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId),
      supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId),
      supabase.from('vendors').select('total_sales').eq('id', vendorId).single(),
    ]);
    return {
      products: prodRes.count ?? 0,
      totalSales: vendorRes.data?.total_sales ?? 0,
      campaigns: campaignRes.count ?? 0,
    };
  },

  async getTrustMetrics(vendorId: string) {
    const { data, error } = await supabase
      .from('vendors')
      .select('trust_score, delivery_rate, cancellation_rate, return_rate, review_rating, is_verified')
      .eq('id', vendorId)
      .single();
    if (error) throw error;
    return {
      trustScore: Number(data?.trust_score ?? 0),
      deliveryRate: Number(data?.delivery_rate ?? 100),
      cancellationRate: Number(data?.cancellation_rate ?? 0),
      returnRate: Number(data?.return_rate ?? 0),
      reviewRating: Number(data?.review_rating ?? 0),
      isVerified: data?.is_verified ?? false,
    };
  },

  async setVerified(vendorId: string, isVerified: boolean) {
    const { error } = await supabase
      .from('vendors')
      .update({ is_verified: isVerified })
      .eq('id', vendorId);
    if (error) throw error;
  },

  /* ------------------------------ KYC ------------------------------ */

  async getKYC(vendorId: string) {
    // Admin-only path: fetch full vendor row through SECURITY DEFINER RPC so we
    // can read KYC/bank/financial fields that are revoked on direct selects.
    const { data, error } = await supabase.rpc('get_vendor_admin', { _vendor_id: vendorId });
    if (error) throw error;
    return (data?.[0] ?? null) as any;
  },

  /** Upload a KYC document (image). Compresses on the fly. Path: {userId}/{kind}.jpg */
  async uploadKYCDocument(userId: string, kind: KYCDocKind, file: File): Promise<string> {
    const blob = file.type.startsWith('image/')
      ? await compressImage(file, { maxDim: 1800, quality: 0.82 })
      : file;
    const path = `${userId}/${kind}.${file.type.startsWith('image/') ? 'jpg' : 'pdf'}`;
    return withRetry(async () => {
      const { error } = await supabase.storage
        .from('vendor-kyc')
        .upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
      if (error) throw error;
      return path;
    }, { scope: 'uploadKYCDocument' });
  },

  /** Submit KYC: persists business+bank fields, marks status pending. */
  async submitKYC(vendorId: string, payload: KYCSubmission & { kyc_doc_pan: string; kyc_doc_address: string; kyc_doc_business?: string }) {
    const { bank_account_number, ...rest } = payload;
    const { error } = await supabase
      .from('vendors')
      .update({
        ...rest,
        bank_account_number_masked: maskAccountNumber(bank_account_number),
        kyc_status: 'pending',
        kyc_submitted_at: new Date().toISOString(),
        kyc_rejection_reason: null,
      })
      .eq('id', vendorId);
    if (error) throw error;
  },

  /** Admin: signed URL for a stored KYC doc path. */
  async getKYCDocSignedUrl(path: string, expiresInSec = 300) {
    const { data, error } = await supabase.storage.from('vendor-kyc').createSignedUrl(path, expiresInSec);
    if (error) throw error;
    return data.signedUrl;
  },

  async approveKYC(vendorId: string) {
    const { error } = await supabase
      .from('vendors')
      .update({
        kyc_status: 'approved',
        kyc_reviewed_at: new Date().toISOString(),
        kyc_rejection_reason: null,
        // Sync top-level verification flags so the vendor dashboard, settings page,
        // and customer-facing badges reflect the "verified" state immediately.
        is_verified: true,
        verification_status: 'verified',
        verification_rejection_reason: null,
      })
      .eq('id', vendorId);
    if (error) throw error;
  },

  async rejectKYC(vendorId: string, reason: string) {
    const { error } = await supabase
      .from('vendors')
      .update({
        kyc_status: 'rejected',
        kyc_reviewed_at: new Date().toISOString(),
        kyc_rejection_reason: reason,
      })
      .eq('id', vendorId);
    if (error) throw error;
  },

  /** Admin: update top-level vendor verification status. Reason required for rejected/suspended. */
  async updateVerificationStatus(
    vendorId: string,
    status: 'pending' | 'approved' | 'verified' | 'rejected' | 'suspended',
    reason?: string,
  ) {
    const updates: Partial<{
      verification_status: string;
      verification_rejection_reason: string | null;
      is_verified: boolean;
    }> = { verification_status: status === 'approved' ? 'verified' : status };
    if (status === 'rejected' || status === 'suspended') {
      updates.verification_rejection_reason = reason ?? null;
    } else {
      updates.verification_rejection_reason = null;
    }
    if (status === 'approved' || status === 'verified') {
      updates.is_verified = true;
    }
    const { error } = await supabase.from('vendors').update(updates).eq('id', vendorId);
    if (error) throw error;
  },

  /** Audit log entries for a vendor (admin or vendor-self via RLS). */
  async getVendorAuditLog(vendorId: string) {
    const { data, error } = await supabase
      .from('vendor_audit_log')
      .select('id, action, previous_status, new_status, reason, actor_user_id, created_at')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },

  /** Admin: override the vendor's checkout display name preference. */
  async setCheckoutDisplayName(vendorId: string, value: 'store' | 'bank') {
    const { error } = await supabase
      .from('vendors')
      .update({ checkout_display_name: value })
      .eq('id', vendorId);
    if (error) throw error;
  },

  /** Admin: mark a vendor's bank details as verified (or unverified). */
  async setBankVerified(vendorId: string, verified: boolean) {
    const { error } = await supabase
      .from('vendors')
      .update({ bank_verified: verified })
      .eq('id', vendorId);
    if (error) throw error;
  },

  /** Upload vendor logo to existing public product-images bucket.
   *  Path MUST start with auth.uid() to satisfy storage RLS on product-images. */
  async uploadLogo(vendorId: string, file: File): Promise<string> {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const userId = userRes.user?.id;
    if (!userId) throw new Error('You must be signed in to upload a logo.');
    const blob = await compressImage(file, { maxDim: 600, quality: 0.85 });
    const path = `${userId}/vendor-${vendorId}-logo-${Date.now()}.jpg`;
    return withRetry(async () => {
      const { error } = await supabase.storage.from('product-images').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      if (error) {
        console.error('[uploadLogo] storage upload failed', { path, error });
        throw new Error(error.message || 'Logo upload failed');
      }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      return data.publicUrl;
    }, { scope: 'uploadLogo' });
  },

  /** Upload vendor banner image. Wider crop, public bucket.
   *  Path MUST start with auth.uid() to satisfy storage RLS on product-images. */
  async uploadBanner(vendorId: string, file: File): Promise<string> {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const userId = userRes.user?.id;
    if (!userId) throw new Error('You must be signed in to upload a banner.');
    const blob = await compressImage(file, { maxDim: 1600, quality: 0.82 });
    const path = `${userId}/vendor-${vendorId}-banner-${Date.now()}.jpg`;
    return withRetry(async () => {
      const { error } = await supabase.storage.from('product-images').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      if (error) {
        console.error('[uploadBanner] storage upload failed', { path, error });
        throw new Error(error.message || 'Banner upload failed');
      }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      return data.publicUrl;
    }, { scope: 'uploadBanner' });
  },

  /** Lookup city/state from a serviceable pincode. Returns null if not found. */
  async lookupPincode(pincode: string) {
    const { data } = await supabase
      .from('serviceable_pincodes')
      .select('city, state, country')
      .eq('pincode', pincode)
      .eq('is_active', true)
      .maybeSingle();
    return data ?? null;
  },
};
