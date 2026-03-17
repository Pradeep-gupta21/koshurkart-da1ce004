import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PgEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseRealtimeOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  table: string;
  event?: PgEvent;
  schema?: string;
  filter?: string;
  onPayload: (payload: RealtimePostgresChangesPayload<T>) => void;
  enabled?: boolean;
}

/**
 * Generic hook to subscribe to Supabase Realtime postgres_changes.
 * Cleans up on unmount or when deps change.
 */
export function useRealtimeSubscription<T extends Record<string, unknown> = Record<string, unknown>>({
  table,
  event = "*",
  schema = "public",
  filter,
  onPayload,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const channelName = `realtime:${table}:${event}:${filter ?? "all"}`;

    const pgFilter: Record<string, string> = {
      event,
      schema,
      table,
    };
    if (filter) {
      (pgFilter as any).filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes" as any, pgFilter, (payload: any) => {
        onPayload(payload);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, schema, filter, enabled]);
}
