import { z } from 'zod';

export const reviewSchema = z.object({
  productId: z.string().uuid(),
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional().default(''),
  comment: z.string().trim().max(2000).optional().default(''),
  images: z.array(z.string().url()).max(6).optional().default([]),
  videos: z.array(z.string().url()).max(2).optional().default([]),
});

export type ReviewFormData = z.infer<typeof reviewSchema>;
