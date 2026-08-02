import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type SuggestPaymentMethodInput = {
  addressId?: string;
  orderAmount?: number;
};

export interface SuggestPaymentMethodOutput {
  recommendedMethod: string;
  reason: string;
  alternatives: string[];
}

export class SuggestPaymentMethodTool extends BaseCommerceTool<SuggestPaymentMethodInput, SuggestPaymentMethodOutput> {
  readonly name = "suggest_payment_method";
  readonly description = "Recommends the best payment method based on COD availability, order amount, user history, promotions, and shipping location. Use this tool when a customer asks for the best payment method.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      addressId: { type: "string", description: "Selected address ID to check for COD availability" },
      orderAmount: { type: "number", description: "Total order amount" }
    },
    required: []
  };

  protected validate(input: SuggestPaymentMethodInput): string | null {
    if (input.orderAmount !== undefined && input.orderAmount < 0) {
      return "orderAmount cannot be negative";
    }
    return null;
  }

  protected async run(
    input: SuggestPaymentMethodInput,
    context: CommerceToolContext
  ): Promise<ToolResult<SuggestPaymentMethodOutput>> {
    try {
      if (!context.customer?.id) {
        return err({ code: "unauthorized", message: "Customer must be logged in to get payment method suggestions." });
      }

      // Mock implementation
      let recommendedMethod = "Prepaid (Credit/Debit Card or UPI)";
      let reason = "Prepaid orders process faster and may be eligible for additional discounts.";
      let alternatives = ["Cash on Delivery (COD)", "Net Banking"];

      if (input.orderAmount && input.orderAmount > 10000) {
        alternatives = alternatives.filter(m => m !== "Cash on Delivery (COD)");
        reason = "Prepaid is required for orders above ₹10,000.";
      }

      return ok({
        recommendedMethod,
        reason,
        alternatives
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
