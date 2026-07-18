import { Result, CommerceError } from '../types/Result';
import { AppNotification } from '@/types';

export interface INotificationService {
  getNotifications(userId: string): Promise<Result<AppNotification[], CommerceError>>;
  getUnreadCount(userId: string): Promise<Result<number, CommerceError>>;
  markAsRead(notificationId: string): Promise<Result<boolean, CommerceError>>;
  markAllAsRead(userId: string): Promise<Result<boolean, CommerceError>>;
}
