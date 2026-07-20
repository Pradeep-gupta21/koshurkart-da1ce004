import { IAnalyticsService, AnalyticsEvent } from '../../interfaces/IAnalyticsService';
import { Result, CommerceError } from '../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseAnalyticsService implements IAnalyticsService {
  private supabase = supabase;

  async trackEvent(event: AnalyticsEvent): Promise<Result<boolean, CommerceError>> {
    try {
      const { error } = await this.supabase
        .from('analytics_events')
        .insert({
          event_type: event.eventName,
          user_id: event.userId,
          session_id: event.sessionId,
          event_data: event.eventData,
          created_at: event.timestamp || new Date().toISOString()
        } as any);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: true
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async trackPageView(pageUrl: string, userId?: string): Promise<Result<boolean, CommerceError>> {
    try {
      const { error } = await this.supabase
        .from('analytics_events')
        .insert({
          event_type: 'page_view',
          user_id: userId,
          event_data: { page_url: pageUrl },
          created_at: new Date().toISOString()
        } as any);

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: true
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }
}
