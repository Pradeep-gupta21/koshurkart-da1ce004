import { useMemo } from "react";
import { ChatProvider, ChatWindow } from "@/components/chat";
import { AIClient } from "@/lib/ai";
import { AIService } from "@/ai/services/ai.service";
import { createMockProvider } from "@/ai/providers/mock.provider";
import type { AgentChatPayload, AgentStreamEvent } from "@/lib/ai";
import type { ChatMessage } from "@/ai/types/chat";

class LocalMockClient extends AIClient {
  private readonly ai = new AIService({ provider: createMockProvider() });
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
  const mockClient = useMemo(() => new LocalMockClient(), []);

  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col bg-background">
      <ChatProvider audience="admin" title="AI Operating System" client={mockClient}>
        <ChatWindow placeholder="Ask the AI OS anything..." />
      </ChatProvider>
    </div>
  );
}
