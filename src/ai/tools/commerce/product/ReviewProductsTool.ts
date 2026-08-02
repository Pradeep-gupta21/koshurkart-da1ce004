import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface ReviewProductsInput {
  query?: string;
  productId?: string;
}

export class ReviewProductsTool extends BaseCommerceTool<ReviewProductsInput, any> {
  readonly name = "review_products";
  readonly description = "Retrieve and summarize product reviews and ratings. Use this tool for queries like 'Is this product good?', 'What do buyers think?', 'Show reviews', 'Highest rated products', etc.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The product name or query to find reviews for.",
      },
      productId: {
        type: "string",
        description: "The specific product ID, if known.",
      },
    },
  };

  protected validate(input: ReviewProductsInput): string | null {
    if (!input.query && !input.productId) {
      return "Must provide either a query or a productId.";
    }
    return null;
  }

  protected async run(
    input: ReviewProductsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    const productService = context.services?.product;

    if (!productService) {
      return err({
        code: "unavailable",
        message: "Product service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      let product: any = null;

      if (input.productId) {
        const pResult = await productService.getProductById(input.productId);
        if (pResult.success && pResult.data) {
          product = pResult.data;
        }
      } else if (input.query) {
        const searchResult = await productService.searchProducts(input.query, { limit: 1 });
        if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
          product = searchResult.data[0];
        }
      }

      if (!product) {
        return ok({
          message: `No product found for '${input.productId || input.query}'.`,
          results: []
        });
      }

      const { reviewService } = await import("@/services/reviewService");
      const summaryData = await reviewService.getReviewSummary(product.id);
      const reviews = await reviewService.getReviews(product.id, { limit: 20 });

      const positiveReviews = reviews.filter(r => r.rating >= 4).map(r => r.comment || r.title || "").filter(Boolean);
      const negativeReviews = reviews.filter(r => r.rating <= 3).map(r => r.comment || r.title || "").filter(Boolean);
      const highlights = reviews.filter(r => r.helpful_count > 0).map(r => r.comment || r.title || "").filter(Boolean);

      const isGood = summaryData.average >= 4.0;
      const recommendation = summaryData.total === 0 
        ? "Not enough reviews to make a recommendation." 
        : isGood 
          ? "Highly recommended by buyers." 
          : "Mixed reviews, use discretion.";

      const summaryText = summaryData.total > 0 
        ? `Based on ${summaryData.total} reviews, this product has an average rating of ${summaryData.average.toFixed(1)} out of 5.` 
        : "There are no reviews for this product yet.";

      const structuredResult = {
        product: {
          id: product.id,
          name: product.title || product.name,
          category: product.category,
        },
        averageRating: summaryData.average,
        totalReviews: summaryData.total,
        ratingDistribution: summaryData.distribution,
        summary: summaryText,
        reviewHighlights: highlights.slice(0, 3),
        pros: positiveReviews.slice(0, 5),
        cons: negativeReviews.slice(0, 3),
        recommendation: recommendation
      };

      return ok(structuredResult);
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
