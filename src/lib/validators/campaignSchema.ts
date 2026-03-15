import { z } from 'zod';

export const campaignSchema = z.object({
  productId: z.string().uuid('Select a product'),
  placement: z.enum(['homepage', 'search', 'product']),
  budget: z.number().positive('Budget must be positive'),
  dailyLimit: z.number().min(0).nullable().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().nullable().optional(),
});

export type CampaignFormData = z.infer<typeof campaignSchema>;
