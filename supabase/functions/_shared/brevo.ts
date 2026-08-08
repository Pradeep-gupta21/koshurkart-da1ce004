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

export async function brevoSend(payload: Record<string, unknown>) {
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

export async function sendViaBrevo(to: string, name: string | null, subject: string, html: string) {
  return brevoSend({
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to, name: name ?? undefined }],
    subject,
    htmlContent: html,
  });
}
