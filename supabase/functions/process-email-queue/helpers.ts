/**
 * Pure classification helpers shared between the email queue worker and its tests.
 * No side effects; safe to import in test files.
 */

// Check if an error is a rate-limit (429) response.
export function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const statusVal = (error as { status: unknown }).status;
    if (typeof statusVal === 'number' || typeof statusVal === 'string') {
      const parsedStatus = Number(statusVal);
      if (Number.isInteger(parsedStatus) && parsedStatus >= 100 && parsedStatus <= 599) {
        return parsedStatus === 429;
      }
    }
  }
  if (error instanceof Error) {
    return /(?:HTTP(?:\s+status)?\s+|status[:=\s]+|Brevo\s+)429\b/i.test(error.message);
  }
  return false;
}

// Check if an error is a forbidden (403) response. Retrying won't help.
export function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const statusVal = (error as { status: unknown }).status;
    if (typeof statusVal === 'number' || typeof statusVal === 'string') {
      const parsedStatus = Number(statusVal);
      if (Number.isInteger(parsedStatus) && parsedStatus >= 100 && parsedStatus <= 599) {
        return parsedStatus === 403;
      }
    }
  }
  if (error instanceof Error) {
    return /(?:HTTP(?:\s+status)?\s+|status[:=\s]+|Brevo\s+)403\b/i.test(error.message);
  }
  return false;
}

const MAX_COOLDOWN_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    const raw = (error as { retryAfterSeconds: unknown }).retryAfterSeconds;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      // Prevent JS Date overflow (Invalid Date) and PostgreSQL TIMESTAMPTZ overflow.
      // A maximum of 30 days is operationally safe: it fully respects realistic
      // provider bans (minutes to days) while preventing absurd values (e.g. centuries)
      // from permanently paralyzing the worker without manual intervention.
      return Math.min(raw, MAX_COOLDOWN_SECONDS);
    }
  }
  return 60;
}

export function applyDurableBrevoCooldown(
  currentUntilMs: number,
  retryAfterUntil: string | null | undefined,
  nowMs: number
): number {
  if (typeof retryAfterUntil !== 'string') return currentUntilMs
  const parsedTimestamp = Date.parse(retryAfterUntil)
  if (!Number.isNaN(parsedTimestamp) && parsedTimestamp > nowMs) {
    return Math.max(currentUntilMs, parsedTimestamp)
  }
  return currentUntilMs
}

// Move a message to the dead letter queue and log the reason.
// Returns true if the RPC transfer succeeds, false otherwise.
export async function moveToDlq(
  supabase: any,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string
): Promise<boolean> {
  const payload = msg.message
  let error;
  try {
    const result = await supabase.rpc('move_to_dlq', {
      source_queue: queue,
      dlq_name: `${queue}_dlq`,
      message_id: msg.msg_id,
      payload,
    })
    error = result.error;
  } catch (err) {
    error = err;
  }
  if (error) {
    console.error('DLQ TRANSFER FAILED — SOURCE MESSAGE PRESERVED FOR RETRY', { 
      queue, 
      msg_id: msg.msg_id, 
      message_id: payload.message_id,
      reason, 
      error 
    })
    return false
  }

  let logError;
  try {
    const res = await supabase.from('email_send_log').insert({
      message_id: payload.message_id,
      template_name: (payload.label || queue) as string,
      recipient_email: payload.to,
      status: 'dlq',
      error_message: reason,
    })
    logError = res.error;
  } catch (err) {
    logError = err;
  }

  if (logError) {
    console.error('Failed to log successful DLQ transfer', { queue, msg_id: msg.msg_id, error: logError })
  }

  return true
}
