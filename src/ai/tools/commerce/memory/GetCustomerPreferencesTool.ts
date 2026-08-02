import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { memoryStore, CustomerPreferences } from "./CustomerMemoryStore";

export class GetCustomerPreferencesTool extends BaseCommerceTool<{}, { preferences: CustomerPreferences, confidence: number, lastUpdated: string }> {
  readonly name = "get_customer_preferences";
  readonly description = "Get the known preferences for the customer. Use when deciding what to recommend or asking about what you know.";
  readonly audiences = ["customer", "admin"] as const;
  
  readonly parameters: any = {
    type: "object",
    properties: {}
  };

  protected validate(): string | null {
    return null;
  }

  protected async run(
    input: {},
    context: CommerceToolContext
  ): Promise<ToolResult<{ preferences: CustomerPreferences, confidence: number, lastUpdated: string }>> {
    if (!context.userId) {
      return err({ code: "unauthorized", message: "You must be signed in to view preferences.", retryable: false });
    }

    const preferences = await memoryStore.getPreferences(context.userId);
    return ok({
      preferences,
      confidence: 0.95,
      lastUpdated: new Date().toISOString()
    });
  }
}
