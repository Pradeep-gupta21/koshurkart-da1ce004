import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type PreCheckoutAssistantInput = {
  addressId?: string;
  couponCode?: string;
  shippingMethod?: string;
};

export interface PreCheckoutAssistantOutput {
  status: "ready" | "action_required" | "suggestions_available";
  issues: string[];
  suggestions: {
    betterCoupon?: string;
    cheaperShipping?: string;
    bundleSavings?: string;
    recommendedAddOns?: string[];
  };
  warnings: string[];
}

export class PreCheckoutAssistantTool extends BaseCommerceTool<PreCheckoutAssistantInput, PreCheckoutAssistantOutput> {
  readonly name = "pre_checkout_assistant";
  readonly description = "Analyzes the entire checkout state to suggest better coupons, cheaper shipping, bundle savings, recommended add-ons, and highlight potential issues like missing address or stock issues. Use this tool when a customer asks to review their cart, if they can save more, or what to fix before checkout.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      addressId: { type: "string", description: "Selected address ID" },
      couponCode: { type: "string", description: "Currently applied coupon" },
      shippingMethod: { type: "string", description: "Selected shipping method" }
    },
    required: []
  };

  protected validate(input: PreCheckoutAssistantInput): string | null {
    return null;
  }

  protected async run(
    input: PreCheckoutAssistantInput,
    context: CommerceToolContext
  ): Promise<ToolResult<PreCheckoutAssistantOutput>> {
    try {
      if (!context.customer?.id) {
        return err({ code: "unauthorized", message: "Customer must be logged in to get pre-checkout assistance." });
      }

      // Mock implementation
      const issues: string[] = [];
      if (!input.addressId) issues.push("Please select a shipping address.");

      const suggestions = {
        betterCoupon: !input.couponCode ? "SAVE10" : undefined,
        recommendedAddOns: ["Premium Gift Box"],
        cheaperShipping: input.shippingMethod === "Express" ? "Standard Shipping (Free)" : undefined
      };

      const warnings: string[] = [];
      const status = issues.length > 0 ? "action_required" : (suggestions.betterCoupon || suggestions.recommendedAddOns?.length ? "suggestions_available" : "ready");

      return ok({
        status,
        issues,
        suggestions,
        warnings
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
