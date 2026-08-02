import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface ProductKnowledgeInput {
  query: string;
}

export class ProductKnowledgeTool extends BaseCommerceTool<ProductKnowledgeInput, any> {
  readonly name = "product_knowledge";
  readonly description = "Get structured knowledge about products, categories, materials, craftsmanship, artisan info, pricing, and availability. Use this tool for natural language questions about products like 'What is Pashmina?', 'Tell me about Kashmiri saffron.', or 'Who made this?'.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The natural language query or product name to get knowledge about.",
      },
    },
    required: ["query"],
  };

  protected validate(input: ProductKnowledgeInput): string | null {
    if (!input.query) {
      return "Must provide a query.";
    }
    return null;
  }

  protected async run(
    input: ProductKnowledgeInput,
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
      // 1. Intelligently identify products from user text using searchProducts
      const searchResult = await productService.searchProducts(input.query);

      if (!searchResult.success) {
        return err({
          code: "execution_error",
          message: searchResult.error.message,
        });
      }

      const products = searchResult.data || [];
      
      if (products.length === 0) {
        return ok({
          message: `No specific product knowledge found for '${input.query}'.`,
          results: []
        });
      }

      // 2. Return structured responses instead of raw database objects
      // Format the top 3 results to give comprehensive knowledge
      const structuredKnowledge = products.slice(0, 3).map(product => {
        return {
          productName: product.title,
          category: product.category,
          description: product.description,
          artisanInformation: {
            vendorName: product.vendorName,
            regionOfOrigin: product.vendorPickupState || "Kashmir",
          },
          pricing: {
            price: product.price,
            discountPrice: product.discountPrice,
            hasDiscount: !!product.discountPrice && product.discountPrice < product.price
          },
          availability: {
            stock: product.stock,
            inStock: product.stock > 0,
            lowStockThreshold: product.lowStockThreshold
          },
          reputation: {
            rating: product.rating,
            reviewCount: product.reviewCount
          },
          tags: product.tags || [],
          // Fields inferred from product tags/description conceptually:
          materials: "Refer to description and tags for specific materials.",
          craftsmanship: "Authentic Kashmiri craftsmanship.",
          careInstructions: "Refer to description for specific care instructions.",
          authenticity: "100% Authentic."
        };
      });

      return ok({
        query: input.query,
        knowledgeFound: structuredKnowledge.length > 0,
        results: structuredKnowledge
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
