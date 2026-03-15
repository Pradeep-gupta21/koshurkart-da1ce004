import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Invalid email').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(20).nullable().optional(),
  avatar: z.string().url().nullable().optional(),
});

export type SignupFormData = z.infer<typeof signupSchema>;
export type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;
