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
  const payload = data as { ok?: boolean; provider?: string; clientVerify?: boolean; error?: string };
  if (payload?.error) throw new Error(payload.error);

  // Supabase provider: client must call verifyOtp to set session.
  if (payload?.clientVerify) {
    const { error: vErr } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    if (vErr) throw new Error(vErr.message);
  }
  return payload;
}
