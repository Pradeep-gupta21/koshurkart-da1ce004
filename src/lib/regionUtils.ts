/**
 * Region-awareness helpers for the J&K marketplace.
 *
 * A vendor is considered "local" (Kashmir/J&K) when their pickup_state
 * contains "kashmir" or "jammu" (case-insensitive). This is derived rather
 * than stored as a flag to keep state changes single-source-of-truth.
 */

export const KASHMIR_STATE_KEYWORDS = ["kashmir", "jammu"] as const;

export interface VendorLocalityFields {
  pickup_state?: string | null;
  pickupState?: string | null;
  verification_status?: string | null;
  verificationStatus?: string | null;
  kyc_status?: string | null;
  kycStatus?: string | null;
}

function getPickupState(v: VendorLocalityFields | null | undefined): string | null {
  if (!v) return null;
  return (v.pickup_state ?? v.pickupState ?? null) || null;
}

export function isKashmirVendor(v: VendorLocalityFields | null | undefined): boolean {
  const state = getPickupState(v);
  if (!state) return false;
  const lower = state.toLowerCase();
  return KASHMIR_STATE_KEYWORDS.some((k) => lower.includes(k));
}

export function isVerifiedLocalSeller(v: VendorLocalityFields | null | undefined): boolean {
  if (!isKashmirVendor(v)) return false;
  const verification = (v?.verification_status ?? v?.verificationStatus ?? "").toLowerCase();
  const kyc = (v?.kyc_status ?? v?.kycStatus ?? "").toLowerCase();
  return (verification === "approved" || verification === "verified") && kyc === "approved";
}
