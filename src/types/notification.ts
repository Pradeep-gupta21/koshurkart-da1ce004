export type NotificationType =
  | 'order_placed'
  | 'order_shipped'
  | 'order_delivered'
  | 'vendor_verified'
  | 'review_submitted';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}
