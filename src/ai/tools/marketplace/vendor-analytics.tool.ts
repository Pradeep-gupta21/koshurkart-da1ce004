/**
 * KoshurKart — VendorAnalyticsTool
 * =================================================================
 * Aggregates vendor performance data: product/campaign/sales stats,
 * traffic analytics (views, ad impressions/clicks, conversion rate,
 * sales growth), and trust metrics.
 *
 * Identity resolution:
 *  - **vendor** audience → vendor id resolved from `context.userId`
 *    via `vendorService.getByUserId()`.
 *  - **admin** audience → may specify any `vendorId` in the input;
 *    falls back to context if omitted.
 *
 * Audience: vendor and admin.
 */

import type { ChatAudience, JSONSchema } from "@/ai/types/chat";
import type { ToolContext, ToolResult } from "../types";
import { ok, err } from "../types";
import { BaseTool } from "../base.tool";
import type {
  MarketplaceServices,
  VendorStats,
  TrustMetrics,
  RawVendorAnalytics,
} from "./types";

/* ------------------------------------------------------------------ *
 * Input / Output
 * ------------------------------------------------------------------ */

export interface VendorAnalyticsInput {
  /** Vendor id — admin can specify any vendor; vendors resolved from context. */
  vendorId?: string;
}

export interface VendorAnalyticsOutput {
  vendorId: string;
  stats: VendorStats;
  analytics: RawVendorAnalytics;
  trustMetrics: TrustMetrics;
}

/* ------------------------------------------------------------------ *
 * Tool
 * ------------------------------------------------------------------ */

export class VendorAnalyticsTool extends BaseTool<
  VendorAnalyticsInput,
  VendorAnalyticsOutput,
  MarketplaceServices
> {
  readonly name = "get_vendor_analytics";

  readonly description =
    "Get performance analytics for a vendor: product/campaign/sales stats, " +
    "traffic metrics (views, ad impressions, clicks, conversion rate, sales growth), " +
    "and trust metrics (trust score, delivery rate, cancellation rate, return rate). " +
    "Vendors see their own data; admins can look up any vendor by id.";

  readonly audiences: readonly ChatAudience[] = ["vendor", "admin"];

  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      vendorId: {
        type: "string",
        description:
          "Vendor UUID — only admins may specify this to look up another vendor. " +
          "Vendors always see their own analytics.",
      },
    },
  };

  /* ---- Execution ------------------------------------------------- */

  protected async run(
    input: VendorAnalyticsInput,
    context: ToolContext<MarketplaceServices>,
  ): Promise<ToolResult<VendorAnalyticsOutput>> {
    const services = context.services;
    if (!services) {
      return err("Marketplace services not available.", "unavailable");
    }

    // Resolve vendorId based on audience.
    const vendorId = await this.resolveVendorId(input, context, services);
    if (!vendorId) {
      return err("Could not resolve vendor. No vendor account found for the current user.", "not_found");
    }

    // Fetch all three data sources in parallel.
    const [stats, analytics, trustMetrics] = await Promise.all([
      services.vendorService.getStats(vendorId),
      services.analyticsService.getVendorAnalytics(vendorId),
      services.vendorService.getTrustMetrics(vendorId),
    ]);

    return ok({ vendorId, stats, analytics, trustMetrics });
  }

  /* ---- Identity resolution -------------------------------------- */

  /**
   * Resolves the target vendor id:
   *  - Admin audience with explicit vendorId → use it directly.
   *  - Otherwise → look up the vendor row by the authenticated user id.
   */
  private async resolveVendorId(
    input: VendorAnalyticsInput,
    context: ToolContext<MarketplaceServices>,
    services: MarketplaceServices,
  ): Promise<string | null> {
    // Admin with an explicit vendor id.
    if (context.audience === "admin" && input.vendorId) {
      return input.vendorId;
    }

    // Resolve from authenticated user.
    const userId = context.userId;
    if (!userId) return null;

    const vendor = await services.vendorService.getByUserId(userId);
    return vendor?.id ?? null;
  }
}
