import { z } from 'zod';

export const shippingSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  address: z.string().trim().min(1, 'Address is required').max(500),
  city: z.string().trim().min(1, 'City is required').max(100),
  zipCode: z.string().trim().min(1, 'Zip code is required').max(20),
});

export const orderItemSchema = z.object({
  productId: z.string().uuid(),
  vendorId: z.string().uuid(),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  title: z.string().min(1),
  image: z.string(),
});

export type ShippingFormData = z.infer<typeof shippingSchema>;
