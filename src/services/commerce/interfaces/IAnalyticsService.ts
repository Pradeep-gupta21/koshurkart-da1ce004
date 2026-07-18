import { Result, CommerceError } from '../types/Result';

export interface AnalyticsEvent {
  eventName: string;
  userId?: string;
  sessionId?: string;
  eventData?: Record<string, any>;
  timestamp?: string;
}

export interface IAnalyticsService {
  trackEvent(event: AnalyticsEvent): Promise<Result<boolean, CommerceError>>;
  trackPageView(pageUrl: string, userId?: string): Promise<Result<boolean, CommerceError>>;
}
