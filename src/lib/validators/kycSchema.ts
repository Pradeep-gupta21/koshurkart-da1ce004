import { z } from "zod";

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const BUSINESS_TYPES = ["individual", "proprietorship", "partnership", "pvt-ltd", "llp"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5MB

export const kycBusinessSchema = z.object({
  business_name: z.string().trim().min(2, "Required").max(120),
  business_type: z.enum(["individual", "proprietorship", "partnership", "pvt-ltd", "llp"] as const),
  pan_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PAN_REGEX, "Invalid PAN (e.g. ABCDE1234F)"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || GSTIN_REGEX.test(v), "Invalid GSTIN"),
  aadhaar_last4: z
    .string()
    .trim()
    .regex(/^[0-9]{4}$/, "Enter the last 4 digits of Aadhaar"),
});

export const kycBankSchema = z.object({
  bank_account_holder: z.string().trim().min(2, "Required").max(120),
  bank_account_number: z
    .string()
    .trim()
    .regex(/^[0-9]{6,18}$/, "Account number must be 6–18 digits"),
  bank_ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(IFSC_REGEX, "Invalid IFSC (e.g. HDFC0001234)"),
});

export type KYCBusinessForm = z.infer<typeof kycBusinessSchema>;
export type KYCBankForm = z.infer<typeof kycBankSchema>;

export function maskAccountNumber(acct: string): string {
  const last4 = acct.slice(-4);
  return `****${last4}`;
}
