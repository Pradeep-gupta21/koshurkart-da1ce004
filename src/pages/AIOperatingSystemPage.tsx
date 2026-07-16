import { ChatProvider, ChatWindow } from "@/components/chat";
import { defaultAIClient } from "@/lib/ai";

/**
 * AI Operating System page — chat interface for the admin AI agent.
 *
 * All Gemini calls are made server-side by the `ai-chat` Supabase Edge Function,
 * which reads GEMINI_API_KEY from Deno.env. The key is never sent to or stored
 * in the browser. The transport layer handles auth (bearer token), streaming,
 * and error propagation transparently.
 */
export default function AIOperatingSystemPage() {
  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col bg-background">
      <ChatProvider audience="admin" title="AI Operating System" client={defaultAIClient()}>
        <ChatWindow placeholder="Ask the AI OS anything..." />
      </ChatProvider>
    </div>
  );
}
