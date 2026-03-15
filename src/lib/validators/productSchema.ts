import { z } from 'zod';

export const productSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(5000).optional().default(''),
  price: z.number().positive('Price must be positive'),
  discountPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  category: z.string().min(1, 'Category is required'),
  images: z.array(z.string().url('Invalid image URL')).default([]),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
});

export type ProductFormData = z.infer<typeof productSchema>;
