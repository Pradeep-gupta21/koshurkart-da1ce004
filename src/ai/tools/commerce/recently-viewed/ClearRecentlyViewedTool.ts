import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { RecentlyViewedStore } from "./store";

export class ClearRecentlyViewedTool extends BaseCommerceTool<any, any> {
  readonly name = "clear_recently_viewed";
  readonly description = "Clear the customer's recently viewed products history.";
  
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
        message: "You must be logged in to clear your recently viewed products.",
      });
    }

    try {
      RecentlyViewedStore.clear(context.customer.id);
      return ok({
        message: "Your recently viewed history has been cleared."
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
