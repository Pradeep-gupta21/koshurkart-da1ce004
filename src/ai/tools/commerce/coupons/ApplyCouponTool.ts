import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { COUPONS, Coupon } from "./couponData";

export interface ApplyCouponInput {
  couponCode: string;
  cartTotal?: number;
  cartCategories?: string[];
  cartVendors?: string[];
}

export class ApplyCouponTool extends BaseCommerceTool<ApplyCouponInput, any> {
  readonly name = "apply_coupon";
  readonly description = "Validates and applies a coupon code to the user's cart. Returns the discount amount and whether it is eligible based on cart details.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      couponCode: { type: "string", description: "The coupon code to apply" },
      cartTotal: { type: "number", description: "The total value of the items in the cart (before discount)" },
      cartCategories: { type: "array", items: { type: "string" }, description: "The categories of items present in the cart" },
      cartVendors: { type: "array", items: { type: "string" }, description: "The vendor IDs of items present in the cart" },
    },
    required: ["couponCode"],
  };

  protected async run(
    input: ApplyCouponInput,
    _context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    const { couponCode, cartTotal = 0, cartCategories = [], cartVendors = [] } = input;
    
    const coupon = COUPONS.find((c) => c.code.toUpperCase() === couponCode.toUpperCase());
    
    if (!coupon) {
      return ok({
        success: false,
        coupon: null,
        discount: 0,
        savings: 0,
        reason: "Invalid coupon code.",
        eligible: false,
      });
    }

    if (!coupon.isAvailable) {
      return ok(this.rejectCoupon(coupon, "This coupon is no longer available."));
    }

    const now = new Date();
    const expiry = new Date(coupon.expiryDate);
    if (expiry < now) {
      return ok(this.rejectCoupon(coupon, "This coupon has expired."));
    }

    if (cartTotal > 0 && cartTotal < coupon.minPurchase) {
      return ok(this.rejectCoupon(coupon, `Minimum purchase of ₹${coupon.minPurchase} required.`));
    }

    if (coupon.categoryRestriction && cartCategories.length > 0) {
      if (!cartCategories.includes(coupon.categoryRestriction)) {
        return ok(this.rejectCoupon(coupon, `This coupon is only valid for ${coupon.categoryRestriction} products.`));
      }
    }

    if (coupon.vendorRestriction && cartVendors.length > 0) {
      if (!cartVendors.includes(coupon.vendorRestriction)) {
        return ok(this.rejectCoupon(coupon, `This coupon is only valid for a specific artisan.`));
      }
    }

    let savings = 0;
    if (coupon.type === 'percentage') {
      savings = (cartTotal * coupon.value) / 100;
    } else if (coupon.type === 'fixed') {
      savings = Math.min(cartTotal, coupon.value);
    } else if (coupon.type === 'free_shipping') {
      savings = 0;
    }

    return ok({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
      },
      discount: coupon.type === 'percentage' ? `${coupon.value}%` : (coupon.type === 'fixed' ? `₹${coupon.value}` : 'Free Shipping'),
      savings,
      reason: "Coupon successfully applied.",
      eligible: true,
    });
  }

  private rejectCoupon(coupon: Coupon, reason: string) {
    return {
      success: false,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
      },
      discount: 0,
      savings: 0,
      reason,
      eligible: false,
    };
  }
}
