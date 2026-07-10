/**
 * KoshurKart — ProductRecommendationTool
 * =================================================================
 * Returns personalised product recommendations using one of three
 * strategies: composite-scored smart recommendations, "because you
 * viewed" similarity, or popularity within a category.
 *
 * Delegates to `aiRecommendationService` for all scoring — the tool
 * handles identity resolution, input validation, and output mapping.
 *
 * Audience: customer only (uses personal behavior data).
 */

import type { ChatAudience, JSONSchema } from "@/ai/types/chat";
import type { ToolContext, ToolResult } from "../types";
import { ok, err } from "../types";
import { BaseTool } from "../base.tool";
import type { MarketplaceServices, ProductSummary } from "./types";
import { toProductSummary, clamp } from "./types";

/* ------------------------------------------------------------------ *
 * Input / Output
 * ------------------------------------------------------------------ */

export interface ProductRecommendationInput {
  /** Recommendation strategy to use. */
  strategy: "smart" | "because_you_viewed" | "popular_in_category";
  /** Category slug — required when strategy is 'popular_in_category'. */
  category?: string;
  /** Maximum number of recommendations (default 8, max 20). */
  limit?: number;
}

export interface ProductRecommendationOutput {
  products: ProductSummary[];
  strategy: string;
  /** The product title that triggered the recommendations (only for 'because_you_viewed'). */
  contextProductTitle?: string;
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/* ------------------------------------------------------------------ *
 * Tool
 * ------------------------------------------------------------------ */

export class ProductRecommendationTool extends BaseTool<
  ProductRecommendationInput,
  ProductRecommendationOutput,
  MarketplaceServices
> {
  readonly name = "get_recommendations";

  readonly description =
    "Get personalised product recommendations for the current customer. " +
    "Supports three strategies: 'smart' (composite-scored based on browsing history), " +
    "'because_you_viewed' (products similar to the last viewed item), or " +
    "'popular_in_category' (top sellers in a specific category).";

  readonly audiences: readonly ChatAudience[] = ["customer"];

  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      strategy: {
        type: "string",
        description:
          "Recommendation strategy: 'smart' for personalised composite scoring, " +
          "'because_you_viewed' for similar-to-last-viewed, or " +
          "'popular_in_category' for category bestsellers",
        enum: ["smart", "because_you_viewed", "popular_in_category"],
      },
      category: {
        type: "string",
        description:
          "Category slug — required when strategy is 'popular_in_category' " +
          "(e.g. 'pashmina', 'saffron', 'dry-fruits')",
      },
      limit: {
        type: "number",
        description: `Maximum number of recommendations (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
      },
    },
    required: ["strategy"],
  };

  /* ---- Validation ------------------------------------------------ */

  protected validate(input: ProductRecommendationInput): string | null {
    const validStrategies = ["smart", "because_you_viewed", "popular_in_category"];
    if (!validStrategies.includes(input.strategy)) {
      return `strategy must be one of: ${validStrategies.join(", ")}.`;
    }
    if (input.strategy === "popular_in_category" && !input.category) {
      return "category is required when strategy is 'popular_in_category'.";
    }
    return null;
  }

  /* ---- Execution ------------------------------------------------- */

  protected async run(
    input: ProductRecommendationInput,
    context: ToolContext<MarketplaceServices>,
  ): Promise<ToolResult<ProductRecommendationOutput>> {
    const services = context.services;
    if (!services) {
      return err("Marketplace services not available.", "unavailable");
    }

    const userId = context.userId;
    if (!userId) {
      return err("User must be signed in to receive recommendations.", "unauthorized");
    }

    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const recService = services.aiRecommendationService;

    switch (input.strategy) {
      case "smart": {
        const products = await recService.getSmartRecommendations(userId, limit);
        return ok({
          products: products.map(toProductSummary),
          strategy: "smart",
        });
      }

      case "because_you_viewed": {
        const result = await recService.getBecauseYouViewed(userId, limit);
        if (!result) {
          return ok({
            products: [],
            strategy: "because_you_viewed",
            contextProductTitle: undefined,
          });
        }
        return ok({
          products: result.products.map(toProductSummary),
          strategy: "because_you_viewed",
          contextProductTitle: result.contextProductTitle,
        });
      }

      case "popular_in_category": {
        const products = await recService.getPopularInCategory(input.category!, limit);
        return ok({
          products: products.map(toProductSummary),
          strategy: "popular_in_category",
        });
      }

      default:
        return err(`Unknown strategy: ${input.strategy}`, "invalid_input");
    }
  }
}
