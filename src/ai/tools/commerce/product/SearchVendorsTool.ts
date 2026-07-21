import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface SearchVendorsInput {
  query?: string;
}

export class SearchVendorsTool extends BaseCommerceTool<SearchVendorsInput, any[]> {
  readonly name = "search_vendors";
  readonly description = "Get a list of vendors/sellers on the platform.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Optional query to filter vendors.",
      }
    },
  };

  protected validate(): string | null {
    return null;
  }

  protected async run(
    input: SearchVendorsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<any[]>> {
    const productService = context.services?.product;

    if (!productService) {
      return err({
        code: "unavailable",
        message: "Product service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      // Reusing product service's getVendors for now as it returns vendors
      const result = await productService.getVendors?.();

      if (!result || !result.success) {
        return err({
          code: "execution_error",
          message: result?.error?.message || "Failed to fetch vendors",
        });
      }

      let vendors = result.data;
      if (input.query) {
        const lowerQuery = input.query.toLowerCase();
        vendors = vendors.filter((v: any) => 
          v.store_name?.toLowerCase().includes(lowerQuery) || 
          v.description?.toLowerCase().includes(lowerQuery)
        );
      }

      return ok(vendors);
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
