import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface GetVendorInput {
  vendorId: string;
}

export class GetVendorTool extends BaseCommerceTool<GetVendorInput, any> {
  readonly name = "get_vendor";
  readonly description = "Get details about a specific vendor by their ID.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      vendorId: {
        type: "string",
        description: "The unique ID of the vendor.",
      }
    },
    required: ["vendorId"],
  };

  protected validate(input: GetVendorInput): string | null {
    if (!input.vendorId || typeof input.vendorId !== "string") {
      return "vendorId must be a non-empty string.";
    }
    return null;
  }

  protected async run(
    input: GetVendorInput,
    context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    const vendorService = context.services?.vendor;

    if (!vendorService) {
      return err({
        code: "unavailable",
        message: "Vendor service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await vendorService.getById(input.vendorId);
      
      if (!result) {
         return err({
            code: "not_found",
            message: "Vendor not found",
         });
      }
      return ok(result);
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
