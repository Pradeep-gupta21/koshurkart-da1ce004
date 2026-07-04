import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const WhatsAppFloatingButton = () => {
  const { pathname } = useLocation();

  // Customer-facing only — exclude vendor and admin dashboards.
  if (pathname.startsWith("/vendor") || pathname.startsWith("/admin")) {
    return null;
  }

  const number = import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER as string | undefined;
  if (!number || number === "REPLACE_WITH_WHATSAPP_NUMBER") {
    return null;
  }

  const href = `https://wa.me/${number}?text=${encodeURIComponent(
    "Hi KoshurKart, I need some assistance.",
  )}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contact KoshurKart support on WhatsApp"
          className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-40 w-14 h-14 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 shadow-lg transition-transform duration-200 hover:scale-110"
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="left">Chat with support on WhatsApp</TooltipContent>
    </Tooltip>
  );
};

export default WhatsAppFloatingButton;
