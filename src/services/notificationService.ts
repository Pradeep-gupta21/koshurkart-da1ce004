import { supabase } from '@/integrations/supabase/client';
import type { AppNotification } from '@/types/notification';

const mapRow = (row: any): AppNotification => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  message: row.message,
  entityId: row.entity_id,
  metadata: row.metadata ?? {},
  isRead: row.is_read,
  createdAt: row.created_at,
});

export const notificationService = {
  async getUserNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
    return count ?? 0;
  },

  async markAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    if (error) throw error;
  },

  async markAllAsRead(userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
  },

  subscribeToNotifications(userId: string, callback: (notification: AppNotification) => void) {
    // Unique channel name per subscription instance avoids
    // "cannot add postgres_changes callbacks ... after subscribe()" errors
    // from StrictMode double-mounts or re-subscribes reusing a live channel.
    const channelName = `notifications:${userId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => callback(mapRow(payload.new))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
