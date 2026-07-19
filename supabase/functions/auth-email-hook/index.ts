import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { parseEmailWebhookPayload } from 'npm:@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from 'npm:@lovable.dev/webhooks-js'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { normalizeRpcError } from "../../../src/shared/rpcErrorNormalizer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "Koshur Kart"
const SENDER_DOMAIN = "notify.notify.koshurkart.shop"
const ROOT_DOMAIN = "notify.koshurkart.shop"
const FROM_DOMAIN = "notify.notify.koshurkart.shop" // Domain shown in From address (may be root or sender subdomain)
const PRODUCTION_AUTH_CALLBACK_URL = "https://koshurkart.shop/auth/callback"

// Sample data for preview mode ONLY (not used in actual email sending).
// Uses the production site URL so previews never expose dev/preview domains.
const SAMPLE_PROJECT_URL = "https://koshurkart.shop"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: PRODUCTION_AUTH_CALLBACK_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: PRODUCTION_AUTH_CALLBACK_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: PRODUCTION_AUTH_CALLBACK_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: PRODUCTION_AUTH_CALLBACK_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: PRODUCTION_AUTH_CALLBACK_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

function productionAuthUrl(rawUrl?: string): string {
  if (!rawUrl) return PRODUCTION_AUTH_CALLBACK_URL

  try {
    const url = new URL(rawUrl)
    const redirectParamNames = ['redirect_to', 'redirectTo', 'emailRedirectTo']

    if (url.pathname.includes('/auth/v1/verify')) {
      const callback = new URL(PRODUCTION_AUTH_CALLBACK_URL)
      url.searchParams.forEach((value, key) => {
        if (!redirectParamNames.includes(key)) callback.searchParams.set(key, value)
      })
      return callback.toString()
    }

    for (const param of redirectParamNames) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, PRODUCTION_AUTH_CALLBACK_URL)
      }
    }

    if (
      url.hostname.endsWith('.lovable.app') ||
      url.hostname.endsWith('.lovableproject.com') ||
      url.hostname === 'localhost' ||
      url.pathname === '/auth/callback'
    ) {
      const callback = new URL(PRODUCTION_AUTH_CALLBACK_URL)
      callback.search = url.search
      callback.hash = url.hash
      return callback.toString()
    }

    return url.toString()
  } catch (_error) {
    return PRODUCTION_AUTH_CALLBACK_URL
  }
}

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.UNAUTHORIZED, 'Unauthorized', false), { ...previewCorsHeaders, 'Content-Type': 'application/json' })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch (error) {
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, 'Invalid JSON in request body', false), { ...previewCorsHeaders, 'Content-Type': 'application/json' })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]

  if (!EmailTemplate) {
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, `Unknown email type: ${type}`, false), { ...previewCorsHeaders, 'Content-Type': 'application/json' })
  }

  const sampleData = SAMPLE_DATA[type] || {}
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData))

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// Webhook handler - verifies signature and sends email
async function handleWebhook(req: Request): Promise<Response> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')

  if (!apiKey) {
    console.error('LOVABLE_API_KEY not configured')
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, 'Server configuration error', false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }

  // Verify signature + timestamp, then parse payload.
  let payload: any
  let run_id = ''
  try {
    const verified = await verifyWebhookRequest({
      req,
      secret: apiKey,
      parser: parseEmailWebhookPayload,
    })
    payload = verified.payload
    run_id = payload.run_id
  } catch (error) {
    if (error instanceof WebhookError) {
      switch (error.code) {
        case 'invalid_signature':
        case 'missing_timestamp':
        case 'invalid_timestamp':
        case 'stale_timestamp':
          console.error('Invalid webhook signature', { error: error.message })
          return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, 'Invalid signature', false), { ...corsHeaders, 'Content-Type': 'application/json' })
        case 'invalid_payload':
        case 'invalid_json':
          console.error('Invalid webhook payload', { error: error.message })
          return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, 'Invalid webhook payload', false), { ...corsHeaders, 'Content-Type': 'application/json' })
      }
    }

    console.error('Webhook verification failed', { error })
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, 'Invalid webhook payload', false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }

  if (!run_id) {
    console.error('Webhook payload missing run_id')
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, 'Invalid webhook payload', false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }

  if (payload.version !== '1') {
    console.error('Unsupported payload version', { version: payload.version, run_id })
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, `Unsupported payload version: ${payload.version}`, false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }

  // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
  // payload.type is the hook event type ("auth")
  const emailType = payload.data.action_type
  console.log('Received auth event', { emailType, email: payload.data.email, run_id })

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', { emailType, run_id })
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, `Unknown email type: ${emailType}`, false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }

  // Build template props from payload.data (HookData structure)
  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: 'https://koshurkart.shop',
    recipient: payload.data.email,
    confirmationUrl: productionAuthUrl(payload.data.url),
    token: payload.data.token,
    email: payload.data.email,
    oldEmail: payload.data.old_email,
    newEmail: payload.data.new_email,
  }

  // Render React Email to HTML and plain text
  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  })

  // Multi-provider fallback chain:
  //   1) Resend (direct API) — primary, uses verified koshurkart.shop domain
  //   2) Lovable email queue (pgmq auth_emails -> process-email-queue) — backup
  // If both fail, return 502 so Supabase Auth retries the hook.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const messageId = crypto.randomUUID()
  const subject = EMAIL_SUBJECTS[emailType] || 'Notification'
  const fromAddress = `${SITE_NAME} <noreply@koshurkart.shop>`

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: payload.data.email,
    status: 'pending',
  })

  // --- Provider 1: Resend (direct) ---
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  let resendError: string | null = null

  if (resendApiKey) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [payload.data.email],
          subject,
          html,
          text,
          headers: { 'X-Entity-Ref-ID': messageId },
        }),
      })

      if (resendRes.ok) {
        const resendData = await resendRes.json().catch(() => ({} as any))
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          status: 'sent',
        })
        console.log('Auth email sent via Resend', {
          emailType, email: payload.data.email, run_id, resendId: resendData?.id, from: fromAddress,
        })
        return new Response(
          JSON.stringify({ success: true, sent: true, provider: 'resend', id: resendData?.id }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const errText = await resendRes.text()
      resendError = `Resend ${resendRes.status}: ${errText.slice(0, 400)}`
      console.error('Resend send failed, will try fallback', { status: resendRes.status, errText, run_id, emailType })
    } catch (err) {
      resendError = `Resend exception: ${err instanceof Error ? err.message : String(err)}`
      console.error('Resend threw, will try fallback', { err, run_id })
    }
  } else {
    resendError = 'RESEND_API_KEY not configured'
    console.warn('RESEND_API_KEY missing, falling back to Lovable queue', { run_id })
  }

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: payload.data.email,
    status: 'failed',
    error_message: resendError,
  })

  // --- Provider 2: Lovable email queue (backup) ---
  const fallbackMessageId = crypto.randomUUID()
  try {
    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        run_id,
        message_id: fallbackMessageId,
        to: payload.data.email,
        from: fromAddress,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'auth',
        label: emailType,
        idempotency_key: `auth-${emailType}-${run_id}`,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) throw enqueueError

    console.log('Auth email enqueued to Lovable backup queue', {
      emailType, email: payload.data.email, run_id, fallbackMessageId,
    })
    return new Response(
      JSON.stringify({
        success: true,
        sent: false,
        queued: true,
        provider: 'lovable-queue',
        primary_error: resendError,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const fallbackError = err instanceof Error ? err.message : String(err)
    console.error('Both Resend and Lovable queue failed', { resendError, fallbackError, run_id })
    await supabase.from('email_send_log').insert({
      message_id: fallbackMessageId,
      template_name: emailType,
      recipient_email: payload.data.email,
      status: 'failed',
      error_message: `Fallback enqueue failed: ${fallbackError.slice(0, 400)}`,
    })
    return respondWithError(new PaymentError(ErrorCategory.GATEWAY_ERROR, ERROR_CODES.INTERNAL_ERROR, 'All email providers failed', false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for main endpoint
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  // Main webhook handler
  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, message, false), { ...corsHeaders, 'Content-Type': 'application/json' })
  }
})
