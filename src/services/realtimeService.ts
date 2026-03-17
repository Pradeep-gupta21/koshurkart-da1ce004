import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const REALTIME_EVENTS = {
  NEW_ORDER: "new_order",
  ORDER_STATUS_UPDATE: "order_status_update",
  AD_CLICK: "ad_click",
  FRAUD_ALERT: "fraud_alert",
} as const;

export const realtimeService = {
  subscribeToTable(
    table: string,
    event: "INSERT" | "UPDATE" | "DELETE" | "*",
    callback: (payload: any) => void,
    filter?: string,
  ): RealtimeChannel {
    const channelName = `rt:${table}:${event}:${filter ?? "all"}:${Date.now()}`;
    const pgFilter: Record<string, string> = { event, schema: "public", table };
    if (filter) (pgFilter as any).filter = filter;

    return supabase
      .channel(channelName)
      .on("postgres_changes" as any, pgFilter, callback)
      .subscribe();
  },

  unsubscribe(channel: RealtimeChannel) {
    supabase.removeChannel(channel);
  },
};
