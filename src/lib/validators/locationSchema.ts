import { z } from "zod";

// Pincode regex: 6-digit IN by default; permissive for other countries
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9\- ]{3,10}$/, "Invalid pincode format");

export const inPincodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Indian pincode must be 6 digits");

export const locationSchema = z.object({
  pincode: pincodeSchema,
  city: z.string().min(1).max(80),
  state: z.string().max(80).optional().nullable(),
  country: z.string().min(2).max(3).default("IN"),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export type LocationInput = z.infer<typeof locationSchema>;
