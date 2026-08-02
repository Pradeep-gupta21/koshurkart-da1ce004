import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { COUPONS } from "./couponData";

export interface RecommendBestCouponInput {
  cartTotal?: number;
  cartCategories?: string[];
  cartVendors?: string[];
}

export class RecommendBestCouponTool extends BaseCommerceTool<RecommendBestCouponInput, any> {
  readonly name = "recommend_best_coupon";
  readonly description = "Recommends the best available coupon for the user's current cart that provides the highest savings.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      cartTotal: { type: "number", description: "The total value of the items in the cart (before discount)" },
      cartCategories: { type: "array", items: { type: "string" }, description: "The categories of items present in the cart" },
      cartVendors: { type: "array", items: { type: "string" }, description: "The vendor IDs of items present in the cart" },
    },
    required: [],
  };

  protected async run(
    input: RecommendBestCouponInput,
    _context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    const { cartTotal = 0, cartCategories = [], cartVendors = [] } = input;
    const now = new Date();

    let bestCoupon = null;
    let maxSavings = -1;

    for (const coupon of COUPONS) {
      if (!coupon.isAvailable) continue;
      
      const expiry = new Date(coupon.expiryDate);
      if (expiry < now) continue;

      if (cartTotal > 0 && cartTotal < coupon.minPurchase) continue;

      if (coupon.categoryRestriction && cartCategories.length > 0) {
        if (!cartCategories.includes(coupon.categoryRestriction)) continue;
      }

      if (coupon.vendorRestriction && cartVendors.length > 0) {
        if (!cartVendors.includes(coupon.vendorRestriction)) continue;
      }

      let savings = 0;
      if (coupon.type === 'percentage') {
        savings = (cartTotal * coupon.value) / 100;
      } else if (coupon.type === 'fixed') {
        savings = Math.min(cartTotal, coupon.value);
      } else if (coupon.type === 'free_shipping') {
        savings = 0; 
      }

      if (savings > maxSavings || (savings === maxSavings && maxSavings === 0 && coupon.type === 'free_shipping')) {
        maxSavings = savings;
        bestCoupon = coupon;
      }
    }

    if (!bestCoupon) {
      return ok({
        success: false,
        coupon: null,
        discount: 0,
        savings: 0,
        reason: "No eligible coupons found for this cart.",
        eligible: false,
      });
    }

    return ok({
      success: true,
      coupon: {
        code: bestCoupon.code,
        type: bestCoupon.type,
        value: bestCoupon.value,
        description: bestCoupon.description,
      },
      discount: bestCoupon.type === 'percentage' ? `${bestCoupon.value}%` : (bestCoupon.type === 'fixed' ? `₹${bestCoupon.value}` : 'Free Shipping'),
      savings: maxSavings,
      reason: "This coupon provides the highest savings for your cart.",
      eligible: true,
    });
  }
}
