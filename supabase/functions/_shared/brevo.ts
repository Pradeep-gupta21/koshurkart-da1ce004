const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") ?? "no-reply@koshurkart.in";
const FROM_NAME = Deno.env.get("BREVO_FROM_NAME") ?? "Koshur Kart";

export class BrevoError extends Error {
  public provider = "brevo";
  public status: number;
  public retryAfterSeconds: number | null;

  constructor(status: number, retryAfter: string | null, message: string) {
    super(message);
    this.name = "BrevoError";
    this.status = status;
    
    this.retryAfterSeconds = null;
    if (retryAfter) {
      if (/^-?\d+(\.\d+)?$/.test(retryAfter)) {
        const val = Number(retryAfter);
        if (Number.isFinite(val) && Number.isInteger(val) && val >= 0 && Number.isSafeInteger(val)) {
          this.retryAfterSeconds = val;
        }
      } else {
        const date = new Date(retryAfter);
        if (!Number.isNaN(date.getTime())) {
          const secs = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
          if (Number.isFinite(secs) && Number.isInteger(secs) && Number.isSafeInteger(secs)) {
            this.retryAfterSeconds = secs;
          }
        }
      }
    }
  }
}

export async function brevoSend(payload: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  if (!lovableKey || !brevoKey) throw new Error("Missing Brevo gateway credentials");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${GATEWAY_URL}/smtp/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": brevoKey,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      const retryAfter = res.headers.get("Retry-After");
      throw new BrevoError(res.status, retryAfter, `Brevo ${res.status}: ${text.slice(0, 500)}`);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new BrevoError(408, null, "Brevo request timed out after 15000ms");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Optional delivery metadata forwarded from the queue payload.
 * All fields are optional; absent/null values produce no headers or body fields.
 */
export interface BrevoSendOptions {
  /** Forwarded as the HTTP `Idempotency-Key` header to deduplicate retries. */
  idempotencyKey?: string | null;
  /** Forwarded as `headers["X-Message-Id"]` in the request body for tracing. */
  messageId?: string | null;
  /**
   * Raw unsubscribe token from the queue payload.
   * Forwarded as `headers["X-Unsubscribe-Token"]` — the raw token value only;
   * no List-Unsubscribe URL format is assumed by this transport.
   */
  unsubscribeToken?: string | null;
  /** Plain-text alternative body, forwarded as `textContent` when present. */
  text?: string | null;
}

export function sendViaBrevo(
  to: string,
  name: string | null,
  subject: string,
  html: string,
  opts: BrevoSendOptions = {}
) {
  // Build optional per-message email headers (Brevo body "headers" field).
  const emailHeaders: Record<string, string> = {};
  if (opts.messageId) {
    emailHeaders["X-Message-Id"] = opts.messageId;
  }
  if (opts.unsubscribeToken) {
    emailHeaders["X-Unsubscribe-Token"] = opts.unsubscribeToken;
  }

  // Build optional HTTP request headers.
  const requestHeaders: Record<string, string> = {};
  if (opts.idempotencyKey) {
    requestHeaders["Idempotency-Key"] = opts.idempotencyKey;
  }

  const payload: Record<string, unknown> = {
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to, name: name ?? undefined }],
    subject,
    htmlContent: html,
  };
  if (opts.text) {
    payload.textContent = opts.text;
  }
  if (Object.keys(emailHeaders).length > 0) {
    payload.headers = emailHeaders;
  }

  return brevoSend(payload, requestHeaders);
}
