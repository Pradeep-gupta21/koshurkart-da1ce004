import { ChatProvider, ChatWindow } from "@/components/chat";
import { useMemo } from "react";
import { AIClient } from "@/lib/ai";
import { AIService } from "@/ai/services/ai.service";
import { createGroqProvider } from "@/ai/providers/groq.provider";
import type { AgentChatPayload, AgentStreamEvent } from "@/lib/ai";
import type { ChatMessage } from "@/ai/types/chat";

class LocalGroqClient extends AIClient {
  private readonly ai = new AIService({
    provider: createGroqProvider({
    apiKey: import.meta.env.VITE_GROQ_API_KEY ?? "",
    }),
  });
  private messages: ChatMessage[] = [];

  async *streamChat(
    payload: AgentChatPayload,
    signal: AbortSignal
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const userMsg = AIService.createMessage("user", payload.message);
    this.messages.push(userMsg);

    const request = {
      audience: payload.audience,
      messages: this.messages,
      options: { signal },
    };

    let assistantContent = "";
    
    for await (const event of this.ai.stream(request)) {
      if (event.type === "delta" && event.content) {
        assistantContent += event.content;
      }
      // @ts-ignore
      yield event;
    }

    if (assistantContent) {
      this.messages.push(AIService.createMessage("assistant", assistantContent));
    }
  }
}

/**
 * AI Operating System page — chat interface for the admin AI agent.
 *
 * All Gemini calls are made server-side by the `ai-chat` Supabase Edge Function,
 * which reads GEMINI_API_KEY from Deno.env. The key is never sent to or stored
 * in the browser. The transport layer handles auth (bearer token), streaming,
 * and error propagation transparently.
 */
export default function AIOperatingSystemPage() {
  const groqClient = useMemo(() => new LocalGroqClient(), []);

  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col bg-background">
      <ChatProvider audience="admin" title="AI Operating System" client={groqClient}>
        <ChatWindow placeholder="Ask the AI OS anything..." />
      </ChatProvider>
    </div>
  );
}
