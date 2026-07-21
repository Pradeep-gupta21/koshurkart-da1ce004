import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface SearchCategoriesInput {
  query?: string;
}

export class SearchCategoriesTool extends BaseCommerceTool<SearchCategoriesInput, any[]> {
  readonly name = "search_categories";
  readonly description = "Get a list of all product categories available in the store.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Optional query to filter categories.",
      }
    },
  };

  protected validate(): string | null {
    return null;
  }

  protected async run(
    input: SearchCategoriesInput,
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
      const result = await productService.getCategories();

      if (!result.success) {
        return err({
          code: "execution_error",
          message: result.error.message,
        });
      }

      let categories = result.data as string[];
      if (input.query) {
        const lowerQuery = input.query.toLowerCase();
        categories = categories.filter(c => c.toLowerCase().includes(lowerQuery));
      }

      return ok(categories);
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
