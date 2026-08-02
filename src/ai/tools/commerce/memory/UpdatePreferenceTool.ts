import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { memoryStore, CustomerPreferences } from "./CustomerMemoryStore";

export interface UpdatePreferenceInput extends Partial<CustomerPreferences> {}

export class UpdatePreferenceTool extends BaseCommerceTool<UpdatePreferenceInput, { message: string }> {
  readonly name = "update_preference";
  readonly description = "Modify an existing preference for the customer.";
  readonly audiences = ["customer", "admin"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      favoriteCategories: { type: "array", items: { type: "string" } },
      favoriteArtisans: { type: "array", items: { type: "string" } },
      favoriteMaterials: { type: "array", items: { type: "string" } },
      favoriteColors: { type: "array", items: { type: "string" } },
      favoritePriceRange: { type: "string" },
      preferredPaymentMethod: { type: "string" },
      preferredDeliveryOption: { type: "string" },
      languagePreference: { type: "string" },
      shoppingGoals: { type: "array", items: { type: "string" } },
      budget: { type: "string" },
      interests: { type: "array", items: { type: "string" } },
      avoidedCategories: { type: "array", items: { type: "string" } }
    }
  };

  protected validate(): string | null {
    return null;
  }

  protected async run(
    input: UpdatePreferenceInput,
    context: CommerceToolContext
  ): Promise<ToolResult<{ message: string }>> {
    if (!context.userId) {
      return err({ code: "unauthorized", message: "You must be signed in.", retryable: false });
    }

    await memoryStore.savePreferences(context.userId, input);
    return ok({ message: "Preferences updated successfully." });
  }
}
