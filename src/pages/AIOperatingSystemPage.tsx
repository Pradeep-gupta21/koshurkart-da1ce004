import { useMemo } from "react";
import { ChatProvider, ChatWindow } from "@/components/chat";
import { AIClient } from "@/lib/ai";
import { AIService } from "@/ai/services/ai.service";
import { createGeminiProvider } from "@/ai/providers/gemini.provider";
import type { AgentChatPayload, AgentStreamEvent } from "@/lib/ai";
import type { ChatMessage } from "@/ai/types/chat";

class LocalGeminiClient extends AIClient {
  private readonly ai = new AIService({
    provider: createGeminiProvider({
      apiKey: import.meta.env.VITE_GEMINI_API_KEY ?? "",
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

export default function AIOperatingSystemPage() {
  const geminiClient = useMemo(() => new LocalGeminiClient(), []);

  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col bg-background">
      <ChatProvider audience="admin" title="AI Operating System" client={geminiClient}>
        <ChatWindow placeholder="Ask the AI OS anything..." />
      </ChatProvider>
    </div>
  );
}
