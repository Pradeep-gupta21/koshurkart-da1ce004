import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageCompression';

export type ReviewSort = 'top' | 'latest';

export interface ReviewRow {
  id: string;
  user_id: string;
  product_id: string;
  order_id: string | null;
  rating: number;
  comment: string;
  images: string[];
  helpful_count: number;
  is_verified_purchase: boolean;
  created_at: string;
  profiles?: { name: string | null; avatar: string | null } | null;
}

export interface ReviewSummary {
  average: number;
  total: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export const reviewService = {
  async getReviews(
    productId: string,
    opts: { sort?: ReviewSort; withImagesOnly?: boolean; limit?: number; offset?: number } = {}
  ): Promise<ReviewRow[]> {
    const { sort = 'top', withImagesOnly = false, limit = 10, offset = 0 } = opts;
    let q = supabase
      .from('reviews')
      .select('*, profiles(name, avatar)')
      .eq('product_id', productId)
      .eq('moderation_status', 'approved');

    if (withImagesOnly) {
      // images is text[]; filter where length > 0 via not.eq with cs (contains anything = use overlap)
      q = q.not('images', 'eq', '{}');
    }

    if (sort === 'top') {
      q = q.order('helpful_count', { ascending: false }).order('created_at', { ascending: false });
    } else {
      q = q.order('created_at', { ascending: false });
    }

    q = q.range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ReviewRow[];
  },

  async getReviewSummary(productId: string): Promise<ReviewSummary> {
    const { data, error } = await supabase
      .from('reviews')
      .select('rating')
      .eq('product_id', productId)
      .eq('moderation_status', 'approved');
    if (error) throw error;
    const rows = data ?? [];
    const distribution: ReviewSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of rows) {
      const k = Math.max(1, Math.min(5, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
      distribution[k]++;
      sum += r.rating;
    }
    const total = rows.length;
    return { total, average: total ? sum / total : 0, distribution };
  },

  async canReview(productId: string): Promise<string | null> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase.rpc('can_review_product', {
      _user_id: userId,
      _product_id: productId,
    });
    if (error) throw error;
    return (data as string | null) ?? null;
  },

  async hasReviewed(productId: string): Promise<boolean> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return false;
    const { data, error } = await supabase
      .from('reviews')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  },

  async uploadImages(files: File[]): Promise<string[]> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const urls: string[] = [];
    for (const file of files) {
      const blob = await compressImage(file);
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage
        .from('review-images')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('review-images').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  },

  async submitReview(input: {
    productId: string;
    orderId: string;
    rating: number;
    comment: string;
    imageFiles: File[];
  }) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const images = input.imageFiles.length ? await this.uploadImages(input.imageFiles) : [];

    const { error } = await supabase.from('reviews').insert({
      user_id: userId,
      product_id: input.productId,
      order_id: input.orderId,
      rating: input.rating,
      comment: input.comment,
      images,
    });
    if (error) throw error;
  },

  async toggleHelpful(reviewId: string): Promise<boolean> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Sign in to vote');

    const { data: existing } = await supabase
      .from('review_helpful_votes')
      .select('id')
      .eq('review_id', reviewId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from('review_helpful_votes').delete().eq('id', existing.id);
      if (error) throw error;
      return false;
    } else {
      const { error } = await supabase
        .from('review_helpful_votes')
        .insert({ review_id: reviewId, user_id: userId });
      if (error) throw error;
      return true;
    }
  },

  async getMyHelpfulVotes(reviewIds: string[]): Promise<Set<string>> {
    if (!reviewIds.length) return new Set();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return new Set();
    const { data, error } = await supabase
      .from('review_helpful_votes')
      .select('review_id')
      .eq('user_id', userId)
      .in('review_id', reviewIds);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.review_id));
  },
};
