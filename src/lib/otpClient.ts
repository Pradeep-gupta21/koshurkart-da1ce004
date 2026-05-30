import { supabase } from "@/integrations/supabase/client";

export async function sendOtp(phone: string) {
  const { data, error } = await supabase.functions.invoke("otp-send", { body: { phone } });
  if (error) throw new Error(error.message || "Failed to send code");
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as { ok: true; provider: string };
}

export async function verifyOtp(phone: string, code: string) {
  const { data, error } = await supabase.functions.invoke("otp-verify", { body: { phone, code } });
  if (error) throw new Error(error.message || "Verification failed");
  const payload = data as {
    ok?: boolean;
    provider?: string;
    token_hash?: string;
    type?: "magiclink";
    error?: string;
  };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.token_hash) throw new Error("Server did not return a session token");

  // Exchange the magic-link token for a real Supabase session
  const { error: vErr } = await supabase.auth.verifyOtp({
    token_hash: payload.token_hash,
    type: "magiclink",
  });
  if (vErr) throw new Error(vErr.message);

  return payload;
}
