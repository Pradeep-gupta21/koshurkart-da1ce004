import { describe, it, expect } from "vitest";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  slugify,
} from "../vendorOnboardingSchema";

describe("vendorOnboardingSchema", () => {
  describe("step1 (basic info)", () => {
    it("accepts a valid record", () => {
      const r = step1Schema.safeParse({
        full_name: "Aisha Khan",
        email: "aisha@example.com",
        phone: "+919876543210",
      });
      expect(r.success).toBe(true);
    });
    it("rejects bad phone", () => {
      const r = step1Schema.safeParse({
        full_name: "X Y",
        email: "x@y.com",
        phone: "12345",
      });
      expect(r.success).toBe(false);
    });
    it("rejects invalid email", () => {
      const r = step1Schema.safeParse({
        full_name: "X Y",
        email: "not-an-email",
        phone: "+919876543210",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("step2 (business)", () => {
    const base = {
      store_name: "Acme Co",
      store_slug: "acme-co",
      business_type: "pvt-ltd" as const,
      category: "Handicrafts" as const,
    };
    it("accepts valid", () => {
      expect(step2Schema.safeParse(base).success).toBe(true);
    });
    it("rejects uppercase / space in slug", () => {
      expect(step2Schema.safeParse({ ...base, store_slug: "Acme Co" }).success).toBe(false);
    });
    it("rejects slug starting with hyphen", () => {
      expect(step2Schema.safeParse({ ...base, store_slug: "-acme" }).success).toBe(false);
    });
  });

  describe("step3 (address)", () => {
    const base = {
      pickup_address_line1: "12 MG Road",
      pickup_pincode: "190001",
      pickup_city: "Srinagar",
      pickup_state: "Jammu & Kashmir",
      pickup_country: "IN",
    };
    it("accepts valid", () => {
      expect(step3Schema.safeParse(base).success).toBe(true);
    });
    it("rejects 5-digit pincode", () => {
      expect(step3Schema.safeParse({ ...base, pickup_pincode: "12345" }).success).toBe(false);
    });
  });

  describe("step4 (KYC)", () => {
    const base = {
      business_name: "Acme Pvt Ltd",
      pan_number: "ABCDE1234F",
      aadhaar_last4: "1234",
      bank_account_holder: "Acme Pvt Ltd",
      bank_account_number: "12345678901",
      bank_ifsc: "HDFC0001234",
      doc_pan_path: "u/pan.jpg",
      doc_address_path: "u/addr.jpg",
    };
    it("accepts valid", () => {
      expect(step4Schema.safeParse(base).success).toBe(true);
    });
    it("rejects bad PAN", () => {
      expect(step4Schema.safeParse({ ...base, pan_number: "ABCDE12345" }).success).toBe(false);
    });
    it("rejects bad IFSC", () => {
      expect(step4Schema.safeParse({ ...base, bank_ifsc: "HDFC1234567" }).success).toBe(false);
    });
    it("rejects 3-digit aadhaar_last4", () => {
      expect(step4Schema.safeParse({ ...base, aadhaar_last4: "123" }).success).toBe(false);
    });
    it("accepts optional GSTIN when valid", () => {
      expect(step4Schema.safeParse({ ...base, gstin: "27ABCDE1234F1Z5" }).success).toBe(true);
    });
    it("rejects malformed GSTIN", () => {
      expect(step4Schema.safeParse({ ...base, gstin: "BADGSTIN" }).success).toBe(false);
    });
  });

  describe("step5 (storefront)", () => {
    it("allows empty optional fields", () => {
      expect(step5Schema.safeParse({}).success).toBe(true);
    });
    it("rejects tagline > 80 chars", () => {
      expect(step5Schema.safeParse({ tagline: "x".repeat(81) }).success).toBe(false);
    });
  });

  describe("slugify", () => {
    it("normalises to kebab-case", () => {
      expect(slugify("Acme Co!")).toBe("acme-co");
    });
    it("trims leading/trailing hyphens", () => {
      expect(slugify("  Hello  World  ")).toBe("hello-world");
    });
  });
});
