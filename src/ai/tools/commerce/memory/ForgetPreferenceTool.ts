import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { memoryStore, CustomerPreferences } from "./CustomerMemoryStore";

export interface ForgetPreferenceInput {
  key: keyof CustomerPreferences;
}

export class ForgetPreferenceTool extends BaseCommerceTool<ForgetPreferenceInput, { message: string }> {
  readonly name = "forget_preference";
  readonly description = "Remove a preference from the customer's memory (e.g. 'Forget my budget', 'Forget my favorite category').";
  readonly audiences = ["customer", "admin"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      key: { 
        type: "string",
        enum: [
          "favoriteCategories", "favoriteArtisans", "favoriteMaterials", "favoriteColors",
          "favoritePriceRange", "preferredPaymentMethod", "preferredDeliveryOption",
          "languagePreference", "shoppingGoals", "budget", "interests", "avoidedCategories",
          "interactionHistory"
        ],
        description: "The specific preference key to forget."
      }
    },
    required: ["key"]
  };

  protected validate(input: ForgetPreferenceInput): string | null {
    if (!input.key) return "key is required.";
    return null;
  }

  protected async run(
    input: ForgetPreferenceInput,
    context: CommerceToolContext
  ): Promise<ToolResult<{ message: string }>> {
    if (!context.userId) {
      return err({ code: "unauthorized", message: "You must be signed in.", retryable: false });
    }

    await memoryStore.forgetPreference(context.userId, input.key);
    return ok({ message: `Forgot preference: ${input.key}` });
  }
}
