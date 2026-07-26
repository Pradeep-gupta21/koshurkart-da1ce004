import { ChatProvider, ChatWindow } from "@/components/chat";
import { useMemo, useRef } from "react";
import { AIClient } from "@/lib/ai";
import { AIService } from "@/ai/services/ai.service";
import { createGroqProvider } from "@/ai/providers/groq.provider";
import type { AgentChatPayload, AgentStreamEvent } from "@/lib/ai";
import { ADMIN_LITE_SYSTEM_PROMPT } from "@/ai/prompts/admin-lite.system";
import { createAdminAgent } from "@/ai/agents/admin.agent";
import { ToolRegistry } from "@/ai/tools/registry";
import { ToolExecutor } from "@/ai/tools/executor";
import { CommerceToolRegistrar } from "@/ai/tools/commerce/registration/CommerceToolRegistrar";
import { createConversationMemory, InMemoryStore } from "@/ai/memory";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { useAuth } from "@/hooks/useAuth";

/**
 * Creates a LocalGroqClient whose ToolExecutor context factory closes over
 * a mutable ref so `userId` is always the latest authenticated value.
 */
function createLocalGroqClient(userIdRef: React.RefObject<string | undefined>) {
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);

  const services = {
    product: ServiceFactory.getProductService(),
    cart: ServiceFactory.getCartService(),
    wishlist: ServiceFactory.getWishlistService(),
    order: ServiceFactory.getOrderService(),
    customer: ServiceFactory.getCustomerService(),
  };

  const agent = createAdminAgent({
    systemPrompt: ADMIN_LITE_SYSTEM_PROMPT,
    historyWindow: 10,
    reflectionEnabled: false,
    compactAfterTurn: false,
    dependencies: {
      ai: new AIService({
        provider: createGroqProvider({
          apiKey: import.meta.env.VITE_GROQ_API_KEY ?? "",
        }),
      }),
      tools: registry,
      executor: new ToolExecutor(registry, () => ({
        services,
        audience: "admin" as const,
        userId: userIdRef.current,
      })),
      memory: {
        conversation: createConversationMemory({ store: new InMemoryStore() }),
      },
      services,
    },
  });

  return new (class extends AIClient {
    async *streamChat(
      payload: AgentChatPayload,
      signal: AbortSignal
    ): AsyncGenerator<AgentStreamEvent, void, unknown> {
      const invocation = {
        conversationId: "local-os-session",
        userId: userIdRef.current,
        signal,
      };

      for await (const event of agent.streamTurn(payload.message, invocation)) {
        // @ts-ignore — AgentStreamEvent is a superset of the base events
        yield event;
      }
    }
  })();
}

/**
 * AI Operating System page — chat interface for the admin AI agent.
 *
 * Uses a lightweight system prompt (admin-lite) instead of the full
 * knowledge-embedded admin prompt, to stay within Groq's 12,000-token
 * context limit. The model is instructed to use registered commerce
 * tools for product/catalog/commerce queries.
 */
export default function AIOperatingSystemPage() {
  const { user } = useAuth();
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;

  const groqClient = useMemo(() => createLocalGroqClient(userIdRef), []);

  return (
    <div className="h-[calc(100vh-64px)] w-full flex flex-col bg-background">
      <ChatProvider audience="admin" title="AI Operating System" client={groqClient}>
        <ChatWindow placeholder="Ask the AI OS anything..." />
      </ChatProvider>
    </div>
  );
}
