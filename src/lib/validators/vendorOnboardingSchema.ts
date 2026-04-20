import { z } from "zod";
import { PAN_REGEX, GSTIN_REGEX, IFSC_REGEX, BUSINESS_TYPES } from "./kycSchema";

export const STORE_CATEGORIES = [
  "Electronics",
  "Handicrafts",
  "Apparel",
  "Beauty",
  "Home & Kitchen",
  "Grocery",
  "Books",
  "Sports",
  "Other",
] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

const phoneRegex = /^\+?[1-9]\d{9,14}$/;
const pincodeRegex = /^\d{6}$/;

export const step1Schema = z.object({
  full_name: z.string().trim().min(2, "Required").max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(phoneRegex, "Enter a valid phone number (e.g. +919876543210)"),
  phone_verified: z.boolean().optional(),
});

export const step2Schema = z.object({
  store_name: z.string().trim().min(3, "Min 3 characters").max(80),
  store_slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/, "Lowercase letters, numbers, and hyphens only"),
  business_type: z.enum(BUSINESS_TYPES),
  category: z.enum(STORE_CATEGORIES),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const step3Schema = z.object({
  pickup_address_line1: z.string().trim().min(3, "Required").max(200),
  pickup_address_line2: z.string().trim().max(200).optional().or(z.literal("")),
  pickup_pincode: z.string().trim().regex(pincodeRegex, "Pincode must be 6 digits"),
  pickup_city: z.string().trim().min(2, "Required").max(80),
  pickup_state: z.string().trim().min(2, "Required").max(80),
  pickup_country: z.string().trim().min(2).max(3).default("IN"),
});

export const step4Schema = z.object({
  business_name: z.string().trim().min(2, "Required").max(120),
  pan_number: z.string().trim().toUpperCase().regex(PAN_REGEX, "Invalid PAN (e.g. ABCDE1234F)"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || GSTIN_REGEX.test(v), "Invalid GSTIN"),
  aadhaar_last4: z.string().trim().regex(/^[0-9]{4}$/, "Last 4 digits of Aadhaar"),
  bank_account_holder: z.string().trim().min(2, "Required").max(120),
  bank_account_number: z.string().trim().regex(/^[0-9]{6,18}$/, "Account number must be 6–18 digits"),
  bank_ifsc: z.string().trim().toUpperCase().regex(IFSC_REGEX, "Invalid IFSC (e.g. HDFC0001234)"),
  doc_pan_path: z.string().min(1, "PAN document required"),
  doc_address_path: z.string().min(1, "Address document required"),
  doc_business_path: z.string().optional().or(z.literal("")),
});

export const step5Schema = z.object({
  logo_url: z.string().url().optional().or(z.literal("")),
  banner_url: z.string().url().optional().or(z.literal("")),
  tagline: z.string().trim().max(80, "Max 80 characters").optional().or(z.literal("")),
});

export type Step1 = z.infer<typeof step1Schema>;
export type Step2 = z.infer<typeof step2Schema>;
export type Step3 = z.infer<typeof step3Schema>;
export type Step4 = z.infer<typeof step4Schema>;
export type Step5 = z.infer<typeof step5Schema>;

export interface OnboardingDraftData {
  step1?: Partial<Step1>;
  step2?: Partial<Step2>;
  step3?: Partial<Step3>;
  step4?: Partial<Omit<Step4, "bank_account_number">> & { bank_account_number_masked?: string };
  step5?: Partial<Step5>;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}
