import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, ToolResult } from "../../types";

export interface EstimateDeliveryInput {
  pincode: string;
  shippingMethod: string;
}

export interface EstimateDeliveryOutput {
  estimatedDelivery: string;
  message: string;
}

export class EstimateDeliveryTool extends BaseCommerceTool<EstimateDeliveryInput, EstimateDeliveryOutput> {
  readonly name = "estimate_delivery";
  readonly description = "Estimate delivery time for a specific location and shipping method.";

  readonly audiences = ["customer", "admin"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      pincode: {
        type: "string",
        description: "The destination postal code.",
      },
      shippingMethod: {
        type: "string",
        description: "The shipping method (e.g., standard, express, international).",
      }
    },
    required: ["pincode", "shippingMethod"],
  };

  protected validate(input: EstimateDeliveryInput): string | null {
    if (!input.pincode) return "Pincode is required.";
    if (!input.shippingMethod) return "Shipping method is required.";
    return null;
  }

  protected async run(
    input: EstimateDeliveryInput,
    _context: CommerceToolContext
  ): Promise<ToolResult<EstimateDeliveryOutput>> {
    const isKashmir = input.pincode.startsWith('19');
    const method = input.shippingMethod.toLowerCase();
    
    let estimatedDelivery = "5-7 business days";
    let message = "Standard delivery timeframe.";

    if (method.includes('express')) {
      estimatedDelivery = isKashmir ? "Next business day" : "2-3 business days";
      message = "Express delivery timeframe.";
    } else if (method.includes('international')) {
      estimatedDelivery = "10-15 business days";
      message = "International delivery timeframe subject to customs clearance.";
    } else {
      estimatedDelivery = isKashmir ? "2-3 business days" : "5-7 business days";
    }

    return ok({
      estimatedDelivery,
      message,
    });
  }
}
