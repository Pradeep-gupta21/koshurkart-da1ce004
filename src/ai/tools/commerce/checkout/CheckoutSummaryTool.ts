import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type CheckoutSummaryInput = {
  addressId?: string;
  shippingMethod?: string;
  couponCode?: string;
};

export interface CheckoutSummaryOutput {
  subtotal: number;
  discount: number;
  shipping: number;
  taxes: number;
  total: number;
  estimatedDelivery: string;
  savings: number;
  appliedCoupons: string[];
}

export class CheckoutSummaryTool extends BaseCommerceTool<CheckoutSummaryInput, CheckoutSummaryOutput> {
  readonly name = "checkout_summary";
  readonly description = "Returns a detailed summary of the checkout including subtotal, discount, shipping, taxes, total, estimated delivery, savings, and applied coupons. Use this tool when a customer asks to summarize their checkout or review their cart totals.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      addressId: { type: "string", description: "Selected address ID" },
      shippingMethod: { type: "string", description: "Selected shipping method" },
      couponCode: { type: "string", description: "Applied coupon code" }
    },
    required: []
  };

  protected validate(input: CheckoutSummaryInput): string | null {
    return null;
  }

  protected async run(
    input: CheckoutSummaryInput,
    context: CommerceToolContext
  ): Promise<ToolResult<CheckoutSummaryOutput>> {
    try {
      if (!context.customer?.id) {
        return err({ code: "unauthorized", message: "Customer must be logged in to get checkout summary." });
      }

      // Mock implementation
      return ok({
        subtotal: 5000,
        discount: 500,
        shipping: 100,
        taxes: 250,
        total: 4850,
        estimatedDelivery: "3-5 business days",
        savings: 500,
        appliedCoupons: input.couponCode ? [input.couponCode] : []
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
