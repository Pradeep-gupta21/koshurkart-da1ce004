import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { SearchProductsTool, SearchProductsInput } from "./SearchProductsTool";
import { RecentlyViewedStore } from "../recently-viewed/store";

export interface RecommendForUserInput {
  preferredCategories?: string[];
  preferredArtisans?: string[];
  preferredPriceRange?: { min?: number; max?: number };
}

export interface RecommendedProductForUser {
  product: any;
  score: number;
  confidence: "High" | "Medium" | "Low";
  reason: string;
}

export interface RecommendForUserOutput {
  recommendations: RecommendedProductForUser[];
  message: string;
}

export class RecommendForUserTool extends BaseCommerceTool<RecommendForUserInput, RecommendForUserOutput> {
  readonly name = "recommend_for_user";
  readonly description = "Recommend personalized products for the customer based on their purchase history, wishlist, recently viewed items, and optional explicit preferences. Call this when the customer asks 'Recommend something for me', 'What should I buy?', or wants personalized suggestions.";

  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      preferredCategories: { 
        type: "array", 
        items: { type: "string" },
        description: "Explicitly requested categories, if any."
      },
      preferredArtisans: { 
        type: "array", 
        items: { type: "string" },
        description: "Explicitly requested artisans or vendors, if any."
      },
      preferredPriceRange: {
        type: "object",
        properties: {
          min: { type: "number" },
          max: { type: "number" }
        },
        description: "Explicitly requested price range, if any."
      }
    }
  };

  protected async run(
    input: RecommendForUserInput,
    context: CommerceToolContext
  ): Promise<ToolResult<RecommendForUserOutput>> {
    // 1. Fetch a base set of products to score
    const searchTool = new SearchProductsTool();
    const searchInput: SearchProductsInput = {
      limit: 50
    };
    
    if (input.preferredPriceRange?.max) {
      searchInput.maxPrice = input.preferredPriceRange.max;
    }
    
    const searchResult = await searchTool.execute(searchInput, context);
    if (!searchResult.ok) {
      return err(searchResult.error);
    }
    
    const products = searchResult.data.products || [];
    if (products.length === 0) {
      return ok({
        recommendations: [],
        message: "No products available to recommend."
      });
    }

    // 2. Fetch user personalization context
    let pastOrders: any[] = [];
    let wishlistItems: any[] = [];
    let viewedItems: any[] = [];

    if (context.userId) {
      if (context.services?.order) {
        try {
          const orderRes = await context.services.order.getCustomerOrders(context.userId);
          if (orderRes.success && orderRes.data) pastOrders = orderRes.data;
        } catch (e) {
          // ignore error
        }
      }
      
      if (context.services?.wishlist) {
        try {
          const wishlistRes = await context.services.wishlist.getWishlist(context.userId);
          if (wishlistRes.success && wishlistRes.data) wishlistItems = wishlistRes.data;
        } catch (e) {
          // ignore error
        }
      }
      
      try {
        viewedItems = RecentlyViewedStore.get(context.userId);
      } catch (e) {
        // ignore error
      }
    }

    // 3. Extract preferred things from user history
    const historyCategories = new Set<string>();
    const historyVendors = new Set<string>();

    pastOrders.forEach(o => {
      o.items?.forEach((item: any) => {
        if (item.product?.category) historyCategories.add(item.product.category.toLowerCase());
        if (item.product?.vendorId) historyVendors.add(item.product.vendorId);
      });
    });

    wishlistItems.forEach(w => {
      if (w.product?.category) historyCategories.add(w.product.category.toLowerCase());
      if (w.product?.vendorId) historyVendors.add(w.product.vendorId);
    });

    viewedItems.forEach(v => {
      if (v.category) historyCategories.add(v.category.toLowerCase());
      if (v.vendorId) historyVendors.add(v.vendorId);
    });

    // 4. Score products
    const recommendations: RecommendedProductForUser[] = [];

    products.forEach((p: any) => {
      let score = 0;
      const reasons: string[] = [];
      const pCat = (p.category || "").toLowerCase();

      let categoryMatched = false;
      if (input.preferredCategories && input.preferredCategories.length > 0) {
        if (input.preferredCategories.some(c => pCat.includes(c.toLowerCase()))) {
          score += 30;
          reasons.push("Matches your preferred category.");
          categoryMatched = true;
        }
      } 
      
      if (!categoryMatched && historyCategories.has(pCat)) {
        score += 15;
        reasons.push("Matches categories you have previously purchased, wishlisted, or viewed.");
      }

      let artisanMatched = false;
      if (input.preferredArtisans && input.preferredArtisans.length > 0) {
        if (input.preferredArtisans.some(a => p.vendorId === a || (p.vendor?.name || "").toLowerCase().includes(a.toLowerCase()))) {
          score += 30;
          reasons.push("Created by an artisan you prefer.");
          artisanMatched = true;
        }
      } 
      
      if (!artisanMatched && p.vendorId && historyVendors.has(p.vendorId)) {
        score += 15;
        reasons.push("From an artisan you have previously engaged with.");
      }

      if (input.preferredPriceRange) {
        const min = input.preferredPriceRange.min ?? 0;
        const max = input.preferredPriceRange.max ?? Infinity;
        if (p.price >= min && p.price <= max) {
          score += 20;
          reasons.push("Fits within your desired price range.");
        }
      }

      const inWishlist = wishlistItems.some(w => w.productId === p.id);
      if (inWishlist) {
        score += 25;
        reasons.push("You previously added this to your wishlist.");
      }

      const inViewed = viewedItems.some(v => v.id === p.id);
      if (inViewed && !inWishlist) {
        score += 10;
        reasons.push("You recently viewed this product.");
      }
      
      if (p.trending_score && p.trending_score > 80) {
          score += 5;
          reasons.push("Highly rated by other customers.");
      }

      if (score === 0) {
          score = 1;
          reasons.push("Recommended for you.");
      }

      recommendations.push({
        product: {
            id: p.id,
            title: p.title,
            price: p.price,
            category: p.category,
            description: p.description,
            vendorId: p.vendorId
        },
        score,
        confidence: score >= 40 ? "High" : score >= 20 ? "Medium" : "Low",
        reason: reasons.join(" ")
      });
    });

    recommendations.sort((a, b) => b.score - a.score);
    const topRecommendations = recommendations.slice(0, 5);

    return ok({
      recommendations: topRecommendations,
      message: topRecommendations.length > 0 
        ? `Found ${topRecommendations.length} personalized recommendations for you.`
        : "No personalized recommendations available."
    });
  }
}
