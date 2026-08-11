import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendViaBrevo } from '../_shared/brevo.ts'
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { isRateLimited, isForbidden, getRetryAfterSeconds, moveToDlq, applyDurableBrevoCooldown } from './helpers.ts';

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, 'Server configuration error', false), { 'Content-Type': 'application/json' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.UNAUTHORIZED, 'Unauthorized', false), { 'Content-Type': 'application/json' })
  }

  // Defense in depth: verify_jwt=true already requires a valid JWT at the
  // gateway layer. This adds an explicit role check so only service-role
  // callers can trigger queue processing.
  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return respondWithError(new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.FORBIDDEN, 'Forbidden', false), { 'Content-Type': 'application/json' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey) as any

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // Invocation-scoped provider state. Must live inside the handler so they
  // are reset on every invocation and never leak between requests.
  let brevoRateLimitedUntil = 0 // ms epoch; 0 = no cooldown active
  let brevoDisabled = false     // true after a 403 from Brevo this batch

  // 1.5. Pre-fetch durable Brevo cooldown
  const { data: durableBrevoCooldown, error: brevoCooldownError } = await supabase
    .from('email_provider_cooldowns')
    .select('retry_after_until')
    .eq('provider', 'brevo')
    .maybeSingle()

  if (brevoCooldownError) {
    console.error('Failed to read durable Brevo cooldown:', brevoCooldownError)
  } else {
    brevoRateLimitedUntil = applyDurableBrevoCooldown(
      brevoRateLimitedUntil,
      durableBrevoCooldown?.retry_after_until,
      Date.now()
    )
  }

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    if (!messages?.length) continue

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg: { message: { message_id: any; }; }) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id: any): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          error: failedRowsError,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message

      const messageId = payload?.message_id && typeof payload.message_id === 'string'
        ? payload.message_id
        : null

      if (!messageId) {
        console.error('Invariant error: message missing message_id', {
          queue,
          msg_id: msg.msg_id
        })
        await moveToDlq(supabase, queue, msg, 'Invariant error: missing message_id')
        continue
      }

      const failedAttempts = failedAttemptsByMessageId.get(messageId) ?? 0

      // Drop expired messages (TTL exceeded).
      // Prefer payload.queued_at when present; fall back to PGMQ's enqueued_at
      // which is always set by the queue.
      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          // If dlqSuccess is false, the source message remains retryable and will be handled by VT.
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`)
        // If dlqSuccess is false, the source message remains retryable and will be handled by VT.
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      const { data: alreadySent } = await supabase
        .from('email_send_log')
        .select('id')
        .eq('message_id', messageId)
        .eq('status', 'sent')
        .maybeSingle()

      if (alreadySent) {
        console.warn('Skipping duplicate send (already sent)', {
          queue,
          msg_id: msg.msg_id,
          message_id: messageId,
        })
        const { error: dupDelError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (dupDelError) {
          console.error('Failed to delete duplicate message from queue', { queue, msg_id: msg.msg_id, error: dupDelError })
        }
        continue
      }

      // Issue 2 fix: skip Brevo messages while provider is disabled for this
      // batch (e.g. after a 403). Leave them under VT for retry next cycle.
      if (payload.provider === 'brevo' && brevoDisabled) {
        console.warn('Brevo disabled for this batch (403 received); deferring message', {
          queue,
          msg_id: msg.msg_id,
          message_id: messageId,
        })
        continue
      }

      // Issue 1 fix: skip Brevo messages while the per-invocation cooldown is
      // active (set after a 429). Leave them under VT for retry next cycle.
      if (payload.provider === 'brevo' && Date.now() < brevoRateLimitedUntil) {
        console.warn('Brevo cooldown active; deferring message', {
          queue,
          msg_id: msg.msg_id,
          message_id: messageId,
          cooldown_until: new Date(brevoRateLimitedUntil).toISOString(),
        })
        continue
      }

      try {
        if (payload.provider === 'brevo') {
          // sendViaBrevo now extracts all metadata implicitly
          await sendViaBrevo(
            payload.to as string,
            payload.recipient_name as string | null,
            payload.subject as string,
            payload.html as string,
            {
              idempotencyKey: (payload.idempotency_key as string) ?? null,
              messageId: messageId,
              unsubscribeToken: (payload.unsubscribe_token as string) ?? null,
              text: (payload.text as string) ?? null,
            }
          )
        } else {
          await sendLovableEmail(
            {
              run_id: payload.run_id,
              to: payload.to,
              from: payload.from,
              sender_domain: payload.sender_domain,
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
              purpose: payload.purpose,
              label: payload.label,
              idempotency_key: payload.idempotency_key,
              unsubscribe_token: payload.unsubscribe_token,
              message_id: messageId,
            },
            // sendUrl is optional — when LOVABLE_SEND_URL is not set, the library
            // falls back to the default Lovable API endpoint (https://api.lovable.dev).
            // Set LOVABLE_SEND_URL as a Supabase secret to override (e.g. for local dev).
            { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
          )
        }

        // Log successful send
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
        })

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete sent message from queue', { queue, msg_id: msg.msg_id, error: delError })
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          // Log the rate-limit event.
          const { error: rateLimitLogError } = await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })

          if (rateLimitLogError) {
            console.error('Failed to log rate_limited event', {
              queue,
              msg_id: msg.msg_id,
              message_id: messageId,
              error: rateLimitLogError,
            })
          }

          if (payload.provider === 'brevo') {
            // Issue 1 fix — Brevo 429:
            // Establish a Brevo-only cooldown for the remainder of this
            // invocation. Use the existing helper which reads
            // BrevoError.retryAfterSeconds. Fall back to a bounded 60 s
            // default when no Retry-After header was provided.
            const retryAfterSecs = getRetryAfterSeconds(error) // already reads retryAfterSeconds
            const cooldownSeconds = Math.max(1, retryAfterSecs)
            brevoRateLimitedUntil = Date.now() + cooldownSeconds * 1000

            // Persist the durable Brevo cooldown using the RPC
            const { data: effectiveCooldown, error: durableCooldownError } = await supabase.rpc('set_provider_cooldown', {
              p_provider: 'brevo',
              p_retry_after_until: new Date(brevoRateLimitedUntil).toISOString(),
            })

            if (durableCooldownError) {
              console.error('Failed to persist durable Brevo cooldown:', durableCooldownError)
            } else if (effectiveCooldown) {
              const parsedEffective = Date.parse(effectiveCooldown)
              if (!Number.isNaN(parsedEffective) && Number.isFinite(parsedEffective)) {
                brevoRateLimitedUntil = Math.max(brevoRateLimitedUntil, parsedEffective)
              }
            }

            // Explicitly consume retry budget for the message that caused the 429
            const { error: failLogError } = await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: payload.label || queue,
              recipient_email: payload.to,
              status: 'failed',
              error_message: `brevo_429: ${errorMsg.slice(0, 950)}`,
            })
            if (failLogError) {
              console.error('Failed to log actual failed attempt for Brevo 429', {
                queue,
                msg_id: msg.msg_id,
                message_id: messageId,
                error: failLogError,
              })
            }
            failedAttemptsByMessageId.set(messageId, failedAttempts + 1)

            // Do NOT update global email_send_state. Do NOT stop the batch.
            // Remaining messages stay under VT; next invocation retries Brevo.
          } else {
            // Non-Brevo 429: update the global cooldown and stop this batch.
            const retryAfterSecs = getRetryAfterSeconds(error)
            await supabase
              .from('email_send_state')
              .update({
                retry_after_until: new Date(
                  Date.now() + retryAfterSecs * 1000
                ).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', 1)

            // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
            return new Response(
              JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
              { headers: { 'Content-Type': 'application/json' } }
            )
          }
        } else if (isForbidden(error)) {
          // Issue 2 fix — Brevo 403:
          // Move the failing message to DLQ using the existing mechanism.
          const dlqSuccess = await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000))

          if (!dlqSuccess) {
            const { error: failedLogError } = await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: payload.label || queue,
              recipient_email: payload.to,
              status: 'failed',
              error_message: `dlq_transfer_failed: ${errorMsg.slice(0, 950)}`,
            })

            if (failedLogError) {
              console.error('Failed to log DLQ transfer failure', {
                queue,
                msg_id: msg.msg_id,
                message_id: messageId,
                error: failedLogError,
              })
            }

            failedAttemptsByMessageId.set(messageId, failedAttempts + 1)
          }

          if (payload.provider === 'brevo') {
            // Even if DLQ transfer fails, Brevo is disabled for this invocation because the provider returned 403.
            // The failed message remains in the source queue for VT retry.
            brevoDisabled = true
          }
          // Lovable messages and other providers continue normally.
        } else {
          // Log non-429 failures to track real retry attempts.
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'failed',
            error_message: errorMsg.slice(0, 1000),
          })
          failedAttemptsByMessageId.set(messageId, failedAttempts + 1)

          // Non-429 errors: message stays invisible until VT expires, then retried
        }
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
