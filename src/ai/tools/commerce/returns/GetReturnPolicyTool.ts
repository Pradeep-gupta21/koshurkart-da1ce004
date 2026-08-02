import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, ToolResult } from "../../types";

export interface GetReturnPolicyInput {}

export interface GetReturnPolicyOutput {
  policy: {
    eligibleDays: number;
    exchangeEligible: boolean;
    refundEligible: boolean;
    nonReturnableItems: string[];
    pickupRules: string;
  };
  message: string;
}

export class GetReturnPolicyTool extends BaseCommerceTool<GetReturnPolicyInput, GetReturnPolicyOutput> {
  readonly name = "get_return_policy";
  readonly description = "Retrieve the current return, refund, and exchange policy for the store.";

  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  protected validate(): string | null {
    return null;
  }

  protected async run(
    input: GetReturnPolicyInput,
    context: CommerceToolContext
  ): Promise<ToolResult<GetReturnPolicyOutput>> {
    return ok({
      policy: {
        eligibleDays: 14,
        exchangeEligible: true,
        refundEligible: true,
        nonReturnableItems: ["perishables", "customized goods", "undergarments", "clearance items"],
        pickupRules: "Items must be in original packaging. Pickup is typically scheduled within 2-3 business days of the request.",
      },
      message: "Here is the standard return policy.",
    });
  }
}
