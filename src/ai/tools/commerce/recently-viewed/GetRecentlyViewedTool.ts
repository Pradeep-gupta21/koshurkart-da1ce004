import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { RecentlyViewedStore } from "./store";

export class GetRecentlyViewedTool extends BaseCommerceTool<any, any> {
  readonly name = "get_recently_viewed";
  readonly description = "Retrieve the customer's recently viewed products history.";
  
  readonly parameters: any = {
    type: "object",
    properties: {}
  };

  protected validate(input: any): string | null {
    return null;
  }

  protected async run(
    input: any,
    context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    if (!context.customer?.id) {
      return err({
        code: "unauthorized",
        message: "You must be logged in to view your recently viewed products.",
      });
    }

    try {
      const history = RecentlyViewedStore.get(context.customer.id);
      
      return ok({
        items: history,
        message: history.length > 0 
          ? `Found ${history.length} recently viewed items.`
          : "Your recently viewed history is empty."
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
