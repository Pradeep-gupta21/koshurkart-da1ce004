import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { COUPONS } from "./couponData";

export type GetAvailableCouponsInput = Record<string, never>;

export class GetAvailableCouponsTool extends BaseCommerceTool<GetAvailableCouponsInput, any> {
  readonly name = "get_available_coupons";
  readonly description = "Retrieves all currently active and available coupons or promo codes.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  protected async run(
    _input: GetAvailableCouponsInput,
    _context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    const now = new Date();
    
    const availableCoupons = COUPONS.filter((c) => {
      if (!c.isAvailable) return false;
      const expiry = new Date(c.expiryDate);
      return expiry > now;
    });

    return ok({
      success: true,
      data: availableCoupons.map((c) => ({
        code: c.code,
        description: c.description,
        type: c.type,
        value: c.value,
        minPurchase: c.minPurchase,
        categoryRestriction: c.categoryRestriction,
        vendorRestriction: c.vendorRestriction,
        expiresAt: c.expiryDate,
      })),
    });
  }
}
