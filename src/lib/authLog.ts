import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side helper to record auth events.
 *
 * Writes happen via the `log-auth-event` edge function (service-role) because
 * the `auth_events` table is insert-restricted to service_role for integrity.
 *
 * Failures are swallowed — auth logging must never block the user flow.
 */
export type AuthEventType =
  | "login_success"
  | "login_failure"
  | "signup_success"
  | "signup_failure"
  | "signout"
  | "password_reset_request"
  | "password_reset_complete"
  | "otp_send"
  | "otp_verify_success"
  | "otp_verify_failure"
  | "session_revoke";

export async function logAuthEvent(
  event: AuthEventType,
  opts: { email?: string; success?: boolean; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await supabase.functions.invoke("log-auth-event", {
      body: {
        event_type: event,
        email: opts.email ?? null,
        success: opts.success ?? true,
        metadata: opts.metadata ?? {},
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    });
  } catch {
    // Never throw from logging
  }
}
