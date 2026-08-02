import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { memoryStore, CustomerPreferences } from "./CustomerMemoryStore";

export interface RememberPreferenceInput extends Partial<CustomerPreferences> {}

export class RememberPreferenceTool extends BaseCommerceTool<RememberPreferenceInput, { message: string }> {
  readonly name = "remember_preference";
  readonly description = "Extract and save customer preferences automatically (e.g. favorite category, budget, interests). Use when the customer shares personal details or preferences.";
  readonly audiences = ["customer", "admin"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      favoriteCategories: { type: "array", items: { type: "string" }, description: "Favorite categories like shawls, carpets, etc." },
      favoriteArtisans: { type: "array", items: { type: "string" }, description: "Favorite artisans or brands." },
      favoriteMaterials: { type: "array", items: { type: "string" }, description: "Favorite materials like walnut, papier mache, pashmina." },
      favoriteColors: { type: "array", items: { type: "string" } },
      favoritePriceRange: { type: "string" },
      preferredPaymentMethod: { type: "string" },
      preferredDeliveryOption: { type: "string" },
      languagePreference: { type: "string" },
      shoppingGoals: { type: "array", items: { type: "string" } },
      budget: { type: "string" },
      interests: { type: "array", items: { type: "string" } },
      avoidedCategories: { type: "array", items: { type: "string" }, description: "Things the user explicitly dislikes or avoids." }
    }
  };

  protected validate(input: RememberPreferenceInput): string | null {
    return null;
  }

  protected async run(
    input: RememberPreferenceInput,
    context: CommerceToolContext
  ): Promise<ToolResult<{ message: string }>> {
    if (!context.userId) {
      return err({ code: "unauthorized", message: "You must be signed in to save preferences.", retryable: false });
    }

    await memoryStore.savePreferences(context.userId, input);
    return ok({ message: "Preferences remembered successfully." });
  }
}
