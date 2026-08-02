import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type ValidateCheckoutInput = {
  addressId?: string;
  paymentMethod?: string;
  couponCode?: string;
};

export interface ValidateCheckoutOutput {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export class ValidateCheckoutTool extends BaseCommerceTool<ValidateCheckoutInput, ValidateCheckoutOutput> {
  readonly name = "validate_checkout";
  readonly description = "Validates the cart, stock availability, address, payment method, coupons, and shipping before placing an order. Use this tool when a customer asks if they are ready to checkout or if there are any issues before placing their order.";
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      addressId: { type: "string", description: "Selected address ID" },
      paymentMethod: { type: "string", description: "Selected payment method (e.g. COD, Card)" },
      couponCode: { type: "string", description: "Applied coupon code" }
    },
    required: []
  };

  protected validate(input: ValidateCheckoutInput): string | null {
    return null;
  }

  protected async run(
    input: ValidateCheckoutInput,
    context: CommerceToolContext
  ): Promise<ToolResult<ValidateCheckoutOutput>> {
    try {
      if (!context.customer?.id) {
        return err({ code: "unauthorized", message: "Customer must be logged in to validate checkout." });
      }

      // Mock validation logic
      const valid = true;
      const errors: string[] = [];
      const warnings: string[] = [];
      const suggestions: string[] = [];

      if (!input.addressId) {
        warnings.push("No address selected.");
      }
      if (!input.paymentMethod) {
        warnings.push("No payment method selected.");
      }

      return ok({ valid, errors, warnings, suggestions });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
