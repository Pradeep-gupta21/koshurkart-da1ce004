// Central support contact helpers.
// Reads the WhatsApp number from VITE_SUPPORT_WHATSAPP_NUMBER — never hardcode.
export const SUPPORT_EMAIL = "support@koshurkart.shop";

export function getSupportWhatsAppNumber(): string | null {
  const n = import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER as string | undefined;
  if (!n || n === "REPLACE_WITH_WHATSAPP_NUMBER") return null;
  return n;
}

export function buildWhatsAppUrl(message: string): string {
  const number = getSupportWhatsAppNumber();
  if (!number) return "#";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
