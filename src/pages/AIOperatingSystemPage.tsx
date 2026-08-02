import { ChatProvider, ChatWindow } from "@/components/chat";
import { useMemo } from "react";
import { AIClient } from "@/lib/ai";

/**
 * AI Operating System page — chat interface for the admin AI agent.
 *
 * Routes all AI requests through the `ai-chat` Supabase edge function
 * (via the default SupabaseTransport). The server-side edge function holds
 * the AI provider API key — NO secret is shipped to the browser.
 *
 * Audit C-1: removed direct GroqProvider instantiation that exposed
 * `VITE_GROQ_API_KEY` in the client bundle.
 */
export default function AIOperatingSystemPage() {
  const client = useMemo(() => new AIClient(), []);

  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col bg-background">
      <ChatProvider audience="admin" title="AI Operating System" client={client}>
        <ChatWindow placeholder="Ask the AI OS anything..." />
      </ChatProvider>
    </div>
  );
}
