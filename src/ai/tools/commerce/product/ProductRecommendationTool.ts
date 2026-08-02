import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult, isOk } from "../../types";
import { SearchProductsTool, SearchProductsInput } from "./SearchProductsTool";

export interface RecommendProductsInput {
  budget?: number;
  occasion?: string;
  category?: string;
  recipient?: string;
  preference?: "luxury" | "budget" | "premium" | "handcrafted" | "default";
}

export interface RecommendedProduct {
  id: string;
  title: string;
  price: number;
  category: string;
  description: string;
  relevanceScore: number;
  matchReasons: string[];
}

export interface RecommendProductsOutput {
  recommendations: RecommendedProduct[];
  message: string;
}

export class ProductRecommendationTool extends BaseCommerceTool<RecommendProductsInput, RecommendProductsOutput> {
  readonly name = "recommend_products";
  readonly description = "Recommend products based on user preferences like budget, occasion, recipient, and category. Returns ranked products with relevance scores.";

  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      budget: { type: "number", description: "Maximum budget in INR" },
      occasion: { type: "string", description: "Event or occasion, e.g., 'wedding', 'anniversary'" },
      category: { type: "string", description: "Specific category, e.g., 'Pashmina', 'Saffron'" },
      recipient: { type: "string", description: "Who the gift is for, e.g., 'parents', 'wife'" },
      preference: {
        type: "string",
        enum: ["luxury", "budget", "premium", "handcrafted", "default"],
        description: "Style or price preference",
      },
    },
    required: [],
  };

  protected async run(
    input: RecommendProductsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<RecommendProductsOutput>> {
    const searchTool = new SearchProductsTool();

    // Map recommendation input to search input
    const searchInput: SearchProductsInput = {
      maxPrice: input.budget,
      category: input.category,
      featured: input.preference === "luxury" || input.preference === "premium",
      keywords: [],
    };

    if (input.occasion) searchInput.keywords!.push(input.occasion);
    if (input.recipient) searchInput.keywords!.push(input.recipient);
    if (input.preference === "handcrafted") searchInput.keywords!.push("handcrafted");

    // Perform search by reusing SearchProductsTool
    const searchResult = await searchTool.execute(searchInput, context);

    if (!searchResult.ok) {
      return err(searchResult.error);
    }

    const products = searchResult.data.products;

    if (!products || products.length === 0) {
      return ok({
        recommendations: [],
        message: "No suitable recommendations found for your criteria.",
      });
    }

    // Rank products by relevance
    const rankedProducts = products.map((p: any) => {
      let score = 0;
      const reasons: string[] = [];

      const title = (p.title || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();

      // Budget check
      if (input.budget && p.price <= input.budget) {
        score += 10;
        reasons.push("Fits within your budget.");
      }

      // Category check
      if (input.category && p.category && p.category.toLowerCase().includes(input.category.toLowerCase())) {
        score += 20;
        reasons.push(`Matches the requested category.`);
      }

      // Keyword match (occasion, recipient, preference)
      if (input.occasion && (title.includes(input.occasion.toLowerCase()) || desc.includes(input.occasion.toLowerCase()))) {
        score += 15;
        reasons.push(`Perfect for ${input.occasion}.`);
      }
      
      if (input.recipient && (title.includes(input.recipient.toLowerCase()) || desc.includes(input.recipient.toLowerCase()))) {
        score += 15;
        reasons.push(`Great gift for ${input.recipient}.`);
      }

      // Preference logic
      if (input.preference === "luxury" || input.preference === "premium") {
        if (p.price >= 5000 || p.is_sponsored || p.trending_score >= 50) {
          score += 20;
          reasons.push(`Premium quality product.`);
        }
      } else if (input.preference === "budget") {
        if (p.price < 2000) {
          score += 15;
          reasons.push("Budget-friendly choice.");
        }
      }

      if (input.preference === "handcrafted" && (title.includes("handcrafted") || desc.includes("handcrafted") || desc.includes("handmade"))) {
        score += 20;
        reasons.push("Authentic handcrafted item.");
      }

      // Base relevance
      if (score === 0) {
         score = 5;
         reasons.push("Recommended based on your overall preferences.");
      }

      return {
        id: p.id,
        title: p.title,
        price: p.price,
        category: p.category,
        description: p.description,
        relevanceScore: score,
        matchReasons: reasons,
      };
    });

    // Sort by relevance score descending
    rankedProducts.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return ok({
      recommendations: rankedProducts,
      message: `Found ${rankedProducts.length} recommendations.`,
    });
  }
}
