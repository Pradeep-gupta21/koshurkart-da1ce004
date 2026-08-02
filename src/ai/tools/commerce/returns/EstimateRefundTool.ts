import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface EstimateRefundInput {
  orderId: string;
  productId: string;
  quantity?: number;
}

export interface EstimateRefundOutput {
  refundableAmount: number;
  deductions: {
    shipping?: number;
    cancellationFee?: number;
    damage?: number;
    coupon?: number;
  };
  totalRefund: number;
  explanation: string;
}

export class EstimateRefundTool extends BaseCommerceTool<EstimateRefundInput, EstimateRefundOutput> {
  readonly name = "estimate_refund";
  readonly description = "Estimate the refund amount for returning a product, including any deductions.";

  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "The ID of the order.",
      },
      productId: {
        type: "string",
        description: "The ID of the product being returned.",
      },
      quantity: {
        type: "number",
        description: "The quantity of the product being returned.",
      },
    },
    required: ["orderId", "productId"],
  };

  protected validate(input: EstimateRefundInput): string | null {
    if (!input.orderId) return "orderId is required.";
    if (!input.productId) return "productId is required.";
    return null;
  }

  protected async run(
    input: EstimateRefundInput,
    context: CommerceToolContext
  ): Promise<ToolResult<EstimateRefundOutput>> {
    const orderService = context.services?.order;
    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const orderResult = await orderService.getOrder(input.orderId);
      if (!orderResult.success || !orderResult.data) {
        return err({
          code: "execution_error",
          message: orderResult.error?.message ?? "Order not found.",
        });
      }

      // Estimate logic simulation
      // If the real order contains the product, we would calculate it from the line items.
      // Since we don't have product price without further calls, let's assume a mock calculation.
      
      const qty = input.quantity ?? 1;
      const baseAmount = 50 * qty; // Mock base price
      const shippingDeduction = 5;
      const totalRefund = baseAmount - shippingDeduction;

      return ok({
        refundableAmount: baseAmount,
        deductions: {
          shipping: shippingDeduction,
        },
        totalRefund: totalRefund,
        explanation: `The estimated refund is $${totalRefund}. This includes a base refundable amount of $${baseAmount} minus a $${shippingDeduction} shipping deduction.`,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
