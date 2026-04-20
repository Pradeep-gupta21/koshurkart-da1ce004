import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageCompression';
import { maskAccountNumber } from '@/lib/validators/kycSchema';

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
}

export const vendorService = {
  async getById(vendorId: string) {
    const { data, error } = await supabase.from('vendors').select('*').eq('id', vendorId).single();
    if (error) throw error;
    return data;
  },

  async getByUserId(userId: string) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async update(vendorId: string, updates: { store_name?: string; description?: string; logo?: string }) {
    const { data, error } = await supabase.from('vendors').update(updates).eq('id', vendorId).select().single();
    if (error) throw error;
    return data;
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
    const { data, error } = await supabase
      .from('vendors')
      .select(
        'id, user_id, kyc_status, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason, business_name, business_type, gstin, pan_number, aadhaar_last4, bank_account_holder, bank_account_number_masked, bank_ifsc, kyc_doc_pan, kyc_doc_address, kyc_doc_business'
      )
      .eq('id', vendorId)
      .single();
    if (error) throw error;
    return data;
  },

  /** Upload a KYC document (image). Compresses on the fly. Path: {userId}/{kind}.jpg */
  async uploadKYCDocument(userId: string, kind: KYCDocKind, file: File): Promise<string> {
    const blob = file.type.startsWith('image/')
      ? await compressImage(file, { maxDim: 1800, quality: 0.82 })
      : file;
    const path = `${userId}/${kind}.${file.type.startsWith('image/') ? 'jpg' : 'pdf'}`;
    const { error } = await supabase.storage
      .from('vendor-kyc')
      .upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
    return path;
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

  /** Upload vendor logo to existing public product-images bucket. */
  async uploadLogo(vendorId: string, file: File): Promise<string> {
    const blob = await compressImage(file, { maxDim: 600, quality: 0.85 });
    const path = `vendors/${vendorId}/logo-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Upload vendor banner image. Wider crop, public bucket. */
  async uploadBanner(vendorId: string, file: File): Promise<string> {
    const blob = await compressImage(file, { maxDim: 1600, quality: 0.82 });
    const path = `vendors/${vendorId}/banner-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
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
