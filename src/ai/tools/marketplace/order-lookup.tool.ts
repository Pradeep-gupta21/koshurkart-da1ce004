/**
 * KoshurKart — OrderLookupTool
 * =================================================================
 * Looks up orders for the current user. Behaviour adapts to the
 * caller's audience:
 *
 *  - **customer** → own orders via `orderService.getUserOrders()`
 *  - **vendor**   → order items for the vendor's store via
 *                    `orderService.getVendorOrderItems()`
 *  - **admin**    → (same as customer path for now; will be expanded
 *                    once an admin-level order RPC exists)
 *
 * Optionally fetches shipment tracking events for a specific order.
 *
 * Audience: unrestricted (all three surfaces).
 */

import type { JSONSchema } from "@/ai/types/chat";
import type { ToolContext, ToolResult } from "../types";
import { ok, err } from "../types";
import { BaseTool } from "../base.tool";
import type {
  MarketplaceServices,
  OrderSummary,
  RawOrder,
  RawOrderItem,
} from "./types";
import {
  toOrderSummary,
  toOrderItemSummary,
  toShipmentEventSummary,
  clamp,
} from "./types";

/* ------------------------------------------------------------------ *
 * Input / Output
 * ------------------------------------------------------------------ */

export interface OrderLookupInput {
  /** Filter to a specific order by id. */
  orderId?: string;
  /** Include shipment tracking events (only when orderId is specified). */
  includeShipment?: boolean;
  /** Maximum number of orders to return (default 10, max 50). */
  limit?: number;
}

export interface OrderLookupOutput {
  orders: OrderSummary[];
  totalCount: number;
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/* ------------------------------------------------------------------ *
 * Tool
 * ------------------------------------------------------------------ */

export class OrderLookupTool extends BaseTool<
  OrderLookupInput,
  OrderLookupOutput,
  MarketplaceServices
> {
  readonly name = "lookup_orders";

  readonly description =
    "Look up orders for the current user. Customers see their own orders; " +
    "vendors see order items for their store. Optionally includes shipment " +
    "tracking events for a specific order.";

  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "Filter to a specific order by its UUID",
      },
      includeShipment: {
        type: "boolean",
        description: "Include shipment tracking events (only when orderId is specified)",
      },
      limit: {
        type: "number",
        description: `Maximum number of orders to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
      },
    },
  };

  /* ---- Execution ------------------------------------------------- */

  protected async run(
    input: OrderLookupInput,
    context: ToolContext<MarketplaceServices>,
  ): Promise<ToolResult<OrderLookupOutput>> {
    const services = context.services;
    if (!services) {
      return err("Marketplace services not available.", "unavailable");
    }

    const userId = context.userId;
    if (!userId) {
      return err("User must be signed in to look up orders.", "unauthorized");
    }

    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

    switch (context.audience) {
      case "customer":
      case "admin":
        return this.lookupCustomerOrders(input, userId, limit, services);

      case "vendor":
        return this.lookupVendorOrders(input, userId, limit, services);

      default:
        return err(`Unsupported audience: ${context.audience}`, "invalid_input");
    }
  }

  /* ---- Customer / Admin path ------------------------------------ */

  private async lookupCustomerOrders(
    input: OrderLookupInput,
    userId: string,
    limit: number,
    services: MarketplaceServices,
  ): Promise<ToolResult<OrderLookupOutput>> {
    const rawOrders: RawOrder[] = await services.orderService.getUserOrders(userId, limit);

    let orders = rawOrders.map(toOrderSummary);

    // Filter to a specific order if requested.
    if (input.orderId) {
      orders = orders.filter((o) => o.id === input.orderId);
    }

    // Attach shipment events if requested and a specific order is targeted.
    if (input.includeShipment && input.orderId && orders.length > 0) {
      const events = await services.orderService.getShipmentEvents(input.orderId);
      orders[0].shipmentEvents = events.map(toShipmentEventSummary);
    }

    return ok({ orders, totalCount: orders.length });
  }

  /* ---- Vendor path ---------------------------------------------- */

  private async lookupVendorOrders(
    input: OrderLookupInput,
    userId: string,
    limit: number,
    services: MarketplaceServices,
  ): Promise<ToolResult<OrderLookupOutput>> {
    // Resolve the vendor id from the authenticated user.
    const vendor = await services.vendorService.getByUserId(userId);
    if (!vendor) {
      return err("No vendor account found for the current user.", "not_found");
    }

    const rawItems: RawOrderItem[] = await services.orderService.getVendorOrderItems(
      vendor.id,
      limit,
    );

    // Vendor order items don't nest inside an order envelope — we build
    // a flat summary per item so the model can still reason about them.
    const orders: OrderSummary[] = rawItems.map((item) => ({
      id: item.id,
      totalAmount: item.price * item.quantity,
      orderStatus: "n/a",
      paymentStatus: "n/a",
      shippingStatus: null,
      trackingId: null,
      estimatedDelivery: null,
      createdAt: "",
      items: [toOrderItemSummary(item)],
    }));

    // Filter to a specific order-item if requested.
    const filtered = input.orderId
      ? orders.filter((o) => o.id === input.orderId)
      : orders;

    return ok({ orders: filtered, totalCount: filtered.length });
  }
}
