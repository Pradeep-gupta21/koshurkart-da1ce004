/**
 * KoshurKart — Supabase AI transport
 * =================================================================
 * The default, production `AIChatTransport`: it POSTs a chat turn to the
 * `ai-chat` Supabase edge function and returns the streamed response body.
 *
 * This is the ONLY frontend file that knows the backend endpoint exists. It
 * follows the repo's established edge-function calling convention (raw `fetch`
 * against `${VITE_SUPABASE_URL}/functions/v1/...` with the anon `apikey` plus
 * a bearer token), but uses the *authenticated user's* access token — the
 * `ai-chat` function verifies the caller via `auth.getUser()`, so the anon key
 * alone is not enough.
 *
 * It does not parse SSE or interpret events; that stays in the client layer.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AgentChatPayload } from "./types";
import { AITransportError, type AIChatTransport } from "./transport";

/** Tunables for the Supabase transport (all optional; sensible defaults). */
export interface SupabaseAIChatTransportConfig {
  /** Override the edge-function name. Defaults to `"ai-chat"`. */
  functionName?: string;
  /** Override the base functions URL. Defaults to the Vite env value. */
  baseUrl?: string;
  /** Override the anon key sent as `apikey`. Defaults to the Vite env value. */
  anonKey?: string;
}

const DEFAULT_FUNCTION = "ai-chat";

/**
 * Build the default Supabase-backed transport. Reads the current session for
 * the bearer token on each call, so it always uses a fresh (auto-refreshed)
 * access token.
 */
export function createSupabaseAIChatTransport(
  config: SupabaseAIChatTransportConfig = {},
): AIChatTransport {
  const functionName = config.functionName ?? DEFAULT_FUNCTION;
  const baseUrl =
    config.baseUrl ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const anonKey =
    config.anonKey ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

  return {
    id: "supabase-edge",

    async openChatStream(
      payload: AgentChatPayload,
      signal: AbortSignal,
    ): Promise<ReadableStream<Uint8Array>> {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw new AITransportError(
          `Failed to read auth session: ${error.message}`,
        );
      }
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new AITransportError("You must be signed in to chat.", 401);
      }

      const response = await fetch(`${baseUrl}/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const detail = await safeErrorDetail(response);
        throw new AITransportError(
          detail ?? `AI request failed (${response.status})`,
          response.status,
        );
      }

      if (!response.body) {
        throw new AITransportError("AI response had no body to stream.");
      }

      return response.body;
    },
  };
}

/** Best-effort extraction of a server error message; never throws. */
async function safeErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
