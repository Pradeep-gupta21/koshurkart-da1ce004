import { z } from "zod";
import { BaseCommerceTool } from "../base-commerce.tool";
import type { ToolContext } from "../../types";
import { err, ok } from "../../types";
import { ShoppingConciergeAgent } from "../../../agents/commerce/ShoppingConciergeAgent";

export class ShoppingConciergeTool extends BaseCommerceTool<
  { request: string },
  string
> {
  readonly name = "shopping_concierge";
  readonly description =
    "A Master Orchestrator for complex shopping requests. It automatically plans, executes multiple commerce tools sequentially, merges the results, and returns a final customer-friendly answer. Use this for complex multi-step queries like 'wedding gift under 5000' or 'recommend something and show me delivery options'.";

  protected readonly schema = z.object({
    request: z.string().describe("The original complex customer request or question."),
  });

  async run(
    args: { request: string },
    context: ToolContext
  ) {
    if (!context.ai || !context.registry || !context.executor) {
      return err({
        code: "unavailable",
        message: "ShoppingConciergeAgent requires AIService, ToolRegistry, and ToolExecutor in the context.",
        retryable: false,
      });
    }

    try {
      const concierge = new ShoppingConciergeAgent(
        context.ai,
        context.registry,
        context.executor
      );

      // We maintain the user's ID/context for any child tools
      const sharedContext = {
        userId: context.userId,
      };

      const result = await concierge.execute(args.request, sharedContext);
      return ok(result);
    } catch (e: any) {
      return err({
        code: "tool_error",
        message: `Concierge execution failed: ${e.message}`,
        retryable: true,
        cause: e,
      });
    }
  }
}
