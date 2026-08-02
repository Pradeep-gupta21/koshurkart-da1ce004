import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, ToolResult } from "../../types";

export interface GetShippingOptionsInput {
  pincode: string;
  country?: string;
}

export interface ShippingOption {
  shippingMethod: string;
  cost: number;
  estimatedDelivery: string;
  codAvailable: boolean;
  message: string;
}

export interface GetShippingOptionsOutput {
  options: ShippingOption[];
  shippingRestrictions: string[];
}

export class GetShippingOptionsTool extends BaseCommerceTool<GetShippingOptionsInput, GetShippingOptionsOutput> {
  readonly name = "get_shipping_options";
  readonly description = "Get available shipping options, costs, and COD availability for a specific location.";

  readonly audiences = ["customer", "admin"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      pincode: {
        type: "string",
        description: "The destination postal code.",
      },
      country: {
        type: "string",
        description: "The destination country code (e.g., IN). Defaults to IN.",
      }
    },
    required: ["pincode"],
  };

  protected validate(input: GetShippingOptionsInput): string | null {
    if (!input.pincode) {
      return "Pincode is required.";
    }
    return null;
  }

  protected async run(
    input: GetShippingOptionsInput,
    _context: CommerceToolContext
  ): Promise<ToolResult<GetShippingOptionsOutput>> {
    const country = input.country?.toUpperCase() || 'IN';
    
    // Simulate shipping logic based on rules
    const options: ShippingOption[] = [];
    const restrictions: string[] = [];

    if (country !== 'IN') {
      options.push({
        shippingMethod: "International Standard",
        cost: 2500,
        estimatedDelivery: "10-15 business days",
        codAvailable: false,
        message: "International shipping requires full prepayment."
      });
      restrictions.push("COD is not available for international orders.");
      restrictions.push("Customs duties may apply and are the responsibility of the buyer.");
    } else {
      // Domestic (India)
      const isKashmir = input.pincode.startsWith('19'); // J&K pincodes start with 19
      
      options.push({
        shippingMethod: "Standard Shipping",
        cost: isKashmir ? 50 : 100,
        estimatedDelivery: isKashmir ? "2-3 business days" : "5-7 business days",
        codAvailable: true,
        message: isKashmir ? "Local delivery discount applied." : "Standard domestic delivery."
      });

      options.push({
        shippingMethod: "Express Shipping",
        cost: isKashmir ? 100 : 250,
        estimatedDelivery: isKashmir ? "Next business day" : "2-3 business days",
        codAvailable: true,
        message: "Priority handling and faster transit times."
      });
    }

    return ok({
      options,
      shippingRestrictions: restrictions,
    });
  }
}
