import { z } from 'zod';

export const reviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().default(''),
});

export type ReviewFormData = z.infer<typeof reviewSchema>;
