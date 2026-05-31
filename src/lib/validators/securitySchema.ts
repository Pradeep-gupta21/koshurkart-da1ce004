import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must be less than 128 characters"),
});

/**
 * Strong password: 8+ chars, at least one uppercase, one lowercase, one digit.
 * Symbol not strictly required (avoids friction) but allowed up to 128 chars.
 */
export const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .refine((v) => /[a-z]/.test(v), "Must contain a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Must contain an uppercase letter")
  .refine((v) => /\d/.test(v), "Must contain a number");

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  password: strongPassword,
  storeName: z
    .string()
    .trim()
    .max(100, "Store name must be less than 100 characters")
    .optional(),
});

export const resetPasswordSchema = z.object({
  password: strongPassword,
});

export const adClickSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type SignupFormValues = z.infer<typeof signupSchema>;
